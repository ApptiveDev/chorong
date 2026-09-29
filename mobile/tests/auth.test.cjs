const assert = require('node:assert/strict');
const { test } = require('node:test');
const { AxiosError } = require('axios');

const user = { userId: 7, email: 'test@example.invalid', nickname: null, providers: ['PASSWORD'] };
const credentials = { email: '  test@example.invalid  ', password: 'test-password' };
const tokens = (version = 0) => ({
  accessToken: `access-${version}`,
  refreshToken: `refresh-${version}`,
  expiresIn: 1800,
  created: false,
});
const reply = (config, data = {}, status = 200) => ({
  config,
  data,
  status,
  statusText: '',
  headers: {},
});
const fail = (config, status = 401, message = '인증 실패') => {
  throw new AxiosError(message, 'ERR_BAD_RESPONSE', config, {}, reply(config, { message }, status));
};
const body = (config) => (typeof config.data === 'string' ? JSON.parse(config.data) : config.data);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function setup(handle = () => undefined) {
  for (const file of ['../.expo/auth-tests/auth.js', '../.expo/auth-tests/api.js']) {
    delete require.cache[require.resolve(file)];
  }
  const { api, notesApi, healthApi } = require('../.expo/auth-tests/api.js');
  const { auth } = require('../.expo/auth-tests/auth.js');
  const calls = [];
  api.defaults.adapter = async (config) => {
    calls.push({ url: config.url, token: config.headers.get('Authorization'), data: body(config) });
    const result = await handle(config);
    if (result !== undefined) return result;
    if (config.url.startsWith('/api/auth/password/')) return reply(config, tokens());
    if (config.url === '/api/auth/me') return reply(config, user);
    if (config.url === '/api/auth/logout') return reply(config, undefined, 204);
    throw new Error(`Unexpected request: ${config.url}`);
  };
  return { api, auth, calls, notesApi, healthApi };
}

test('email login loads the user and stores no tokens in the UI snapshot', async () => {
  const { auth, calls } = setup();
  await auth.login(credentials);
  assert.deepEqual(calls[0].data, {
    email: credentials.email.trim(),
    password: credentials.password,
  });
  assert.equal(calls[0].token, undefined);
  assert.equal(calls[1].token, 'Bearer access-0');
  assert.deepEqual(auth.getSnapshot().user, user);
  assert.equal(auth.getSnapshot().authenticated, true);
  assert.equal(JSON.stringify(auth.getSnapshot()).includes('refresh-0'), false);
});

test('test account signup uses the existing signup API and then me', async () => {
  const { auth, calls } = setup();
  await auth.signup(credentials);
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/api/auth/password/signup', '/api/auth/me'],
  );
});

test('login and signup errors never trigger refresh', async () => {
  for (const action of ['login', 'signup']) {
    const { auth, calls } = setup((config) =>
      fail(config, action === 'login' ? 401 : 409, '요청 거절'),
    );
    await assert.rejects(auth[action](credentials));
    assert.equal(calls.length, 1);
    assert.equal(auth.getSnapshot().authenticated, false);
    assert.equal(auth.getSnapshot().error, '요청 거절');
  }
});

test('public health and note requests remain anonymous while logged in', async () => {
  const { auth, notesApi, healthApi, calls } = setup((config) => {
    if (config.url === '/api/health') return reply(config, { status: 'ok' });
    if (config.url.startsWith('/api/notes')) return reply(config, []);
  });
  await auth.login(credentials);
  assert.equal(await healthApi.check(), 'ok');
  await notesApi.list();
  await notesApi.create('test');
  await notesApi.remove(1);
  assert.ok(calls.slice(2).every((call) => call.token === undefined));
});

test('concurrent and late 401s share one rotation even when the access JWT is unchanged', async () => {
  const rotating = deferred();
  const releaseRefresh = deferred();
  const releaseLate401 = deferred();
  let refreshCount = 0;
  const { api, auth } = setup(async (config) => {
    if (config.url === '/api/auth/refresh') {
      refreshCount++;
      assert.equal(body(config).refreshToken, 'refresh-0');
      assert.equal(config.headers.get('Authorization'), undefined);
      rotating.resolve();
      await releaseRefresh.promise;
      return reply(config, { ...tokens(1), accessToken: 'access-0' });
    }
    if (config.url.startsWith('/protected/')) {
      if (config.authRetried) return reply(config, { ok: true });
      if (config.url === '/protected/late') await releaseLate401.promise;
      return fail(config);
    }
  });
  await auth.login(credentials);
  const first = api.get('/protected/first');
  const second = api.get('/protected/second');
  const late = api.get('/protected/late');
  await rotating.promise;
  releaseRefresh.resolve();
  await Promise.all([first, second]);
  releaseLate401.resolve();
  await late;
  assert.equal(refreshCount, 1);
  await auth.logout();
  assert.equal(auth.getSnapshot().authenticated, false);
});

test('manual refresh replaces both tokens and logout revokes the new refresh token', async () => {
  const { api, auth, calls } = setup((config) => {
    if (config.url === '/api/auth/refresh') return reply(config, tokens(1));
  });
  await auth.login(credentials);
  await auth.refresh();
  await auth.me();
  assert.equal(calls.at(-1).token, 'Bearer access-1');
  await auth.logout();
  assert.equal(calls.at(-1).data.refreshToken, 'refresh-1');
  assert.equal(auth.getSnapshot().user, null);
  await api.get('/api/auth/me');
  assert.equal(calls.at(-1).token, undefined);
});

test('refresh rejection or network failure clears authentication without a retry loop', async () => {
  for (const networkError of [false, true]) {
    let refreshCount = 0;
    const { api, auth } = setup((config) => {
      if (config.url === '/protected') return fail(config);
      if (config.url === '/api/auth/refresh') {
        refreshCount++;
        if (networkError) throw new AxiosError('Network Error', 'ERR_NETWORK', config);
        return fail(config);
      }
    });
    await auth.login(credentials);
    await assert.rejects(api.get('/protected'), /로그인 갱신에 실패/);
    assert.equal(refreshCount, 1);
    assert.equal(auth.getSnapshot().authenticated, false);
    assert.equal(auth.getSnapshot().user, null);
    if (networkError) assert.match(auth.getSnapshot().error, /네트워크/);
  }
});

test('a protected request is retried only once and a second 401 clears the session', async () => {
  let attempts = 0;
  let refreshCount = 0;
  const { api, auth } = setup((config) => {
    if (config.url === '/protected') {
      attempts++;
      return fail(config);
    }
    if (config.url === '/api/auth/refresh') {
      refreshCount++;
      return reply(config, tokens(1));
    }
  });
  await auth.login(credentials);
  await assert.rejects(api.get('/protected'));
  assert.equal(attempts, 2);
  assert.equal(refreshCount, 1);
  assert.equal(auth.getSnapshot().authenticated, false);
});

test('logout with an expired access token retries with the rotated refresh token', async () => {
  let logoutCount = 0;
  const { auth, calls } = setup((config) => {
    if (config.url === '/api/auth/logout' && ++logoutCount === 1) return fail(config);
    if (config.url === '/api/auth/refresh') return reply(config, tokens(1));
  });
  await auth.login(credentials);
  await auth.logout();
  assert.equal(logoutCount, 2);
  assert.equal(calls.at(-1).token, 'Bearer access-1');
  assert.deepEqual(calls.at(-1).data, { refreshToken: 'refresh-1' });
  assert.equal(auth.getSnapshot().authenticated, false);
});

test('logout network failure preserves the session and can be retried', async () => {
  let offline = true;
  const { auth } = setup((config) => {
    if (config.url === '/api/auth/logout' && offline)
      throw new AxiosError('offline', 'ERR_NETWORK', config);
  });
  await auth.login(credentials);
  await assert.rejects(auth.logout(), /서버 로그아웃을 확인하지 못/);
  assert.equal(auth.getSnapshot().authenticated, true);
  assert.deepEqual(auth.getSnapshot().user, user);
  offline = false;
  await auth.logout();
  assert.equal(auth.getSnapshot().authenticated, false);
});

test('logout waits for an automatic rotation before revoking the latest token', async () => {
  const rotating = deferred();
  const release = deferred();
  const { api, auth, calls } = setup(async (config) => {
    if (config.url === '/protected') {
      if (config.authRetried) return reply(config);
      return fail(config);
    }
    if (config.url === '/api/auth/refresh') {
      rotating.resolve();
      await release.promise;
      return reply(config, tokens(1));
    }
  });
  await auth.login(credentials);
  const request = api.get('/protected').catch(() => undefined);
  await rotating.promise;
  const logout = auth.logout();
  release.resolve();
  await Promise.all([request, logout]);
  assert.equal(
    calls.find((call) => call.url === '/api/auth/logout').data.refreshToken,
    'refresh-1',
  );
  assert.equal(auth.getSnapshot().authenticated, false);
});

test('a late protected response cannot restore data after logout', async () => {
  const started = deferred();
  const release = deferred();
  const { api, auth } = setup(async (config) => {
    if (config.url === '/protected/slow') {
      started.resolve();
      await release.promise;
      return reply(config, user);
    }
  });
  await auth.login(credentials);
  const late = api.get('/protected/slow');
  await started.promise;
  await auth.logout();
  release.resolve();
  await assert.rejects(late, /로그인 상태가 변경/);
  assert.equal(auth.getSnapshot().user, null);
});

test('a failed me request keeps the session available for retry', async () => {
  let offline = true;
  const { auth } = setup((config) => {
    if (config.url === '/api/auth/me' && offline)
      throw new AxiosError('offline', 'ERR_NETWORK', config);
  });
  await assert.rejects(auth.login(credentials), /로그인했지만 내 정보를/);
  assert.equal(auth.getSnapshot().authenticated, true);
  assert.equal(auth.getSnapshot().user, null);
  offline = false;
  await auth.me();
  assert.deepEqual(auth.getSnapshot().user, user);
});
