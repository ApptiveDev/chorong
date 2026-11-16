const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AxiosError } = require('axios');
const {
  IntegrationClient,
  redact,
  integrationBaseURL,
} = require('../.expo/integration-tests/client');
const { createIntegrationApi } = require('../.expo/integration-tests/api');
const { catalog } = require('../.expo/integration-tests/catalog');
const { wallet } = require('../.expo/integration-tests/models');
const contract = require('../.expo/integration-tests/contract');
const {
  mockApi,
  mockSnapshot,
  restoreMockSnapshot,
} = require('../.expo/integration-tests/mockApi');
const { mockVisibility } = require('../.expo/integration-tests/mockVisibility');
const { firstStudyLesson } = require('../.expo/integration-tests/user/welcomeFlow');
const { nicknameValidationError } = require('../.expo/integration-tests/user/profileNickname');
const uuid = '12345678-1234-4234-8234-123456789abc';
const user = { userId: 7, nickname: '시험', status: 'ACTIVE' };
const tokens = { accessToken: 'access-private', refreshToken: 'refresh-private', expiresIn: 3600 };
const me = {
  ...user,
  providers: ['EMAIL'],
  wallet: { stardust: 20, energy: 5, energyResetsAt: '2026-11-12T00:00:00+09:00' },
  progress: { completedLessons: 0, totalLessons: 1 },
  housing: { isPublic: true, likeCount: 0 },
  onboardingCompleted: false,
  pushEnabled: false,
  streakDays: 0,
  lastStudyDate: null,
};
const respond = (config, data, status = 200) => ({
  config,
  data,
  status,
  statusText: '',
  headers: { 'x-request-id': 'request-1' },
});
const fail = (config, status = 401, code = 'AUTH_TOKEN_EXPIRED') => {
  throw new AxiosError(
    'failed',
    'ERR_BAD_REQUEST',
    config,
    null,
    respond(config, { error: { code, message: '요청 실패' } }, status),
  );
};
function setup(persist = false, entries = new Map()) {
  let n = 0;
  const storage = {
    get: async (k) => entries.get(k) ?? null,
    set: async (k, v) => {
      entries.set(k, v);
    },
    remove: async (k) => {
      entries.delete(k);
    },
  };
  const c = new IntegrationClient(
    'https://test.invalid/api/v1',
    storage,
    () => (n++ === 0 ? uuid : `key-${n}`),
    persist,
  );
  return { c, api: createIntegrationApi(c), entries };
}
test('mock social providers accept temporary credentials and open a member session', async () => {
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  for (const provider of ['apple', 'google', 'kakao']) {
    const c = new IntegrationClient(
      'https://mock.invalid/api/v1',
      storage,
      () => uuid,
      false,
      mockApi,
    );
    c.http.defaults.adapter = async () => {
      throw new Error('network request');
    };
    await createIntegrationApi(c).account.oauth(provider, { accessToken: 'arbitrary-input' });
    assert.equal(c.getSnapshot().authenticated, true);
    assert.equal(c.getSnapshot().user.status, 'ACTIVE');
    assert.deepEqual((await createIntegrationApi(c).account.me()).providers, [
      provider.toUpperCase(),
    ]);
  }
});
test('mock API renders linked data without using the HTTP adapter', async () => {
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  const c = new IntegrationClient(
    'https://mock.invalid/api/v1',
    storage,
    () => uuid,
    false,
    mockApi,
  );
  c.http.defaults.adapter = async () => {
    throw new Error('network request');
  };
  const api = createIntegrationApi(c);
  await api.account.login('test@example.com', 'test');
  const user = await api.account.me();
  const { courses } = await api.learning.courses();
  assert.ok(courses.length > 1);
  const detail = await api.learning.course(courses[0].courseId);
  const lesson = await api.learning.lesson(detail.lessons[0].lessonId);
  const start = await api.learning.start(lesson.lessonId, false);
  const housing = await api.room.me();
  const inventory = await api.room.inventory();
  const shop = await api.room.shop();
  const social = await api.social.explore({ sort: 'recent' });
  const visit = await api.social.visit(social.data.housings[0].housingId);
  assert.equal(user.wallet.stardust, 180);
  assert.equal(start.contents[0].contentId, lesson.contents[0].contentId);
  assert.equal(start.contents.at(-1).quiz.quizId, lesson.contents.at(-1).quiz.quizId);
  assert.equal(housing.placements[0].inventoryId, inventory.items[0].inventoryId);
  mockVisibility.set(false);
  assert.equal((await api.room.me()).housing.isPublic, false);
  mockVisibility.set(true);
  assert.equal((await api.room.me()).housing.isPublic, true);
  assert.equal(shop.items[0].itemId, inventory.items[0].itemId);
  assert.equal(visit.housing.housingId, social.data.housings[0].housingId);
  const placed = await api.room.save([
    ...housing.placements.map(({ inventoryId, area, transform }) => ({
      inventoryId,
      area,
      transform,
    })),
    {
      inventoryId: inventory.items[1].inventoryId,
      area: 'INTERIOR',
      transform: { x: 0.6, y: 0.55, rotation: 0, layer: 2 },
    },
  ]);
  assert.equal(placed.placements.length, 2);
  assert.equal((await api.room.inventory()).items[1].placed, true);
  await api.room.save([
    {
      inventoryId: inventory.items[0].inventoryId,
      area: 'INTERIOR',
      transform: housing.placements[0].transform,
    },
  ]);
  assert.equal((await api.room.inventory()).items[1].placed, false);
  const blocked = await api.social.blocks({});
  assert.equal(blocked.data.users[0].userId, 5);
  await api.social.unblock(5);
  assert.equal((await api.social.blocks({})).data.users.length, 0);
  assert.equal(
    c.getSnapshot().traces.every((trace) => trace.success),
    true,
  );
});
test('ten new topics keep course, lesson, card, and quiz IDs linked through the API', async () => {
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  const c = new IntegrationClient(
    'https://mock.invalid/api/v1',
    storage,
    () => uuid,
    false,
    mockApi,
  );
  c.http.defaults.adapter = async () => {
    throw new Error('network request');
  };
  const api = createIntegrationApi(c);
  await api.account.login('test@example.com', 'test');
  const { courses } = await api.learning.courses();
  assert.equal(courses.length, 4);
  const constellation = await api.benefits.constellations();
  assert.equal(constellation.constellations.length, 4);
  const expectedIds = [41, 51, 61, 71, 81, 91, 101, 111, 121, 131];
  const grouped = [];
  const ids = new Set();
  for (const [courseIndex, course] of courses.entries()) {
    const detail = await api.learning.course(course.courseId);
    assert.equal(detail.title, course.title);
    assert.equal(detail.lessons.length, [4, 4, 4, 3][courseIndex]);
    assert.deepEqual(
      detail.lessons.map((lesson) => lesson.order),
      detail.lessons.map((_, index) => index + 1),
    );
    grouped.push(...detail.lessons.map((lesson) => lesson.lessonId));
    for (const summary of detail.lessons.filter((lesson) =>
      expectedIds.includes(lesson.lessonId),
    )) {
      const lessonId = summary.lessonId;
      const lesson = await api.learning.lesson(lessonId);
      const start = await api.learning.start(lessonId, false);
      assert.equal(lesson.courseId, course.courseId);
      assert.deepEqual(start.contents, lesson.contents);
      assert.equal(lesson.contents.filter((content) => content.contentType === 'TEXT').length, 4);
      assert.equal(lesson.contents.at(-1).contentType, 'QUIZ');
      assert.equal(lesson.contents.at(-1).quiz.quizId, lessonId * 10 + 1);
      lesson.contents.forEach((content, index) => {
        assert.equal(content.order, index + 1);
        assert.equal(content.contentId, lessonId * 100 + index + 1);
        assert.equal(ids.has(content.contentId), false);
        ids.add(content.contentId);
        if (content.contentType === 'TEXT') {
          assert.ok(content.body.length >= 60 && content.body.length <= 120);
        }
      });
    }
  }
  assert.deepEqual(
    grouped.filter((id) => expectedIds.includes(id)).sort((a, b) => a - b),
    expectedIds,
  );
  assert.equal(grouped.length, 15);
  assert.equal(ids.size, 50);
});
test('mock empty and error scenarios return without network', async () => {
  const modulePath = require.resolve('../.expo/integration-tests/mockApi');
  const prior = process.env.EXPO_PUBLIC_MOCK_SCENARIO;
  try {
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'empty';
    delete require.cache[modulePath];
    const emptyMock = require(modulePath).mockApi;
    assert.deepEqual(emptyMock('API-401', {}).data.data.courses, []);
    assert.deepEqual(emptyMock('API-801', { query: { sort: 'recent' } }).data.data.housings, []);
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'error';
    delete require.cache[modulePath];
    const errorMock = require(modulePath).mockApi;
    assert.throws(() => errorMock('API-401', {}), /MOCK_ERROR/);
  } finally {
    if (prior === undefined) delete process.env.EXPO_PUBLIC_MOCK_SCENARIO;
    else process.env.EXPO_PUBLIC_MOCK_SCENARIO = prior;
    delete require.cache[modulePath];
  }
});
async function login(c, status = 'ACTIVE') {
  await c.authenticate(async () => ({ ...tokens, user: { ...user, status } }));
}

test('base URL keeps a single version prefix and rejects credential URLs', () => {
  assert.equal(integrationBaseURL('http://localhost:8080/'), 'http://localhost:8080/api/v1');
  assert.equal(integrationBaseURL('https://test.invalid/api/v1/'), 'https://test.invalid/api/v1');
  assert.throws(() => integrationBaseURL('https://password@test.invalid'));
});
test('all 49 APIs are inventoried; unused avatar API remains deferred', async () => {
  assert.equal(Object.keys(catalog).length, 49);
  const { c } = setup();
  let sent = 0;
  c.http.defaults.adapter = async (config) => {
    sent++;
    return respond(config, {});
  };
  const deferred = Object.keys(catalog).filter((id) => catalog[id][3] === 'deferred');
  assert.deepEqual(deferred, ['API-704']);
  for (const id of deferred) await assert.rejects(c.request(id, null), /사용하지 않는 API/);
  assert.equal(sent, 0);
});
test('housing visibility update sends API-703 body and reads housing response', async () => {
  const { c, api } = setup();
  await login(c, 'ACTIVE');
  let request;
  c.http.defaults.adapter = async (config) => {
    request = config;
    return respond(config, {
      data: { housingId: 1, name: '우주선', isPublic: true, likeCount: 0 },
    });
  };
  const housing = await api.room.update({ isPublic: true });
  assert.equal(request.method, 'patch');
  assert.equal(request.url, '/housings/me');
  assert.deepEqual(JSON.parse(request.data), { isPublic: true });
  assert.equal(request.headers.get('Authorization'), `Bearer ${tokens.accessToken}`);
  assert.equal(housing.isPublic, true);
});
test('housing save and batch purchase send PDF bodies and purchase key unchanged', async () => {
  const { c, api } = setup();
  await login(c, 'ACTIVE');
  const calls = [];
  c.http.defaults.adapter = async (config) => {
    calls.push(config);
    if (config.url === '/housings/me/placements')
      return respond(config, { data: { placements: [] } });
    if (config.url === '/shop/purchases')
      return respond(config, {
        data: {
          inventoryItems: [],
          wallet: { stardust: 9, energy: 5, energyResetsAt: '2026-11-12T00:00:00+09:00' },
        },
      });
    throw new Error(`unexpected ${config.url}`);
  };
  const placements = [
    {
      inventoryId: 'owned-1',
      area: 'INTERIOR',
      transform: { x: 0.5, y: 0.25, rotation: 90, layer: 2 },
    },
  ];
  await api.room.save(placements);
  await api.room.purchase(
    [
      { itemId: 11, optionId: 12 },
      { itemId: 11, optionId: 12 },
      { itemId: 13, optionId: 14 },
    ],
    'purchase-key-1',
  );
  assert.equal(calls[0].method, 'put');
  assert.deepEqual(JSON.parse(calls[0].data), {
    placements: [
      { inventoryId: 'owned-1', area: 'INTERIOR', transform: { x: 0.5, y: 0.25, layer: 2 } },
    ],
  });
  assert.equal(calls[1].method, 'post');
  assert.deepEqual(JSON.parse(calls[1].data), {
    items: [
      { itemId: 11, optionId: 12, quantity: 2 },
      { itemId: 13, optionId: 14, quantity: 1 },
    ],
  });
  assert.equal(calls[1].headers.get('Idempotency-Key'), 'purchase-key-1');
});
test('purchase rejected for balance keeps the server code so the room shows the shortage modal', async () => {
  const { c, api } = setup();
  await login(c, 'ACTIVE');
  c.http.defaults.adapter = async (config) => {
    if (config.url === '/shop/purchases') fail(config, 402, 'INSUFFICIENT_BALANCE');
    throw new Error(`unexpected ${config.url}`);
  };
  await assert.rejects(
    api.room.purchase([{ itemId: 11, optionId: 12 }], 'purchase-key-2'),
    (error) => error.code === 'INSUFFICIENT_BALANCE' && error.status === 402,
  );
  c.http.defaults.adapter = async (config) => fail(config, 409, 'ALREADY_OWNED');
  await assert.rejects(
    api.room.purchase([{ itemId: 11, optionId: 12 }], 'purchase-key-3'),
    (error) => error.code === 'ALREADY_OWNED',
  );
});
test('guest uses one stable UUID, no authorization; tokens never enter snapshots or traces', async () => {
  const { c, api, entries } = setup();
  const requests = [];
  c.http.defaults.adapter = async (config) => {
    requests.push(config);
    return respond(config, {
      data: { ...tokens, user: { ...user, status: 'GUEST' }, isNew: true },
    });
  };
  await api.account.guest('ANDROID');
  assert.deepEqual(JSON.parse(requests[0].data), { deviceUuid: uuid, platform: 'ANDROID' });
  assert.equal(requests[0].headers.get('Authorization'), undefined);
  assert.equal(await c.deviceUuid(), uuid);
  assert.equal(entries.size, 1);
  assert.equal(c.getSnapshot().traces[0].api, 'API-101');
  assert.ok(!JSON.stringify(c.getSnapshot()).includes(tokens.accessToken));
  assert.ok(!JSON.stringify(c.getSnapshot()).includes(tokens.refreshToken));
});
test('nested private fields and echoed credentials are redacted', () => {
  const output = JSON.stringify(
    redact(
      {
        password: 'secret-pass',
        nested: { idToken: 'jwt' },
        message: 'secret-pass test@example.com',
        deviceUuid: uuid,
        error: { code: 'UNAUTHORIZED' },
      },
      ['secret-pass'],
    ),
  );
  for (const secret of ['secret-pass', 'jwt', 'test@example.com', uuid])
    assert.ok(!output.includes(secret));
});
test('PDF data envelope, nested types and 204 are enforced without coercion', async () => {
  const { c, api } = setup();
  await login(c);
  c.http.defaults.adapter = async (config) =>
    respond(config, { stardust: 2, energy: 5, energyResetsAt: '2026-11-12T00:00:00+09:00' });
  await assert.rejects(api.benefits.wallet(), /명세 불일치/);
  c.http.defaults.adapter = async (config) =>
    respond(config, {
      data: { stardust: '2', energy: 5, energyResetsAt: '2026-11-12T00:00:00+09:00' },
    });
  await assert.rejects(api.benefits.wallet(), /명세 불일치/);
  c.http.defaults.adapter = async (config) => respond(config, '', 204);
  await api.social.block(19);
  assert.equal(c.getSnapshot().traces[0].success, true);
  await assert.rejects(api.benefits.wallet(), /명세 불일치/);
});
test('member APIs reject a guest before network access', async () => {
  const { c, api } = setup();
  await login(c, 'GUEST');
  c.http.defaults.adapter = async () => {
    throw new Error('must not send');
  };
  await assert.rejects(api.social.explore({ sort: 'recent' }), /회원 전용/);
  await assert.rejects(api.account.withdraw(), /회원 전용/);
});
test('concurrent and late 401s share one refresh rotation; retry gets the new bearer', async () => {
  const { c, api } = setup();
  await login(c);
  let refreshes = 0,
    requests = 0;
  c.http.defaults.adapter = async (config) => {
    if (config.url === '/auth/token/refresh') {
      refreshes++;
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(JSON.parse(config.data).refreshToken, tokens.refreshToken);
      return respond(config, { data: { ...tokens, accessToken: 'new-access' } });
    }
    requests++;
    if (config.headers.get('Authorization') === `Bearer ${tokens.accessToken}`) {
      await new Promise((r) => setTimeout(r, requests === 1 ? 1 : 30));
      return fail(config);
    }
    assert.equal(config.headers.get('Authorization'), 'Bearer new-access');
    return respond(config, {
      data: { stardust: 2, energy: 5, energyResetsAt: '2026-11-12T00:00:00+09:00' },
    });
  };
  await Promise.all([api.benefits.wallet(), api.benefits.wallet()]);
  assert.equal(refreshes, 1);
  assert.equal(requests, 4);
});
test('refresh rejection clears session and never loops', async () => {
  const { c, api } = setup();
  await login(c);
  let count = 0;
  c.http.defaults.adapter = async (config) => {
    count++;
    return fail(config);
  };
  await assert.rejects(api.benefits.wallet());
  assert.equal(count, 2);
  assert.equal(c.getSnapshot().authenticated, false);
});
test('a second 401 after refresh clears authentication after one retry', async () => {
  const { c, api } = setup();
  await login(c);
  let count = 0;
  c.http.defaults.adapter = async (config) => {
    count++;
    if (config.url === '/auth/token/refresh') return respond(config, { data: tokens });
    return fail(config);
  };
  await assert.rejects(api.benefits.wallet());
  assert.equal(count, 3);
  assert.equal(c.getSnapshot().authenticated, false);
});
test('failed logout keeps session; successful 204 logout clears persisted tokens', async () => {
  const { c, api, entries } = setup(true);
  await login(c);
  c.http.defaults.adapter = async (config) => fail(config, 503, 'INTERNAL');
  await assert.rejects(api.account.logout(false));
  assert.equal(c.getSnapshot().authenticated, true);
  c.http.defaults.adapter = async (config) => {
    assert.deepEqual(JSON.parse(config.data), { all: true });
    return respond(config, '', 204);
  };
  await api.account.logout(true);
  assert.equal(c.getSnapshot().authenticated, false);
  assert.equal(entries.size, 0);
  assert.equal(c.getSnapshot().traces[0].api, 'API-107');
});
test('profile nickname validation follows the server 1~10 rule and rejects unsupported characters', () => {
  assert.equal(nicknameValidationError('   '), '닉네임을 1~10자로 입력해 주세요.');
  assert.equal(nicknameValidationError('가'), null);
  assert.equal(nicknameValidationError('가나다라마바사아자차'), null);
  assert.equal(
    nicknameValidationError('가나다라마바사아자차카'),
    '닉네임을 1~10자로 입력해 주세요.',
  );
  assert.equal(nicknameValidationError('  별지기7  '), null);
  assert.equal(nicknameValidationError('별 지기'), '한글, 영문, 숫자만 입력할 수 있습니다.');
  assert.equal(nicknameValidationError('cat🌙'), '한글, 영문, 숫자만 입력할 수 있습니다.');
});
test('profile updates the shared member nickname only after a successful response', async () => {
  const { c, api } = setup();
  await login(c);
  c.http.defaults.adapter = async (config) => fail(config, 503, 'INTERNAL');
  await assert.rejects(api.account.update({ nickname: '새이름' }));
  assert.equal(c.getSnapshot().user.nickname, '시험');
  c.http.defaults.adapter = async (config) =>
    respond(config, { data: { ...me, nickname: '새이름' } });
  await api.account.update({ nickname: '새이름' });
  assert.equal(c.getSnapshot().user.nickname, '새이름');
});
test('withdrawal failure preserves member session and success allows a guest session', async () => {
  const { c, api } = setup();
  await login(c);
  c.http.defaults.adapter = async (config) => fail(config, 503, 'INTERNAL');
  await assert.rejects(api.account.withdraw());
  assert.equal(c.getSnapshot().user.status, 'ACTIVE');
  c.http.defaults.adapter = async (config) => {
    if (config.url === '/users/me') return respond(config, '', 204);
    if (config.url === '/auth/guest')
      return respond(config, {
        data: { ...tokens, user: { userId: 8, nickname: '게스트', status: 'GUEST' }, isNew: true },
      });
    throw new Error(`unexpected ${config.url}`);
  };
  await api.account.withdraw();
  assert.equal(c.getSnapshot().authenticated, false);
  await api.account.guest('ANDROID');
  assert.equal(c.getSnapshot().user.status, 'GUEST');
});
test('a former guest device cannot restore the member after logout', async () => {
  const entries = new Map();
  const storage = {
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => entries.set(key, value),
    remove: async (key) => entries.delete(key),
  };
  const freshUuid = '12345678-1234-4234-8234-123456789abd';
  const ids = [uuid, freshUuid];
  const c = new IntegrationClient(
    'https://test.invalid/api/v1',
    storage,
    () => ids.shift() ?? freshUuid,
    true,
  );
  const api = createIntegrationApi(c);
  await c.deviceUuid();
  await login(c);
  c.http.defaults.adapter = async (config) => {
    if (config.url === '/auth/logout') return respond(config, '', 204);
    if (config.url === '/auth/guest') {
      const { deviceUuid } = JSON.parse(config.data);
      const user =
        deviceUuid === uuid
          ? { userId: 7, nickname: '시험', status: 'ACTIVE' }
          : { userId: 8, nickname: '게스트', status: 'GUEST' };
      return respond(config, { data: { ...tokens, user, isNew: user.status === 'GUEST' } });
    }
    throw new Error(`unexpected ${config.url}`);
  };
  await api.account.logout(false);
  await api.account.guest('ANDROID');
  assert.equal(c.getSnapshot().user.status, 'ACTIVE');
  await api.account.logout(false);
  await c.renewGuestDeviceUuid();
  await api.account.guest('ANDROID');
  assert.equal(entries.get('chorong.v1.device'), freshUuid);
  assert.equal(c.getSnapshot().user.status, 'GUEST');
});
test('app restart rotates stored refresh and reloads server user status', async () => {
  const { c, entries } = setup(true);
  await login(c);
  const restored = setup(true, entries);
  const urls = [];
  restored.c.http.defaults.adapter = async (config) => {
    urls.push(config.url);
    return respond(config, { data: config.url.includes('refresh') ? tokens : me });
  };
  await restored.c.initialize();
  assert.deepEqual(urls, ['/auth/token/refresh', '/users/me']);
  assert.equal(restored.c.getSnapshot().user.onboardingCompleted, false);
  assert.equal(restored.c.getSnapshot().ready, true);
});

test('목업 사용자 데이터만으로는 인증되지 않고 비회원 세션은 재실행 후에도 유지된다', async () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  const entries = new Map();
  const storage = {
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => {
      entries.set(key, value);
    },
    remove: async (key) => {
      entries.delete(key);
    },
  };
  const makeClient = () =>
    new IntegrationClient('https://mock.invalid/api/v1', storage, () => uuid, true, mockApi);
  try {
    mockApi('API-104', {});
    const fresh = makeClient();
    await fresh.initialize();
    assert.equal(fresh.getSnapshot().ready, true);
    assert.equal(fresh.getSnapshot().authenticated, false);
    assert.equal(fresh.getSnapshot().user, null);

    await createIntegrationApi(fresh).account.guest('ANDROID');
    assert.equal(fresh.getSnapshot().user.status, 'GUEST');
    const restored = makeClient();
    await restored.initialize();
    assert.equal(restored.getSnapshot().ready, true);
    assert.equal(restored.getSnapshot().authenticated, true);
    assert.equal(restored.getSnapshot().user.status, 'GUEST');
  } finally {
    restoreMockSnapshot(original);
  }
});

test('완료된 첫 레슨은 기존 기록을 보존한 채 처음부터 다시 진행한다', async () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    const contents = mockApi('API-403', { path: { lessonId: 11 } }).data.data.contents;
    for (const content of contents) mockApi('API-405', { path: { contentId: content.contentId } });
    const detail = mockApi('API-402', { path: { courseId: 1 } }).data.data;
    const selected = firstStudyLesson(detail.lessons);
    assert.equal(selected.lesson.lessonId, 11);
    assert.equal(selected.replay, true);
    const before = JSON.parse(JSON.stringify(mockSnapshot()));
    const started = mockApi('API-404', {
      path: { lessonId: selected.lesson.lessonId },
      body: { replay: selected.replay },
    }).data.data;
    assert.equal(started.progress.status, 'COMPLETED');
    assert.equal(started.contents[0].contentId, contents[0].contentId);
    assert.deepEqual(mockSnapshot(), before);

    const firstQuiz = started.contents.find((content) => content.quiz).quiz;
    mockApi('API-406', {
      path: { quizId: firstQuiz.quizId },
      body: { answer: { value: true }, replay: true },
    });
    assert.deepEqual(mockSnapshot(), before);
  } finally {
    restoreMockSnapshot(original);
  }
});

test('첫 학습은 잠긴 레슨을 건너뛰고 미완료 레슨을 일반 모드로 연다', () => {
  const selected = firstStudyLesson([
    { lessonId: 1, title: '잠김', status: 'LOCKED' },
    { lessonId: 2, title: '첫 학습', status: 'UNLOCKED' },
  ]);
  assert.equal(selected.lesson.lessonId, 2);
  assert.equal(selected.replay, false);
});
test('late protected response cannot restore data after logout', async () => {
  const { c, api } = setup();
  await login(c);
  let release;
  c.http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      release = () =>
        resolve(
          respond(config, {
            data: { stardust: 1, energy: 5, energyResetsAt: '2026-11-12T00:00:00+09:00' },
          }),
        );
    });
  const response = api.benefits.wallet();
  await new Promise((r) => setImmediate(r));
  await c.clear();
  release();
  await assert.rejects(response, /인증 상태/);
  assert.equal(c.getSnapshot().user, null);
  assert.equal(c.getSnapshot().traces.length, 0);
});
test('completion retry retains idempotency key and sends no invented completion body', async () => {
  const { c, api } = setup();
  await login(c);
  const keys = [];
  let failed = false;
  c.http.defaults.adapter = async (config) => {
    assert.equal(config.url, '/lessons/12/complete');
    assert.equal(config.data, undefined);
    keys.push(config.headers.get('Idempotency-Key'));
    if (!failed) {
      failed = true;
      throw new AxiosError('network', 'ERR_NETWORK', config);
    }
    return respond(config, {
      data: {
        rewards: [],
        wallet: { stardust: 2, energy: 5, energyResetsAt: '2026-11-12T00:00:00+09:00' },
        courseCompleted: false,
      },
    });
  };
  await assert.rejects(api.learning.completeLesson(12));
  await api.learning.completeLesson(12);
  assert.equal(keys[0], keys[1]);
});
test('all four PDF answer bodies pass unchanged to server grading; review path uses reviewItemId', async () => {
  const { c, api } = setup();
  await login(c);
  const answers = [
    { index: 2 },
    { texts: ['정답', '두 번째'] },
    { value: false },
    { order: [3, 1, 2] },
  ];
  for (const answer of answers) {
    c.http.defaults.adapter = async (config) => {
      assert.equal(config.url, '/quizzes/22/answer');
      assert.deepEqual(JSON.parse(config.data), { answer, replay: true });
      return respond(config, {
        data: {
          attemptId: 1,
          isCorrect: false,
          correctAnswer: answer,
          explanation: '서버 해설',
          streakDays: 1,
        },
      });
    };
    assert.equal((await api.learning.answer(22, answer, true)).isCorrect, false);
  }
  c.http.defaults.adapter = async (config) => {
    assert.equal(config.url, '/reviews/33/answer');
    assert.deepEqual(JSON.parse(config.data), { answer: { value: true } });
    return respond(config, {
      data: {
        attemptId: 2,
        isCorrect: true,
        correctAnswer: { value: true },
        explanation: '',
        streakDays: 1,
        excludedUntil: null,
      },
    });
  };
  await api.review.answer(33, { value: true });
});
test('pagination retains server cursor and rejects missing meta instead of inventing end-of-list', async () => {
  const { c, api } = setup();
  await login(c);
  c.http.defaults.adapter = async (config) => {
    assert.deepEqual(config.params, { cursor: 'next/2', size: 5, sort: 'popular' });
    return respond(config, { data: { housings: [] }, meta: { nextCursor: 'next/3' } });
  };
  assert.equal(
    (await api.social.explore({ cursor: 'next/2', size: 5, sort: 'popular' })).meta.nextCursor,
    'next/3',
  );
  c.http.defaults.adapter = async (config) => respond(config, { data: { housings: [] } });
  await assert.rejects(api.social.explore({ sort: 'recent' }), /명세 불일치/);
});
test('server error code, HTTP status and request ID remain inspectable without secret body', async () => {
  const { c, api } = setup();
  await login(c);
  c.http.defaults.adapter = async (config) => fail(config, 403, 'LESSON_LOCKED');
  await assert.rejects(api.learning.start(9, false), /LESSON_LOCKED/);
  const trace = c.getSnapshot().traces[0];
  assert.equal(trace.code, 'LESSON_LOCKED');
  assert.equal(trace.status, 403);
  assert.equal(trace.requestId, 'request-1');
  assert.equal(redact(trace).code, 'LESSON_LOCKED');
});
test('HTML 첫 학습 목업은 14단계와 채점 결과를 복습 5문제에 연결한다', async () => {
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  const c = new IntegrationClient(
    'https://mock.invalid/api/v1',
    storage,
    () => uuid,
    false,
    mockApi,
  );
  const api = createIntegrationApi(c);
  await api.account.login('test@example.com', 'test');
  const lesson = await api.learning.lesson(11);
  assert.equal(lesson.title, '별은 왜 빛날까');
  assert.equal(lesson.contents.length, 14);
  assert.equal(lesson.contents.filter((content) => content.quiz).length, 8);
  assert.match(lesson.contents[1].body, /46억 년째/);
  const answers = [
    { value: true },
    { index: 0 },
    { index: 0 },
    { texts: ['3'] },
    { value: true },
    { texts: ['0', '2'] },
    { order: [1, 3, 2, 0] },
    { index: 1 },
  ];
  const graded = [];
  for (const [index, content] of lesson.contents.filter((entry) => entry.quiz).entries()) {
    graded.push((await api.learning.answer(content.quiz.quizId, answers[index])).isCorrect);
  }
  assert.deepEqual(graded, [false, false, false, false, true, false, true, true]);
  assert.equal((await api.review.next()).reviewItems.length, 0);
  for (const content of lesson.contents) await api.learning.completeContent(content.contentId);
  const review = await api.review.next();
  assert.equal(review.reviewItems.length, 5);
  assert.equal(review.reviewItems.filter((item) => !graded[item.quiz.quizId - 11001]).length, 4);
  assert.equal(review.reviewItems.filter((item) => graded[item.quiz.quizId - 11001]).length, 1);
  const first = review.reviewItems[0];
  const answer =
    first.quiz.options.mockHtmlType === 'ox'
      ? { value: first.quiz.options.answer[0] === 0 }
      : first.quiz.options.mockHtmlType === 'range'
        ? { texts: [String(Math.log10(first.quiz.options.answer[0]))] }
        : first.quiz.options.mockHtmlType === 'match'
          ? { order: first.quiz.options.answer }
          : first.quiz.options.mockHtmlType === 'multi'
            ? { texts: first.quiz.options.answer.map(String) }
            : { index: first.quiz.options.answer[0] };
  assert.equal((await api.review.answer(first.reviewItemId, answer)).isCorrect, true);
  assert.equal(
    (await api.review.next()).reviewItems.some((item) => item.quiz.quizId === first.quiz.quizId),
    false,
  );
  const course = await api.learning.course(1);
  let completedCourse;
  for (const summary of course.lessons.filter((item) => item.lessonId !== 11)) {
    const nextLesson = await api.learning.lesson(summary.lessonId);
    for (const content of nextLesson.contents)
      completedCourse = await api.learning.completeContent(content.contentId);
  }
  assert.equal(completedCourse.lessonCompleted, true);
  assert.equal(completedCourse.completion.courseCompleted, true);
  assert.deepEqual(
    completedCourse.completion.rewards
      .filter((item) => item.type === 'WALLET')
      .map((item) => item.amount),
    // 서버처럼 레슨 별가루 1만 주고 별자리 완성 보너스 별가루는 없다.
    [1],
  );
  assert.equal(
    completedCourse.completion.rewards.some((item) => item.type === 'CONSTELLATION'),
    true,
  );
  assert.equal(
    (await api.benefits.constellations()).constellations.find((item) => item.courseId === 1).name,
    '반짝반짝 반딧불자리',
  );
  assert.equal(
    (await api.benefits.rewards({ size: 100 })).data.rewards.some(
      (item) => item.type === 'CONSTELLATION' && item.source.courseId === 1,
    ),
    true,
  );
});
test('달의 모양 목업의 첫 퀴즈는 채점하지 않고, 복습에서는 맞아요만 정답으로 채점한다', () => {
  const moon = mockApi('API-403', { path: { lessonId: 12 } }).data.data;
  const quiz = moon.contents.find((content) => content.quiz)?.quiz;
  assert.ok(quiz);
  assert.equal(quiz.graded, false);
  const grade = (index) =>
    mockApi('API-406', {
      path: { quizId: quiz.quizId },
      body: { answer: { index } },
    }).data.data;
  for (const index of [0, 1]) {
    const result = grade(index);
    assert.equal(result.graded, false);
    assert.equal(result.isCorrect, null);
    assert.equal(result.correctAnswer, undefined);
  }
  // 목업 전용 query.lessonId 경로: 그 레슨 마지막 퀴즈 1문항 회차
  const [item] = mockApi('API-501', { query: { lessonId: 12 } }).data.data.reviewItems;
  const review = mockApi('API-502', {
    path: { reviewItemId: item.reviewItemId },
    body: { answer: { index: 1 } },
  }).data.data;
  assert.equal(review.isCorrect, false);
});

test('목업 학습·별자리·하우징 상태는 저장본에서 복원된다', () => {
  const saved = JSON.parse(JSON.stringify(mockSnapshot()));
  const before = {
    progress: mockApi('API-408', {}).data.data,
    constellations: mockApi('API-906', {}).data.data,
    housing: mockApi('API-701', {}).data.data,
    inventory: mockApi('API-907', {}).data.data,
    wallet: mockApi('API-904', {}).data.data,
  };
  mockApi('API-202', { body: { nickname: '임시 이름' } });
  mockApi('API-405', { path: { contentId: 1201 } });
  assert.equal(restoreMockSnapshot(saved), true);
  assert.deepEqual(mockSnapshot(), saved);
  assert.deepEqual(mockApi('API-408', {}).data.data, before.progress);
  assert.deepEqual(mockApi('API-906', {}).data.data, before.constellations);
  assert.deepEqual(mockApi('API-701', {}).data.data, before.housing);
  assert.deepEqual(mockApi('API-907', {}).data.data, before.inventory);
  assert.deepEqual(mockApi('API-904', {}).data.data, before.wallet);
  assert.equal(restoreMockSnapshot({ version: 1 }), false);
});

test('v2 lesson quiz and answer use interactionType and answer envelope', () => {
  const lesson = contract.lesson({
    lessonId: 9,
    courseId: 2,
    title: '시험 레슨',
    description: '설명',
    segments: [{ segmentId: 'a', title: '구간', order: 1, contentIds: [91] }],
    contents: [
      {
        contentId: 91,
        order: 1,
        segmentId: 'a',
        contentType: 'QUIZ',
        body: null,
        mediaUrl: null,
        quiz: {
          quizId: 901,
          interactionType: 'SINGLE',
          question: '질문',
          instruction: '하나 선택',
          quizOrder: 1,
          config: { options: ['첫째', '둘째'] },
        },
      },
    ],
  });
  assert.deepEqual(lesson.contents[0].quiz.options.choices, [
    { index: 0, label: '첫째' },
    { index: 1, label: '둘째' },
  ]);
  assert.deepEqual(contract.encodeAnswer(901, { index: 1 }), { answer: 1 });
  contract.quiz({
    quizId: 902,
    interactionType: 'BLANK',
    question: '질문',
    quizOrder: 2,
    config: { before: '앞', after: '뒤', options: ['가', '나'] },
  });
  assert.deepEqual(contract.encodeAnswer(902, { texts: ['나'] }), { answer: 1 });
  contract.quiz({
    quizId: 903,
    interactionType: 'MATCH',
    question: '짝',
    quizOrder: 3,
    config: {
      pairs: [
        ['왼쪽1', '오른쪽1'],
        ['왼쪽2', '오른쪽2'],
      ],
    },
  });
  assert.deepEqual(contract.encodeAnswer(903, { order: [1, 0] }), {
    pairs: [
      ['왼쪽1', '오른쪽1'],
      ['왼쪽2', '오른쪽2'],
    ],
  });
  assert.deepEqual(contract.answerResult({ isCorrect: true, completed: true }).correctAnswer, {});
  assert.throws(() => contract.encodeAnswer(901, { value: true }), /명세 불일치/);
});

test('v2 inventory copies and shop counts keep existing room model', () => {
  const items = contract.inventory({
    items: [
      {
        itemId: 3,
        optionId: 4,
        itemType: 'FURNITURE',
        name: '의자',
        option: { color: '파랑' },
        ownedCount: 2,
        placedCount: 1,
        availableCount: 1,
        copies: [
          {
            inventoryId: 'a',
            acquiredVia: 'STARTER',
            acquiredAt: '2026-11-01T00:00:00Z',
            placed: true,
          },
          {
            inventoryId: 'b',
            acquiredVia: 'PURCHASE',
            acquiredAt: '2026-11-02T00:00:00Z',
            placed: false,
          },
        ],
      },
    ],
  }).items;
  assert.deepEqual(
    items.map((item) => item.inventoryId),
    ['a', 'b'],
  );
  const item = contract.shopItem({
    itemId: 3,
    name: '의자',
    itemType: 'FURNITURE',
    unlocked: true,
    unlockHint: null,
    minPrice: { currency: 'STARDUST', amount: 10 },
    options: [
      {
        optionId: 4,
        option: { color: '파랑' },
        currency: 'STARDUST',
        price: 10,
        previewAsset: 'chair',
        ownedCount: 2,
      },
    ],
  });
  assert.equal(item.options[0].owned, true);
  assert.deepEqual(
    contract.placementRequest([
      { inventoryId: 'a', area: 'INTERIOR', transform: { x: 0.3, y: 0.4, rotation: 90, layer: 1 } },
    ]),
    [{ inventoryId: 'a', area: 'INTERIOR', transform: { x: 0.3, y: 0.4, layer: 1 } }],
  );
});

test('v2 MULTI keeps content order and connects existing learning and review data', () => {
  const quizContent = (contentId, order, quiz) => ({
    contentId,
    order,
    segmentId: 'a',
    contentType: 'QUIZ',
    body: null,
    mediaUrl: null,
    quiz: { question: '질문', quizOrder: order, ...quiz },
  });
  const raw = {
    lessonId: 9,
    courseId: 2,
    title: '시험 레슨',
    description: '설명',
    contents: [
      quizContent(81, 1, { quizId: 801, interactionType: 'OX', config: {} }),
      quizContent(82, 2, {
        quizId: 802,
        interactionType: 'MULTI',
        config: { options: ['a', 'b'], answers: [0] },
      }),
      quizContent(83, 3, { quizId: 803, interactionType: 'SLIDER', config: { ticks: ['0', '1'] } }),
      quizContent(84, 4, { quizId: 804, interactionType: 'CHOSUNG', config: { hint: 'ㅇㅌ' } }),
      quizContent(85, 5, {
        quizId: 805,
        interactionType: 'SINGLE',
        config: { options: ['a', 'b'] },
      }),
    ],
  };
  for (const parsed of [
    contract.lesson(raw),
    contract.lessonStart({
      reviewRequired: false,
      review: null,
      progress: { status: 'IN_PROGRESS', lastContentId: null, resumeContentId: 81 },
      contents: raw.contents,
    }),
  ]) {
    assert.deepEqual(
      parsed.contents.map((c) => [c.contentId, c.order, c.contentType]),
      raw.contents.map((c) => [c.contentId, c.order, 'QUIZ']),
    );
    assert.deepEqual(
      parsed.contents.map((c) => c.quiz?.quizId ?? null),
      [801, 802, 803, 804, 805],
    );
    assert.deepEqual(
      parsed.contents.map((c) => c.unsupportedQuiz ?? null),
      [null, null, null, null, null],
    );
    assert.deepEqual(parsed.contents[1].quiz.options, {
      choices: [
        { index: 0, label: 'a' },
        { index: 1, label: 'b' },
      ],
      answer: [0],
      mockHtmlType: 'multi',
    });
  }
  assert.deepEqual(contract.encodeAnswer(802, { texts: ['0'] }), { answers: [0] });
  assert.throws(() => contract.encodeAnswer(802, { position: 0.5 }), /명세 불일치/);
  // 온보딩의 기존 QuizCard는 MULTI를 표현하지 못하므로 기존 차단을 유지한다.
  assert.throws(() => contract.onboarding({ lesson: raw }), /interactionType=MULTI/);
  const review = contract.reviewSet({
    reviewItems: [{ reviewItemId: 1, quiz: raw.contents[1].quiz }],
    message: null,
    rewardEligible: true,
  });
  assert.equal(review.reviewItems[0].quiz.options.mockHtmlType, 'multi');
  assert.deepEqual(contract.encodeReviewAnswer(1, { texts: ['0'] }), { answers: [0] });
});

test('v2 placement without item option keeps the placement and invents no option id', () => {
  const placements = [
    {
      placementId: 1,
      inventoryId: 'cat-1',
      area: 'INTERIOR',
      transform: { x: 0.2, y: 0.3, flippedX: true, layer: 4 },
      itemId: 50,
    },
    {
      placementId: 2,
      inventoryId: 'chair-1',
      area: 'INTERIOR',
      transform: { x: 0.5, y: 0.6 },
      itemId: 3,
      optionId: 4,
      option: { color: '파랑' },
    },
  ];
  const housing = { housingId: 1, name: '우주', isPublic: true, likeCount: 0 };
  const avatar = { x: 0.5, y: 0.5, state: 'IDLE', placementId: null };
  const parsed = [
    contract.housingDetail({ housing, placements, avatar }).placements,
    contract.housingVisit({
      housing,
      placements,
      avatar,
      ownerNickname: '친구',
      likedByMe: false,
    }).placements,
    contract.savedPlacements({ placements }).placements,
  ];
  for (const [optionless, withOption] of parsed) {
    assert.equal(optionless.optionId, undefined);
    assert.equal('optionId' in optionless, false);
    assert.deepEqual(optionless.option, {});
    assert.equal(optionless.itemId, 50);
    assert.equal(optionless.inventoryId, 'cat-1');
    assert.deepEqual(optionless.transform, {
      x: 0.2,
      y: 0.3,
      flippedX: true,
      layer: 4,
      rotation: 0,
    });
    assert.equal(withOption.optionId, 4);
    assert.deepEqual(withOption.option, { color: '파랑' });
    assert.equal(withOption.transform.layer, 0);
  }
  assert.throws(
    () =>
      contract.savedPlacements({
        placements: [{ ...placements[1], option: 'blue' }],
      }),
    /명세 불일치/,
  );
  assert.throws(
    () =>
      contract.savedPlacements({
        placements: [{ ...placements[1], optionId: '4' }],
      }),
    /명세 불일치/,
  );
});

test('CHOSUNG quiz maps hint, sends the typed string and uses only server grading', async () => {
  const parsed = contract.quiz({
    quizId: 960,
    interactionType: 'CHOSUNG',
    question: '이 색의 이름은?',
    quizOrder: 1,
    config: { hint: 'ㅇㅌㄹㅁㄹ' },
  });
  assert.deepEqual(parsed, {
    quizId: 960,
    interactionType: 'CHOSUNG',
    quizOrder: 1,
    config: { hint: 'ㅇㅌㄹㅁㄹ' },
    question: '이 색의 이름은?',
    hint: null,
    type: 'CHOSUNG',
    options: { hint: 'ㅇㅌㄹㅁㄹ' },
  });
  assert.throws(
    () =>
      contract.quiz({
        quizId: 961,
        interactionType: 'CHOSUNG',
        question: '질문',
        quizOrder: 1,
        config: {},
      }),
    /config\.hint/,
  );
  assert.deepEqual(contract.encodeAnswer(960, { texts: [' 울트라 마린 '] }), {
    answer: '울트라 마린',
  });
  assert.throws(() => contract.encodeAnswer(960, { texts: ['  '] }), /명세 불일치/);
  assert.throws(() => contract.encodeAnswer(960, { index: 0 }), /명세 불일치/);

  const { c, api } = setup();
  await login(c);
  const sent = [];
  c.http.defaults.adapter = async (config) => {
    sent.push(JSON.parse(config.data));
    return respond(config, {
      data: {
        attemptId: 3,
        isCorrect: false,
        completed: true,
        correctAnswer: { answer: '울트라마린' },
        explanation: '서버 해설',
      },
    });
  };
  const result = await api.learning.answer(960, { texts: ['코발트'] });
  assert.deepEqual(sent, [{ answer: { answer: '코발트' }, replay: false }]);
  assert.equal(result.isCorrect, false);
  assert.equal(result.correctAnswer.answer, '울트라마린');
  assert.equal(result.explanation, '서버 해설');

  // 온보딩 화면에는 초성 UI 가 없어 그대로 실패시킨다.
  assert.throws(
    () =>
      contract.onboarding({
        lesson: {
          lessonId: 1,
          courseId: 1,
          title: '온보딩',
          description: '',
          contents: [
            {
              contentId: 1,
              order: 1,
              segmentId: 'a',
              contentType: 'QUIZ',
              quiz: {
                quizId: 962,
                interactionType: 'CHOSUNG',
                question: '질문',
                quizOrder: 1,
                config: { hint: 'ㄱ' },
              },
            },
          ],
        },
      }),
    /interactionType=CHOSUNG/,
  );
});

test('mock CHOSUNG lesson grades on the mock server, then completes the lesson', async () => {
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  const c = new IntegrationClient(
    'https://mock.invalid/api/v1',
    storage,
    () => uuid,
    false,
    mockApi,
  );
  c.http.defaults.adapter = async () => {
    throw new Error('network request');
  };
  const api = createIntegrationApi(c);
  await api.account.login('test@example.com', 'test');
  const start = await api.learning.start(22, false);
  const chosung = start.contents.find((content) => content.quiz?.type === 'CHOSUNG');
  assert.equal(chosung.contentId, 2204);
  assert.equal(chosung.order, 4);
  assert.deepEqual(chosung.quiz.options, { hint: 'ㅈㅂ' });
  assert.equal('answer' in chosung.quiz.options, false);

  const wrong = await api.learning.answer(chosung.quiz.quizId, { texts: ['응결'] }, true);
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.correctAnswer.answer, '증발');
  assert.ok(wrong.explanation);
  const right = await api.learning.answer(chosung.quiz.quizId, { texts: ['증 발'] });
  assert.equal(right.isCorrect, true);

  let last;
  for (const content of start.contents)
    last = await api.learning.completeContent(content.contentId);
  assert.equal(last.lessonCompleted, true);

  // 서버 API-501 은 레슨을 고르지 않는다. 목업 전용 query.lessonId 경로로 이 레슨 퀴즈 회차를 연다.
  const review = await c.request('API-501', contract.reviewSet, { query: { lessonId: 22 } });
  assert.equal(review.reviewItems[0].quiz.type, 'CHOSUNG');
  const reviewed = await api.review.answer(review.reviewItems[0].reviewItemId, {
    texts: ['증발'],
  });
  assert.equal(reviewed.isCorrect, true);
});

test('mock CHOSUNG with a spaced hint grades every accepted spelling on the mock server', async () => {
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  const c = new IntegrationClient(
    'https://mock.invalid/api/v1',
    storage,
    () => uuid,
    false,
    mockApi,
  );
  c.http.defaults.adapter = async () => {
    throw new Error('network request');
  };
  const api = createIntegrationApi(c);
  await api.account.login('test@example.com', 'test');
  const start = await api.learning.start(31, false);
  const chosung = start.contents.find((content) => content.quiz?.type === 'CHOSUNG');
  assert.equal(chosung.contentId, 3104);
  assert.deepEqual(chosung.quiz.options, { hint: 'ㅈㅊ ㄱㅅ' });
  // 기존 객관식 문항은 그대로 남는다.
  assert.equal(start.contents.filter((content) => content.quiz).length, 2);

  const wrong = await api.learning.answer(chosung.quiz.quizId, { texts: ['전체수'] }, true);
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.correctAnswer.answer, '전체 개수');
  assert.match(wrong.explanation, /\n/);
  for (const texts of [['전체개수'], ['전체 개수']]) {
    const right = await api.learning.answer(chosung.quiz.quizId, { texts }, true);
    assert.equal(right.isCorrect, true);
  }
});

const chosungInput = require('../.expo/integration-tests/user/chosungInput');

test('CHOSUNG slot count comes from the hint without spaces', () => {
  assert.equal(chosungInput.chosungSlotCount('ㅎㅇㅎ'), 3);
  assert.equal(chosungInput.chosungSlotCount(' ㅈㅊ  ㄱㅅ '), 4);
  assert.equal(chosungInput.chosungHintLabel('ㅎㅇㅎ'), 'ㅎ ㅇ ㅎ');
  assert.equal(chosungInput.chosungHintLabel('ㅈㅊ ㄱㅅ'), 'ㅈ ㅊ   ㄱ ㅅ');
});

test('CHOSUNG auto submit waits until every slot holds a finished syllable', () => {
  const filled = chosungInput.isChosungInputFilled;
  // 핵융합 입력 과정: 마지막 글자 조합 중(ㅎ)에는 제출하지 않는다.
  assert.equal(filled('핵융', 3), false);
  assert.equal(filled('핵융ㅎ', 3), false);
  // 하 는 완성 글자라 칸이 찼다고 본다. 받침이 붙을 수 있어 화면은 CHOSUNG_SETTLE_MS 동안 더 기다린다.
  assert.equal(filled('핵융하', 3), true);
  assert.equal(filled('핵융합', 3), true);
  // 조합형(첫가끝) 낱자와 넘치는 입력은 제출하지 않는다.
  assert.equal(filled('핵융하', 3), false);
  assert.equal(filled('핵융합이', 3), false);
  // 공백은 서버처럼 빼고 센다.
  assert.equal(filled('전체 개수', 4), true);
  assert.equal(filled('전체 개ㅅ', 4), false);
  assert.equal(filled('', 0), false);
  assert.ok(chosungInput.CHOSUNG_SETTLE_MS > 0);
});

const slider = require('../.expo/integration-tests/user/sliderQuizState');

test('SLIDER config maps string ticks and optional hint; answer is a 0~1 position', async () => {
  const parsed = contract.quiz({
    quizId: 970,
    interactionType: 'SLIDER',
    question: '얼마나 걸릴까요?',
    quizOrder: 1,
    config: { ticks: ['0', '반나절', '하루'], hint: '놓으면 제출돼요' },
  });
  assert.deepEqual(parsed, {
    quizId: 970,
    interactionType: 'SLIDER',
    quizOrder: 1,
    config: { ticks: ['0', '반나절', '하루'], hint: '놓으면 제출돼요' },
    question: '얼마나 걸릴까요?',
    hint: null,
    type: 'SLIDER',
    options: { ticks: ['0', '반나절', '하루'], hint: '놓으면 제출돼요' },
  });
  const noHint = contract.quiz({
    quizId: 971,
    interactionType: 'SLIDER',
    question: '질문',
    quizOrder: 1,
    config: { ticks: ['왼쪽', '오른쪽'] },
  });
  assert.deepEqual(noHint.options, { ticks: ['왼쪽', '오른쪽'] });
  for (const ticks of [['하나'], ['a', 1], undefined])
    assert.throws(
      () =>
        contract.quiz({
          quizId: 972,
          interactionType: 'SLIDER',
          question: '질문',
          quizOrder: 1,
          config: { ticks },
        }),
      /config\.ticks/,
    );
  // 눈금 스냅 없이 위치를 그대로 보낸다.
  for (const position of [0, 0.28, 1])
    assert.deepEqual(contract.encodeAnswer(970, { position }), { answer: position });
  for (const answer of [
    { position: -0.01 },
    { position: 1.01 },
    { position: NaN },
    { texts: ['0.5'] },
  ])
    assert.throws(() => contract.encodeAnswer(970, answer), /명세 불일치/);

  const { c, api } = setup();
  await login(c);
  const sent = [];
  let reply;
  c.http.defaults.adapter = async (config) => {
    sent.push(JSON.parse(config.data));
    return respond(config, { data: reply });
  };
  reply = {
    attemptId: 1,
    isCorrect: false,
    completed: true,
    correctAnswer: { answer: 0.72 },
    closeness: 56,
    explanation: '서버 해설',
  };
  const wrong = await api.learning.answer(970, { position: 0.28 });
  assert.deepEqual(sent[0], { answer: { answer: 0.28 }, replay: false });
  assert.equal(wrong.isCorrect, false);
  assert.equal(slider.closenessText(wrong), '정답에 56% 근접했어요');
  assert.equal(slider.serverAnswerPosition(wrong), 0.72);
  reply = { ...reply, isCorrect: true, closeness: 98 };
  const right = await api.learning.answer(970, { position: 0.7 }, true);
  assert.deepEqual(sent[1], { answer: { answer: 0.7 }, replay: true });
  assert.equal(right.isCorrect, true);
  assert.equal(slider.closenessText(right), '정답에 98% 근접했어요');
  // closeness 가 없으면 문구를 만들지 않는다.
  reply = { isCorrect: true, completed: true };
  assert.equal(slider.closenessText(await api.learning.answer(970, { position: 0.5 })), null);
});

test('SLIDER position, ticks and release-once submission', async () => {
  assert.equal(slider.positionAt(-20, 200), 0);
  assert.equal(slider.positionAt(0, 200), 0);
  assert.equal(slider.positionAt(56, 200), 0.28);
  assert.equal(slider.positionAt(200, 200), 1);
  assert.equal(slider.positionAt(260, 200), 1);
  assert.equal(slider.positionAt(50, 0), 0);
  assert.deepEqual(slider.tickPositions(['1톤', '천 톤', '100만 톤', '10억 톤']), [
    { label: '1톤', position: 0 },
    { label: '천 톤', position: 1 / 3 },
    { label: '100만 톤', position: 2 / 3 },
    { label: '10억 톤', position: 1 },
  ]);
  assert.deepEqual(
    slider.tickPositions(['왼쪽', '오른쪽']).map((t) => t.position),
    [0, 1],
  );

  // 응답 대기 중에 다시 놓아도 한 번만 보낸다.
  const calls = [];
  let finish;
  const submitter = slider.createReleaseSubmitter(
    (position) =>
      new Promise((resolve) => {
        calls.push(position);
        finish = () => resolve({ isCorrect: true, correctAnswer: {} });
      }),
  );
  const first = submitter.release(0.4);
  assert.equal(submitter.state, 'submitting');
  assert.equal(await submitter.release(0.9), null);
  finish();
  assert.deepEqual(await first, { isCorrect: true, correctAnswer: {} });
  assert.equal(submitter.state, 'graded');
  assert.equal(await submitter.release(0.1), null);
  assert.deepEqual(calls, [0.4]);

  // 실패하면 채점 상태가 되지 않고 다시 놓아 재시도할 수 있다.
  let attempts = 0;
  const retry = slider.createReleaseSubmitter(async (position) => {
    attempts += 1;
    if (attempts === 1) throw new Error('network');
    return { position };
  });
  await assert.rejects(retry.release(1.5), /network/);
  assert.equal(retry.state, 'idle');
  assert.deepEqual(await retry.release(1.5), { position: 1 });
  assert.equal(attempts, 2);
});

test('mock SLIDER lesson hides the answer, grades on the mock server and completes', async () => {
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  const c = new IntegrationClient(
    'https://mock.invalid/api/v1',
    storage,
    () => uuid,
    false,
    mockApi,
  );
  c.http.defaults.adapter = async () => {
    throw new Error('network request');
  };
  const api = createIntegrationApi(c);
  await api.account.login('test@example.com', 'test');
  const start = await api.learning.start(21, false);
  const item = start.contents.find((content) => content.quiz?.type === 'SLIDER');
  assert.equal(item.contentId, 2104);
  assert.deepEqual(item.quiz.options, {
    ticks: ['0시간', '12시간', '하루(24시간)', '36시간'],
    hint: '막대를 놓으면 제출돼요.',
  });

  const wrong = await api.learning.answer(item.quiz.quizId, { position: 0 }, true);
  assert.equal(wrong.isCorrect, false);
  assert.equal(typeof wrong.closeness, 'number');
  assert.equal(slider.serverAnswerPosition(wrong), 24 / 36);
  const right = await api.learning.answer(item.quiz.quizId, { position: 0.68 });
  assert.equal(right.isCorrect, true);
  assert.ok(right.explanation);

  let last;
  for (const content of start.contents)
    last = await api.learning.completeContent(content.contentId);
  assert.equal(last.lessonCompleted, true);

  // 서버 API-501 은 레슨을 고르지 않는다. 목업 전용 query.lessonId 경로로 이 레슨 퀴즈 회차를 연다.
  const review = await c.request('API-501', contract.reviewSet, { query: { lessonId: 21 } });
  assert.equal(review.reviewItems[0].quiz.type, 'SLIDER');
  const reviewed = await api.review.answer(review.reviewItems[0].reviewItemId, { position: 1 });
  assert.equal(reviewed.isCorrect, false);

  // 온보딩 화면에는 슬라이더 UI 가 없어 그대로 실패시킨다.
  assert.throws(
    () =>
      contract.onboarding({
        lesson: {
          ...start,
          lessonId: 1,
          courseId: 1,
          title: '온보딩',
          description: '',
          contents: [item],
        },
      }),
    /명세 불일치/,
  );
});

test('대화형 콘텐츠는 dialogue 배열을 순서·화자·원문 그대로 전달한다', () => {
  const { toNarrationContent } = require('../.expo/integration-tests/user/narrationContent');
  const raw = {
    contentId: 901,
    order: 1,
    segmentId: 'a',
    contentType: 'TEXT',
    body: '원래 본문',
    mediaUrl: null,
    dialogue: [
      { speaker: '별지기', text: '첫 줄\n초롱이: 이건 대사 안의 문자열이에요.' },
      { speaker: '초롱이', text: '두 번째냥? <&> "따옴표"' },
      { speaker: '천문대장', text: '예상하지 못한 화자' },
      { speaker: '별지기', text: '출처: 대사 안의 출처 문구' },
    ],
    source: 'NASA',
    quiz: null,
  };
  const content = contract.lesson({
    lessonId: 1,
    courseId: 1,
    title: 't',
    description: 'd',
    contents: [raw],
  }).contents[0];
  assert.equal(content.body, '원래 본문');
  assert.equal(content.source, 'NASA');
  assert.deepEqual(content.dialogue, raw.dialogue);

  const narration = toNarrationContent(content);
  assert.deepEqual(
    narration.messages.map(({ id, order, speaker, text }) => [id, order, speaker, text]),
    raw.dialogue.map((line, index) => [`901-${index}`, index, line.speaker, line.text]),
  );
  assert.equal(narration.source, '출처: NASA');

  assert.throws(
    () =>
      contract.lesson({
        lessonId: 1,
        courseId: 1,
        title: 't',
        description: 'd',
        contents: [{ ...raw, dialogue: [{ speaker: '별지기' }] }],
      }),
    Error,
  );
});

test('dialogue 가 없으면 기존 body 파싱을 유지한다', () => {
  const { toNarrationContent } = require('../.expo/integration-tests/user/narrationContent');
  const base = { contentId: 7, order: 1, contentType: 'TEXT', mediaUrl: null, quiz: null };
  const legacy = toNarrationContent({
    ...base,
    body: '별지기: 태양은 불이 아니에요.\n초롱이: 그럼 뭐냥?\n출처: NASA',
  });
  assert.deepEqual(
    legacy.messages.map(({ speaker, text }) => [speaker, text]),
    [
      ['별지기', '태양은 불이 아니에요.'],
      ['초롱이', '그럼 뭐냥?'],
    ],
  );
  assert.equal(legacy.source, '출처: NASA');

  const plain = toNarrationContent({ ...base, body: '평범한 설명', source: 'ESA' });
  assert.deepEqual(plain.messages, [
    { id: '7-0', order: 0, speaker: '별지기', text: '평범한 설명' },
  ]);
  assert.equal(plain.source, '출처: ESA');

  const empty = toNarrationContent({ ...base, body: '본문 유지', dialogue: [] });
  assert.equal(empty.messages[0].text, '본문 유지');
});

test('목업 TEXT 콘텐츠는 기존처럼 화자별 대사로 표시된다', async () => {
  const { toNarrationContent } = require('../.expo/integration-tests/user/narrationContent');
  const { lessons } = require('../.expo/integration-tests/mockData');
  const texts = lessons
    .flatMap((lesson) => lesson.contents)
    .filter((item) => item.contentType === 'TEXT' && item.body);
  assert.ok(texts.length > 0);
  for (const item of texts) {
    const narration = toNarrationContent(item);
    assert.ok(narration.messages.length > 0, `content ${item.contentId}`);
    for (const message of narration.messages) {
      assert.ok(['별지기', '초롱이'].includes(message.speaker));
      assert.ok(message.text.length > 0);
    }
  }
});

test('에너지 없이 별자리 마지막 레슨을 마치면 완성 보너스 별가루도 주지 않는다', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    const fresh = {
      ...original,
      wallet: { ...original.wallet, energy: 5 },
      startedLessons: [],
      rewardedLessons: [],
      completed: [],
      completedConstellations: [],
    };
    assert.equal(restoreMockSnapshot(fresh), true);
    const finish = (lessonId) => {
      mockApi('API-404', { path: { lessonId }, body: { replay: false } });
      let result;
      for (const content of mockApi('API-403', { path: { lessonId } }).data.data.contents)
        result = mockApi('API-405', { path: { contentId: content.contentId } }).data.data;
      return result;
    };
    const lessons = mockApi('API-402', { path: { courseId: 3 } }).data.data.lessons;
    for (const lesson of lessons.slice(0, -1)) finish(lesson.lessonId);

    const snapshot = JSON.parse(JSON.stringify(mockSnapshot()));
    assert.equal(
      restoreMockSnapshot({ ...snapshot, wallet: { ...snapshot.wallet, energy: 0 } }),
      true,
    );
    const stardust = mockApi('API-904', {}).data.data.stardust;
    const result = finish(lessons.at(-1).lessonId);
    assert.equal(result.lessonCompleted, true);
    assert.equal(result.completion.courseCompleted, true);
    assert.equal(result.completion.rewardStatus, 'NO_ENERGY');
    assert.equal(
      result.completion.rewards.some((item) => item.type === 'WALLET'),
      false,
    );
    assert.equal(
      result.completion.rewards.some((item) => item.type === 'CONSTELLATION'),
      true,
    );
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust);
  } finally {
    restoreMockSnapshot(original);
  }
});

test('목업 레슨(#16): 시작은 에너지를 쓰지 않고, 보상 받는 완료 때 1 쓴다. 에너지 0이면 안내하고 NO_ENERGY', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    const fresh = {
      ...original,
      wallet: { ...original.wallet, energy: 5 },
      startedLessons: [],
      rewardedLessons: [],
      completed: [],
    };
    const contents = mockApi('API-403', { path: { lessonId: 21 } }).data.data.contents;
    const start = () =>
      mockApi('API-404', { path: { lessonId: 21 }, body: { replay: false } }).data.data;
    const finish = () => {
      let result;
      for (const content of contents)
        result = mockApi('API-405', { path: { contentId: content.contentId } }).data.data;
      return result;
    };

    assert.equal(restoreMockSnapshot(fresh), true);
    assert.equal(start().energyNotice, false);
    assert.equal(mockApi('API-904', {}).data.data.energy, 5);
    const stardustBefore = mockApi('API-904', {}).data.data.stardust;
    const granted = finish();
    assert.equal(granted.lessonCompleted, true);
    assert.equal(granted.completion.rewardStatus, 'GRANTED');
    assert.equal(granted.completion.firstCompletion, true);
    assert.equal(granted.completion.wallet.energy, 4);
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardustBefore + 1);
    assert.equal('stardustSkipped' in granted.completion, false);
    assert.equal('quizSummary' in granted.completion, false);
    const next = granted.completion.nextLesson;
    assert.ok(next === null || (typeof next.lessonId === 'number' && next.lessonId !== 21));

    assert.equal(restoreMockSnapshot({ ...fresh, wallet: { ...fresh.wallet, energy: 0 } }), true);
    assert.equal(start().energyNotice, true);
    assert.equal(mockApi('API-904', {}).data.data.energy, 0);
    const stardust = mockApi('API-904', {}).data.data.stardust;
    const result = finish();
    assert.equal(result.lessonCompleted, true);
    assert.equal(result.completion.rewardStatus, 'NO_ENERGY');
    assert.equal(
      result.completion.rewards.some((item) => item.type === 'WALLET'),
      false,
    );
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust);
  } finally {
    restoreMockSnapshot(original);
  }
});

test('목업 API-409: 도달한 화면·draft 를 저장하고 API-404 가 돌려주며, 콘텐츠 완료·restart 가 지운다', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    assert.equal(
      restoreMockSnapshot({ ...original, startedLessons: [], rewardedLessons: [], completed: [] }),
      true,
    );
    const contents = mockApi('API-403', { path: { lessonId: 21 } }).data.data.contents;
    const start = (body = { replay: false }) =>
      mockApi('API-404', { path: { lessonId: 21 }, body }).data.data;
    const save = (body) => mockApi('API-409', { path: { lessonId: 21 }, body }).data.data;
    // 시작 전 레슨은 저장할 수 없다(409 ERR-07)
    assert.throws(() => save({ contentId: contents[0].contentId }), /ERR-07/);
    start();
    mockApi('API-405', { path: { contentId: contents[0].contentId } });
    // 아직 도달하지 않은 화면(완료 화면의 다음 다음)은 저장할 수 없다
    assert.throws(() => save({ contentId: contents[2].contentId }), /ERR-07/);
    const draft = {
      contentId: contents[1].contentId,
      input: { type: 'CHOSUNG', quizId: 1, text: '별' },
    };
    assert.throws(
      () => save({ contentId: contents[0].contentId, draft }),
      /MOCK_VALIDATION_FAILED/,
    );
    assert.throws(
      () =>
        save({
          contentId: contents[1].contentId,
          draft: { ...draft, input: { text: '가'.repeat(1400) } },
        }),
      /MOCK_VALIDATION_FAILED/,
    );
    assert.deepEqual(save({ contentId: contents[1].contentId, draft }).progress, {
      status: 'IN_PROGRESS',
      lastContentId: contents[0].contentId,
      resumeContentId: contents[1].contentId,
      draft,
      contentVersion: 1,
    });
    // 이전 화면 저장도 받는다. 이어하기 위치는 저장한 화면이다.
    save({ contentId: contents[0].contentId });
    let resumed = start();
    assert.equal(resumed.progress.resumeContentId, contents[0].contentId);
    assert.equal(resumed.progress.draft, undefined);
    save({ contentId: contents[1].contentId, draft });
    resumed = start();
    assert.equal(resumed.progress.resumeContentId, contents[1].contentId);
    assert.deepEqual(resumed.progress.draft, draft);
    const progress = mockApi('API-408', {}).data.data.current;
    assert.equal(progress.lessonId, 21);
    assert.equal(progress.resumable, true);

    // restart: 저장 화면·draft·완료 위치를 지운다
    const restarted = start({ replay: false, restart: true });
    assert.equal(restarted.progress.lastContentId, null);
    assert.equal(restarted.progress.resumeContentId, contents[0].contentId);
    assert.equal(restarted.progress.draft, undefined);

    // 콘텐츠 완료는 저장 화면·draft 를 지운다
    save({
      contentId: contents[0].contentId,
      draft: { ...draft, contentId: contents[0].contentId },
    });
    mockApi('API-405', { path: { contentId: contents[0].contentId } });
    const afterComplete = start();
    assert.equal(afterComplete.progress.resumeContentId, contents[1].contentId);
    assert.equal(afterComplete.progress.draft, undefined);
  } finally {
    restoreMockSnapshot(original);
  }
});

const v032Quiz = (quizId, interactionType, config) => ({
  quizId,
  lessonId: 3200,
  interactionType,
  question: '질문',
  instruction: '안내',
  difficulty: '기초',
  quizOrder: 1,
  config,
});
const v032Lesson = (quizzes) => ({
  lessonId: 3200,
  courseId: 32,
  title: '계약 검증',
  description: '설명',
  contents: quizzes.map((quiz, index) => ({
    contentId: 32000 + index,
    order: index + 1,
    segmentId: 'first',
    contentType: 'QUIZ',
    quiz,
  })),
});

test('0.3.2 MULTI learning and review send selected indexes, including wrong answers', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const quiz = v032Quiz(32001, 'MULTI', { options: ['첫째', '둘째', '셋째'], answers: [0, 1] });
  const sent = [];
  c.http.defaults.adapter = async (config) => {
    if (config.method === 'get')
      return respond(config, {
        data: config.url.includes('/reviews/')
          ? { reviewItems: [{ reviewItemId: 32901, quiz }], message: null, rewardEligible: true }
          : v032Lesson([quiz]),
      });
    sent.push({ url: config.url, body: JSON.parse(config.data) });
    return respond(config, {
      data: { isCorrect: false, completed: true, correctAnswer: { answers: [0, 1] } },
    });
  };
  const lesson = await api.learning.lesson(3200);
  assert.equal(lesson.contents[0].quiz.options.mockHtmlType, 'multi');
  assert.deepEqual(lesson.contents[0].quiz.options.answer, [0, 1]);
  const selected = { texts: ['2', '0'] };
  const result = await api.learning.answer(32001, selected);
  assert.equal(result.isCorrect, false);
  assert.equal(result.completed, true);
  assert.equal(result.explanation, undefined);
  assert.deepEqual(selected, { texts: ['2', '0'] });
  await api.review.next();
  await api.review.answer(32901, { texts: ['1'] });
  assert.deepEqual(sent, [
    { url: '/quizzes/32001/answer', body: { answer: { answers: [0, 2] }, replay: false } },
    { url: '/reviews/32901/answer', body: { answer: { answers: [1] } } },
  ]);
  for (const texts of [[], ['0', '0'], ['-1'], ['3'], ['0.5'], ['NaN'], [''], [' 1'], [0]])
    assert.throws(() => api.learning.answer(32001, { texts }), /명세 불일치/);
  assert.equal(sent.length, 2);
});

test('0.3.2 MULTI rejects missing, duplicate and out-of-range public answers', () => {
  const invalid = [undefined, [], [0, 0], [-1], [2], [0.5], ['0']];
  for (const answers of invalid) {
    const quiz = v032Quiz(32002, 'MULTI', { options: ['가', '나'], answers });
    for (const parse of [
      () => contract.lesson(v032Lesson([quiz])),
      () =>
        contract.reviewSet({
          reviewItems: [{ reviewItemId: 32902, quiz }],
          message: null,
          rewardEligible: true,
        }),
      () => contract.onboarding({ lesson: v032Lesson([quiz]) }),
    ])
      assert.throws(parse, /config.answers/);
  }
  assert.throws(
    () => contract.quiz(v032Quiz(32002, 'MULTI', { options: ['가'], answers: [0] })),
    /config.answers/,
  );
});

test('0.3.2 MATCH learning and review encode the actual right-column selection', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const quiz = v032Quiz(32003, 'MATCH', {
    pairs: [
      ['왼1', '오른1'],
      ['왼2', '오른2'],
      ['왼3', '오른3'],
    ],
  });
  const sent = [];
  c.http.defaults.adapter = async (config) => {
    if (config.method === 'get')
      return respond(config, {
        data: config.url.includes('/reviews/')
          ? { reviewItems: [{ reviewItemId: 32903, quiz }], message: null, rewardEligible: true }
          : v032Lesson([quiz]),
      });
    sent.push({ url: config.url, body: JSON.parse(config.data) });
    return respond(config, { data: { isCorrect: false, completed: true } });
  };
  const lesson = await api.learning.lesson(3200);
  assert.deepEqual(lesson.contents[0].quiz.options.right, ['오른3', '오른2', '오른1']);
  const order = [0, 2, 1];
  await api.learning.answer(32003, { order }, true);
  await api.review.next();
  await api.review.answer(32903, { order: [2, 1, 0] });
  assert.deepEqual(order, [0, 2, 1]);
  assert.deepEqual(sent, [
    {
      url: '/quizzes/32003/answer',
      body: {
        answer: {
          pairs: [
            ['왼1', '오른3'],
            ['왼2', '오른1'],
            ['왼3', '오른2'],
          ],
        },
        replay: true,
      },
    },
    { url: '/reviews/32903/answer', body: { answer: { pairs: quiz.config.pairs } } },
  ]);
  for (const order of [[], [0, 1], [0, 0, 1], [-1, 1, 2], [0, 1, 3], [0, 1, 1.5]])
    assert.throws(() => api.review.answer(32903, { order }), /명세 불일치/);
  assert.equal(sent.length, 2);
});

test('0.4.x courses without category or topic and dialogue without speaker stay valid', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const course = {
    courseId: 45,
    slug: 'firefly',
    title: '반딧불자리',
    description: '빛과 색',
    order: 1,
    category: null,
    topic: null,
    locked: false,
    totalLessons: 1,
    completedLessons: 0,
    constellation: null,
  };
  const lesson = {
    lessonId: 4500,
    slug: 'firefly/blue-pigment',
    title: '파란 물감',
    keyword: '청금석',
    order: 1,
    status: 'UNLOCKED',
    unlocksAt: null,
    completedAt: null,
  };
  const { unlocksAt, ...lessonWithoutUnlock } = lesson;
  c.http.defaults.adapter = async (config) => {
    if (config.url.endsWith('/courses')) {
      assert.equal(config.params, undefined);
      const { category, topic, ...withoutLegacy } = course;
      return respond(config, { data: { courses: [course, withoutLegacy] } });
    }
    if (config.url.endsWith('/courses/45'))
      return respond(config, { data: { ...course, lessons: [lesson, lessonWithoutUnlock] } });
    return respond(config, {
      data: {
        lessonId: 4500,
        courseId: 45,
        title: '파란 물감',
        description: '',
        contents: [
          {
            contentId: 45001,
            order: 1,
            segmentId: 'first',
            contentType: 'TEXT',
            body: null,
            mediaUrl: null,
            quiz: null,
            dialogue: [{ speaker: '별지기', text: '첫 대사' }, { text: '해설 대사' }],
          },
        ],
      },
    });
  };
  const { courses } = await api.learning.courses();
  assert.equal(courses.length, 2);
  assert.equal(courses[0].category, null);
  assert.equal(courses[1].category, undefined);
  assert.equal((await api.learning.course(45)).lessons.length, 2);
  const detail = await api.learning.lesson(4500);
  assert.deepEqual(detail.contents[0].dialogue, [
    { speaker: '별지기', text: '첫 대사' },
    { text: '해설 대사' },
  ]);
});

test('0.3.2 segments and all SINGLE presentation metadata survive without changing UI choices', () => {
  const presentations = [
    { type: 'AUDIO', mediaUrl: 'https://test.invalid/audio.mp3' },
    {
      type: 'TILE',
      mediaUrl: 'https://test.invalid/image.png',
      stages: [1, 4],
      rows: 2,
      columns: 2,
    },
    { type: 'ZOOM_OUT', mediaUrl: 'https://test.invalid/image.png', stages: [4, 2, 1] },
    { type: 'SHARPEN', mediaUrl: 'https://test.invalid/image.png', stages: [8, 2, 0] },
    { type: 'INLINE_WORD' },
  ];
  const quizzes = presentations.map((presentation, index) =>
    v032Quiz(32010 + index, 'SINGLE', { options: ['가', '나'], presentation }),
  );
  const raw = v032Lesson(quizzes);
  raw.segments = [
    {
      segmentId: 'first',
      title: '첫 구간',
      order: 1,
      contentIds: raw.contents.map((item) => item.contentId),
    },
  ];
  const before = JSON.parse(JSON.stringify(raw));
  const parsed = [
    contract.lesson(raw),
    contract.lessonStart({
      reviewRequired: false,
      review: null,
      progress: { status: 'IN_PROGRESS', lastContentId: null, resumeContentId: 32000 },
      contents: raw.contents,
      segments: raw.segments,
    }),
    contract.onboarding({ lesson: raw }).lesson,
  ];
  for (const lesson of parsed) {
    assert.deepEqual(lesson.segments, raw.segments);
    lesson.contents.forEach((item, index) => {
      assert.equal(item.segmentId, 'first');
      for (const key of [
        'interactionType',
        'instruction',
        'difficulty',
        'quizOrder',
        'lessonId',
        'config',
      ])
        assert.deepEqual(item.quiz[key], quizzes[index][key]);
      assert.deepEqual(item.quiz.options.choices, [
        { index: 0, label: '가' },
        { index: 1, label: '나' },
      ]);
    });
  }
  assert.deepEqual(raw, before);
  assert.equal(contract.lesson(v032Lesson([])).segments, undefined);
  assert.throws(
    () => contract.lesson({ ...raw, segments: [{ ...raw.segments[0], contentIds: ['32000'] }] }),
    /contentIds/,
  );
  assert.throws(
    () =>
      contract.quiz(
        v032Quiz(32015, 'SINGLE', {
          options: ['가', '나'],
          presentation: { type: 'TILE', stages: ['4'] },
        }),
      ),
    /stages/,
  );
});

test('0.3.2 optional grading fields stay optional and legacy mock answers remain unchanged', () => {
  const graded = contract.answerResult({
    isCorrect: false,
    completed: true,
    closeness: 0,
    source: '출처',
  });
  assert.deepEqual(graded.correctAnswer, {});
  assert.equal(graded.explanation, undefined);
  assert.equal(graded.closeness, 0);
  assert.equal(graded.source, '출처');
  for (const [key, value] of [
    ['completed', 'true'],
    ['explanation', 1],
    ['closeness', '0'],
    ['source', 1],
  ])
    assert.throws(() => contract.answerResult({ isCorrect: true, [key]: value }), /명세 불일치/);
  contract.quiz(v032Quiz(32016, 'MULTI', { options: ['가', '나'], answers: [0] }));
  const legacy = {
    quizId: 32016,
    type: 'MULTIPLE_CHOICE',
    question: '목업',
    hint: null,
    options: { choices: [{ index: 0, label: '가' }], mockHtmlType: 'multi', answer: [0] },
  };
  assert.deepEqual(contract.quiz(legacy), legacy);
  assert.deepEqual(contract.encodeAnswer(32016, { texts: ['0'] }), { texts: ['0'] });
});

test('0.3.2 flippedX survives housing, visit and save conversion for both boolean values', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const placements = [true, false].map((flippedX, index) => ({
    placementId: index + 1,
    inventoryId: `copy-${index}`,
    itemId: index + 1,
    area: 'INTERIOR',
    transform: { x: 0.2, y: 0.3, flippedX, layer: index },
  }));
  const housing = { housingId: 1, name: '우주선', isPublic: true, likeCount: 0 };
  c.http.defaults.adapter = async (config) => {
    if (config.method === 'put') {
      const body = JSON.parse(config.data);
      assert.deepEqual(
        body.placements,
        placements.map(({ inventoryId, area, transform }) => ({ inventoryId, area, transform })),
      );
      return respond(config, { data: { placements } });
    }
    return respond(config, {
      data: {
        housing,
        placements,
        avatar: { x: 0, y: 0, state: 'IDLE', placementId: null },
        ownerNickname: '방문',
        likedByMe: false,
      },
    });
  };
  const own = await api.room.me();
  const visit = await api.social.visit(1);
  const saved = await api.room.save(own.placements);
  for (const response of [own, visit, saved])
    assert.deepEqual(
      response.placements.map((item) => item.transform.flippedX),
      [true, false],
    );
  assert.throws(
    () =>
      contract.savedPlacements({
        placements: [
          { ...placements[0], transform: { ...placements[0].transform, flippedX: 'true' } },
        ],
      }),
    /flippedX/,
  );
});

test('0.3.2 optionless inventory copies do not invent an option ID', () => {
  const grouped = {
    itemId: 1,
    itemType: 'FURNITURE',
    name: '고양이',
    ownedCount: 1,
    placedCount: 0,
    availableCount: 1,
    copies: [
      {
        inventoryId: 'starter-cat',
        acquiredVia: 'STARTER',
        acquiredAt: '2026-11-12T00:00:00Z',
        placed: false,
      },
    ],
  };
  const [item] = contract.inventory({ items: [grouped] }).items;
  assert.equal(item.inventoryId, 'starter-cat');
  assert.equal(item.optionId, undefined);
  assert.deepEqual(item.option, {});
  assert.equal(item.acquiredVia, 'STARTER');
});

test('0.3.2 star badges never count as constellation completion or completion dates', () => {
  const reward = { type: 'CONSTELLATION', source: { courseId: 1, lessonId: 11 } };
  assert.equal(contract.isConstellationReward({ ...reward, badge: { badgeType: 'STAR' } }), false);
  assert.equal(
    contract.isConstellationReward({ ...reward, badge: { badgeType: 'CONSTELLATION' } }),
    true,
  );
  assert.equal(contract.isConstellationReward(reward), false);
  assert.equal(
    contract.isConstellationReward({ type: 'CONSTELLATION', source: { courseId: 1 } }),
    true,
  );
  assert.equal(
    contract.isConstellationReward({ type: 'CONSTELLATION', badge: { type: 'CONSTELLATION' } }),
    true,
  );
  assert.equal(contract.isConstellationReward({ type: 'WALLET' }), false);
});

test('0.3.2 replay completes content through API-405 and preserves optional completion data', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const quiz = v032Quiz(32020, 'SINGLE', { options: ['가', '나'] });
  const contents = v032Lesson([quiz]).contents;
  const sent = [];
  const completion = {
    rewards: [{ type: 'WALLET', currency: 'STARDUST', amount: 1 }],
    wallet: { stardust: 21, energy: 4 },
    rewardStatus: 'GRANTED',
    firstLesson: false,
    firstCompletion: false,
    courseCompleted: false,
    nextLesson: null,
  };
  c.http.defaults.adapter = async (config) => {
    sent.push({
      url: config.url,
      body: config.data === undefined ? undefined : JSON.parse(config.data),
    });
    if (config.url.endsWith('/start'))
      return respond(config, {
        data: {
          reviewRequired: false,
          review: null,
          progress: { status: 'COMPLETED', lastContentId: null, resumeContentId: 32000 },
          contents,
        },
      });
    if (config.url.includes('/quizzes/'))
      return respond(config, { data: { isCorrect: true, completed: true } });
    return respond(config, {
      data: {
        progress: { status: 'COMPLETED', lastContentId: 32000, resumeContentId: null },
        lessonCompleted: true,
        completion,
      },
    });
  };
  await api.learning.start(3200, true);
  await api.learning.answer(32020, { index: 0 }, true);
  const result = await api.learning.completeContent(32000);
  assert.deepEqual(result.completion, completion);
  assert.deepEqual(sent, [
    { url: '/lessons/3200/start', body: { replay: true } },
    { url: '/quizzes/32020/answer', body: { answer: { answer: 0 }, replay: true } },
    { url: '/contents/32000/complete', body: undefined },
  ]);
});

test('API-404 restart·API-409 도중 나가기 저장 본문과 응답(draft·contentVersion·energyNotice)', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const contents = v032Lesson([v032Quiz(32020, 'SINGLE', { options: ['가', '나'] })]).contents;
  const draft = { contentId: 32000, input: { type: 'CHOSUNG', quizId: 32020, text: 'ㅂ' } };
  const sent = [];
  c.http.defaults.adapter = async (config) => {
    sent.push({
      method: config.method,
      url: config.url,
      body: config.data === undefined ? undefined : JSON.parse(config.data),
    });
    if (config.url.endsWith('/progress'))
      return respond(config, {
        data: {
          progress: {
            status: 'IN_PROGRESS',
            lastContentId: null,
            resumeContentId: 32000,
            draft,
            contentVersion: 3,
          },
        },
      });
    return respond(config, {
      data: {
        reviewRequired: false,
        progress: {
          status: 'IN_PROGRESS',
          lastContentId: null,
          resumeContentId: 32000,
          draft,
          contentVersion: 3,
        },
        energyNotice: true,
        contents,
        segments: [],
      },
    });
  };
  const started = await api.learning.start(3200, false);
  assert.equal(started.energyNotice, true);
  assert.deepEqual(started.progress.draft, draft);
  assert.equal(started.progress.contentVersion, 3);
  await api.learning.start(3200, false, true);
  const saved = await api.learning.saveProgress(3200, 32000, draft);
  assert.deepEqual(saved.progress.draft, draft);
  await api.learning.saveProgress(3200, 32000);
  await api.learning.saveProgress(3200, 32000, null);
  assert.deepEqual(sent, [
    { method: 'post', url: '/lessons/3200/start', body: { replay: false } },
    { method: 'post', url: '/lessons/3200/start', body: { replay: false, restart: true } },
    { method: 'put', url: '/lessons/3200/progress', body: { contentId: 32000, draft } },
    { method: 'put', url: '/lessons/3200/progress', body: { contentId: 32000 } },
    { method: 'put', url: '/lessons/3200/progress', body: { contentId: 32000 } },
  ]);
});

test('초성 퀴즈 draft 는 같은 문항의 입력만 복원하고 빈 입력은 저장하지 않는다', () => {
  const { chosungDraftInput, chosungDraftText } = chosungInput;
  assert.deepEqual(chosungDraftInput(7, ' 별 자리 '), {
    type: 'CHOSUNG',
    quizId: 7,
    text: '별자리',
  });
  assert.equal(chosungDraftInput(7, '  '), null);
  assert.equal(chosungDraftText({ type: 'CHOSUNG', quizId: 7, text: '별' }, 7), '별');
  assert.equal(chosungDraftText({ type: 'CHOSUNG', quizId: 8, text: '별' }, 7), '');
  assert.equal(chosungDraftText({ type: 'SLIDER', quizId: 7, text: '별' }, 7), '');
  assert.equal(chosungDraftText({ type: 'CHOSUNG', quizId: 7, text: 3 }, 7), '');
  assert.equal(chosungDraftText(null, 7), '');
});

test('mock replay completion keeps saved progress, rewards and wallet unchanged', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    const before = JSON.parse(JSON.stringify(mockSnapshot()));
    const start = () =>
      mockApi('API-404', { path: { lessonId: 11 }, body: { replay: true } }).data.data;
    const { contents } = start();
    assert.equal(start().progress.lastContentId, null);
    const complete = (contentId) => mockApi('API-405', { path: { contentId } }).data.data;
    assert.throws(() => complete(contents[1].contentId), /콘텐츠 순서/);
    complete(contents[0].contentId);
    assert.equal(start().progress.lastContentId, contents[0].contentId);
    let result;
    for (const content of contents.slice(1)) result = complete(content.contentId);
    assert.equal(result.lessonCompleted, true);
    // #16: 이미 받은 레슨의 다시 하기도 completion 을 돌려주며 지급 없이 ALREADY_GRANTED 다.
    assert.equal(result.completion.rewardStatus, 'ALREADY_GRANTED');
    assert.deepEqual(result.completion.rewards, []);
    assert.equal(result.completion.courseCompleted, false);
    assert.deepEqual(replayCompletion(result.completion), { kind: 'replayPlain' });
    assert.equal(complete(contents.at(-1).contentId).lessonCompleted, true);
    assert.deepEqual(mockSnapshot(), before);
    assert.equal(start().progress.lastContentId, null);
  } finally {
    restoreMockSnapshot(original);
  }
});

const {
  constellationBonusLines,
  grantedStardust,
  replayCompletion,
  reviewCompletion,
  reviewScore,
} = require('../.expo/integration-tests/completionResult');

test('완료 화면 분기는 응답 rewards 의 별가루 지급량만 기준으로 한다', () => {
  const stardust = (amount) => ({ type: 'WALLET', currency: 'STARDUST', amount });
  const completion = (rewards, extra = {}) => ({
    rewards,
    wallet: { stardust: 0, energy: 0 },
    courseCompleted: false,
    ...extra,
  });
  assert.equal(
    grantedStardust([
      stardust(2),
      stardust(null),
      { type: 'CONSTELLATION', badge: {} },
      { type: 'WALLET', currency: null, amount: 9 },
    ]),
    2,
  );
  // 다시 하기(#16): 이미 받은 레슨(ALREADY_GRANTED), 이번에도 에너지 없음(NO_ENERGY), 미수령 별가루 지급(GRANTED)
  assert.deepEqual(replayCompletion(null), { kind: 'replayPlain' });
  assert.deepEqual(replayCompletion(undefined), { kind: 'replayPlain' });
  assert.deepEqual(replayCompletion(completion([], { rewardStatus: 'NO_ENERGY' })), {
    kind: 'replayPlain',
  });
  assert.deepEqual(replayCompletion(completion([], { rewardStatus: 'ALREADY_GRANTED' })), {
    kind: 'replayPlain',
  });
  assert.deepEqual(replayCompletion(completion([stardust(1)], { rewardStatus: 'GRANTED' })), {
    kind: 'replayRewarded',
    stardust: 1,
  });
  // 별가루가 실려 와도 rewardStatus 가 GRANTED 가 아니면 지급 화면을 보이지 않는다.
  assert.deepEqual(replayCompletion(completion([stardust(1)], { rewardStatus: 'NO_ENERGY' })), {
    kind: 'replayPlain',
  });
  // 별자리 완성 보너스: GRANTED 면 첫 별가루(레슨 보상)를 빼고, 아니면 모두 보너스로 센다.
  assert.deepEqual(constellationBonusLines([stardust(10), stardust(3)], true), ['별가루 +3']);
  assert.deepEqual(constellationBonusLines([stardust(3)], false), ['별가루 +3']);
  // 오늘의 복습(API-503): rewardStatus·correctCount/totalCount 를 따르고, 없으면 rewards·앱 집계로 대신한다.
  const local = { correct: 1, total: 5 };
  assert.deepEqual(
    reviewCompletion(
      { rewards: [stardust(5)], correctCount: 4, totalCount: 5, rewardStatus: 'GRANTED' },
      local,
    ),
    { kind: 'reviewRewarded', stardust: 5, score: { correct: 4, total: 5 } },
  );
  assert.deepEqual(
    reviewCompletion(
      { rewards: [], correctCount: 3, totalCount: 5, rewardStatus: 'ALREADY_GRANTED' },
      local,
    ),
    { kind: 'reviewAlreadyRewarded', score: { correct: 3, total: 5 } },
  );
  // 0.4.1 이전 멱등 응답: 정답 수 0/0 기본값과 rewardStatus 없음
  assert.deepEqual(
    reviewCompletion({ rewards: [stardust(3)], correctCount: 0, totalCount: 0 }, local),
    {
      kind: 'reviewRewarded',
      stardust: 3,
      score: local,
    },
  );
  assert.deepEqual(reviewCompletion({ rewards: [] }), {
    kind: 'reviewAlreadyRewarded',
    score: null,
  });
  assert.deepEqual(reviewScore({ 1: true, 2: false, 3: true }, [1, 2, 3]), {
    correct: 2,
    total: 3,
  });
  assert.equal(reviewScore({ 1: true }, [1, 2]), null);
  assert.equal(reviewScore({}, []), null);
});

test('목업 다시 하기: 에너지 없이 마친 레슨은 다시 마칠 때 에너지를 쓰고 별가루를 한 번만 준다', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    const fresh = {
      ...original,
      wallet: { ...original.wallet, energy: 0 },
      startedLessons: [],
      rewardedLessons: [],
      completed: [],
    };
    assert.equal(restoreMockSnapshot(fresh), true);
    mockApi('API-404', { path: { lessonId: 21 }, body: { replay: false } });
    const contents = mockApi('API-403', { path: { lessonId: 21 } }).data.data.contents;
    let first;
    for (const content of contents)
      first = mockApi('API-405', { path: { contentId: content.contentId } }).data.data;
    assert.equal(first.completion.rewardStatus, 'NO_ENERGY');

    // 다음 날 에너지가 다시 생긴 상태
    const finished = mockSnapshot();
    assert.equal(
      restoreMockSnapshot({ ...finished, wallet: { ...finished.wallet, energy: 2 } }),
      true,
    );
    const stardust = mockApi('API-904', {}).data.data.stardust;
    const replayLesson = () => {
      mockApi('API-404', { path: { lessonId: 21 }, body: { replay: true } });
      let result;
      for (const content of contents)
        result = mockApi('API-405', { path: { contentId: content.contentId } }).data.data;
      return result;
    };
    // #16: 다시 하기 시작은 에너지를 쓰지 않는다(보상 미수령이어도 에너지가 있으면 안내 없음).
    const replayStart = mockApi('API-404', { path: { lessonId: 21 }, body: { replay: true } });
    assert.equal(replayStart.data.data.energyNotice, false);
    assert.equal(mockApi('API-904', {}).data.data.energy, 2);
    const rewarded = replayLesson();
    // 보상을 받는 완료 때 에너지 1을 쓴다.
    assert.equal(rewarded.completion.wallet.energy, 1);
    assert.equal(rewarded.lessonCompleted, true);
    assert.deepEqual(rewarded.completion.rewards, [
      { type: 'WALLET', currency: 'STARDUST', amount: 1 },
    ]);
    assert.equal(rewarded.completion.rewardStatus, 'GRANTED');
    assert.equal(rewarded.completion.firstCompletion, false);
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust + 1);
    assert.deepEqual(replayCompletion(rewarded.completion), {
      kind: 'replayRewarded',
      stardust: 1,
    });

    // 같은 레슨을 또 다시 하면 에너지·별가루 모두 변하지 않는다.
    const plain = replayLesson();
    assert.equal(plain.lessonCompleted, true);
    assert.equal(plain.completion.rewardStatus, 'ALREADY_GRANTED');
    assert.deepEqual(plain.completion.rewards, []);
    assert.equal(mockApi('API-904', {}).data.data.energy, 1);
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust + 1);
    assert.deepEqual(replayCompletion(plain.completion), { kind: 'replayPlain' });
  } finally {
    restoreMockSnapshot(original);
  }
});

test('목업 다시 하기: 미지급 레슨도 에너지가 없으면 이번에도 별가루를 주지 않는다', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    const fresh = {
      ...original,
      wallet: { ...original.wallet, energy: 0 },
      startedLessons: [],
      rewardedLessons: [],
      completed: [],
    };
    assert.equal(restoreMockSnapshot(fresh), true);
    mockApi('API-404', { path: { lessonId: 21 }, body: { replay: false } });
    const contents = mockApi('API-403', { path: { lessonId: 21 } }).data.data.contents;
    for (const content of contents) mockApi('API-405', { path: { contentId: content.contentId } });
    const stardust = mockApi('API-904', {}).data.data.stardust;
    // 보상 미수령 레슨을 에너지 0으로 다시 하면 서버가 에너지 소진 안내(energyNotice)를 켠다.
    const replayStart = mockApi('API-404', { path: { lessonId: 21 }, body: { replay: true } });
    assert.equal(replayStart.data.data.energyNotice, true);
    let result;
    for (const content of contents)
      result = mockApi('API-405', { path: { contentId: content.contentId } }).data.data;
    assert.equal(result.lessonCompleted, true);
    assert.equal(result.completion.rewardStatus, 'NO_ENERGY');
    assert.deepEqual(result.completion.rewards, []);
    assert.equal(mockApi('API-904', {}).data.data.energy, 0);
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust);
    assert.deepEqual(replayCompletion(result.completion), { kind: 'replayPlain' });
  } finally {
    restoreMockSnapshot(original);
  }
});

const {
  checkReviewStart,
  isReviewSessionClosed,
  reviewRewardNotice,
} = require('../.expo/integration-tests/user/reviewStart');

test('목업 복습 회차: API-501 마다 새 회차, 5문항 제출 뒤 완료, 보상은 KST 하루 첫 완료만 별가루 5', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  const quizIds = mockApi('API-403', { path: { lessonId: 11 } })
    .data.data.contents.filter((content) => content.quiz)
    .map((content) => content.quiz.quizId);
  // 틀린 문제 4개 + 맞힌 문제 1개: 체험판 복습 회차를 만드는 최소 후보
  const fresh = {
    ...original,
    rewardedLessons: [11],
    studyAnswers: quizIds.slice(0, 5).map((quizId, index) => [quizId, index === 4]),
    reviewedToday: [],
  };
  const correctAnswer = ({ options }) =>
    options.mockHtmlType === 'ox'
      ? { value: options.answer[0] === 0 }
      : options.mockHtmlType === 'range'
        ? { texts: [String(Math.log10(options.answer[0]))] }
        : options.mockHtmlType === 'match'
          ? { order: options.answer }
          : options.mockHtmlType === 'multi'
            ? { texts: options.answer.map(String) }
            : { index: options.answer[0] };
  const next = () => contract.reviewSet(mockApi('API-501', {}).data.data);
  const answer = (item) =>
    mockApi('API-502', {
      path: { reviewItemId: item.reviewItemId },
      body: { answer: correctAnswer(item.quiz) },
    }).data.data;
  const complete = (reviewSessionId, key) =>
    mockApi('API-503', { body: { reviewSessionId }, key }).data.data;
  const status = () => mockApi('API-504', {}).data.data;
  const stardust = () => mockApi('API-904', {}).data.data.stardust;
  const closed = (error) => isReviewSessionClosed(error);
  try {
    assert.equal(restoreMockSnapshot(fresh), true);
    assert.deepEqual(status(), {
      available: true,
      candidateCount: 5,
      rewardEligible: true,
      rewardAmount: 5,
    });
    // API-504 는 회차를 만들지 않는다. API-501 은 부를 때마다 새 회차를 열고 이전 회차를 닫는다.
    const first = next();
    const second = next();
    assert.equal(first.reviewItems.length, 5);
    assert.ok(first.reviewSessionId > 0);
    assert.notEqual(second.reviewSessionId, first.reviewSessionId);
    assert.throws(() => answer(first.reviewItems[0]), closed);
    assert.throws(() => complete(first.reviewSessionId, 'review-closed'), closed);

    // 5문항을 모두 제출하기 전에는 완료할 수 없다(ERR-07).
    for (const item of second.reviewItems.slice(0, 4)) assert.equal(answer(item).isCorrect, true);
    assert.throws(() => complete(second.reviewSessionId, 'review-early'), /CONFLICT/);
    answer(second.reviewItems[4]);
    const before = stardust();
    const done = complete(second.reviewSessionId, 'review-day-1');
    assert.deepEqual(done.rewards, [{ type: 'WALLET', currency: 'STARDUST', amount: 5 }]);
    assert.equal(done.rewardStatus, 'GRANTED');
    assert.equal(done.correctCount, 5);
    assert.equal(done.totalCount, 5);
    assert.deepEqual(reviewCompletion(done), {
      kind: 'reviewRewarded',
      stardust: 5,
      score: { correct: 5, total: 5 },
    });
    assert.deepEqual(complete(second.reviewSessionId, 'review-day-1'), done);
    assert.equal(stardust(), before + 5);
    // 오늘 맞힌 문제는 후보에서 빠지고, 오늘 보상은 받았다.
    assert.deepEqual(status(), {
      available: false,
      candidateCount: 0,
      rewardEligible: false,
      rewardAmount: 5,
    });
    const empty = next();
    assert.equal(empty.reviewSessionId, null);
    assert.deepEqual(empty.reviewItems, []);

    // 같은 날 두 번째 완료는 보상 없이 ALREADY_GRANTED
    assert.equal(restoreMockSnapshot(fresh), true);
    const again = next();
    for (const item of again.reviewItems) answer(item);
    const wallet = stardust();
    const repeat = complete(again.reviewSessionId, 'review-day-2');
    assert.deepEqual(repeat.rewards, []);
    assert.equal(repeat.rewardStatus, 'ALREADY_GRANTED');
    assert.equal(stardust(), wallet);
    assert.equal(reviewCompletion(repeat).kind, 'reviewAlreadyRewarded');

    // 나가기(API-505): 204, 닫힌 회차의 답안·완료는 ERR-22, 다시 닫아도 204
    assert.equal(restoreMockSnapshot(fresh), true);
    const left = next();
    answer(left.reviewItems[0]);
    assert.equal(
      mockApi('API-505', { body: { reviewSessionId: left.reviewSessionId } }).status,
      204,
    );
    assert.throws(() => answer(left.reviewItems[1]), closed);
    assert.throws(() => complete(left.reviewSessionId, 'review-left'), closed);
    assert.equal(
      mockApi('API-505', { body: { reviewSessionId: left.reviewSessionId } }).status,
      204,
    );
    assert.throws(() => mockApi('API-505', { body: { reviewSessionId: 999999 } }), /NOT_FOUND/);
  } finally {
    restoreMockSnapshot(original);
  }
});

test('복습 안내 셋째 줄은 API-504 rewardEligible·rewardAmount 를 따르고, 모르면 비워 둔다', () => {
  const notice = (rewardEligible, rewardAmount) =>
    reviewRewardNotice({ rewardEligible, rewardAmount });
  assert.equal(notice(null, 5), null);
  assert.equal(notice(true, 5), '오늘 첫 복습 완료 시 별가루 +5');
  assert.equal(notice(true, 7), '오늘 첫 복습 완료 시 별가루 +7');
  assert.equal(notice(true, undefined), '오늘 첫 복습 완료 시 별가루 +5');
  assert.equal(notice(false, 5), '오늘의 복습 보상은 이미 받았어요.');
});

test('복습 시작은 API-504 만 읽어 available=false 면 모달, true 면 이동, 조회 실패는 그대로 올린다', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  let reply;
  const requested = [];
  c.http.defaults.adapter = async (config) => {
    requested.push(`${config.method} ${config.url}`);
    return reply(config);
  };
  const seen = [];
  const check = () =>
    checkReviewStart(
      () => api.review.status(),
      (status) => seen.push(status.rewardEligible),
    );
  const status = (available, rewardEligible) => (config) =>
    respond(config, {
      data: { available, candidateCount: available ? 7 : 2, rewardEligible, rewardAmount: 5 },
    });

  reply = status(false, false);
  assert.deepEqual(await check(), { kind: 'empty' });
  reply = status(true, true);
  assert.deepEqual(await check(), { kind: 'start' });
  assert.deepEqual(seen, [false, true]);
  // 시작 화면은 회차를 만드는 API-501 을 부르지 않는다.
  assert.deepEqual(requested, ['get /reviews/status', 'get /reviews/status']);

  // 서버 오류와 계약에 맞지 않는 응답은 예외로 올라가 기존 오류 표시로 간다.
  reply = (config) => fail(config, 500, 'INTERNAL_ERROR');
  await assert.rejects(check());
  reply = (config) => respond(config, { data: { available: true, rewardEligible: true } });
  await assert.rejects(check());
  assert.deepEqual(seen, [false, true]);
});

test('복습 회차 API: API-501 은 인자 없이, 완료는 reviewSessionId·멱등 키, 나가기는 204, ERR-22 를 구분한다', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const quiz = v032Quiz(32040, 'SINGLE', { options: ['가', '나'] });
  const sent = [];
  c.http.defaults.adapter = async (config) => {
    sent.push({
      call: `${config.method} ${config.url}`,
      params: config.params,
      body: config.data ? JSON.parse(config.data) : undefined,
      key: config.headers.get('Idempotency-Key') ?? undefined,
    });
    if (config.url === '/reviews/next')
      return respond(config, {
        data: {
          reviewSessionId: 41,
          reviewItems: [{ reviewItemId: 4101, quiz }],
          message: null,
          rewardEligible: true,
        },
      });
    if (config.url === '/reviews/complete')
      return respond(config, {
        data: {
          rewards: [{ type: 'WALLET', currency: 'STARDUST', amount: 5 }],
          wallet: { stardust: 25, energy: 5 },
          correctCount: 4,
          totalCount: 5,
          rewardStatus: 'GRANTED',
        },
      });
    if (config.url === '/reviews/abandon') return respond(config, '', 204);
    return fail(config, 409, 'REVIEW_SESSION_CLOSED');
  };
  const set = await api.review.next();
  assert.equal(set.reviewSessionId, 41);
  const done = await api.review.complete(41, 'review-key-41');
  assert.equal(done.rewardStatus, 'GRANTED');
  assert.deepEqual(reviewCompletion(done, { correct: 0, total: 5 }), {
    kind: 'reviewRewarded',
    stardust: 5,
    score: { correct: 4, total: 5 },
  });
  assert.equal(await api.review.abandon(41), undefined);
  const error = await api.review.answer(4101, { index: 0 }).catch((cause) => cause);
  assert.equal(isReviewSessionClosed(error), true);
  assert.equal(error.status, 409);
  assert.equal(isReviewSessionClosed(new Error('CONFLICT')), false);
  assert.deepEqual(
    sent.slice(0, 3).map(({ call, params, body, key }) => ({ call, params, body, key })),
    [
      { call: 'get /reviews/next', params: undefined, body: undefined, key: undefined },
      {
        call: 'post /reviews/complete',
        params: undefined,
        body: { reviewSessionId: 41 },
        key: 'review-key-41',
      },
      {
        call: 'post /reviews/abandon',
        params: undefined,
        body: { reviewSessionId: 41 },
        key: undefined,
      },
    ],
  );
});

const {
  chainLines,
  constellationImage,
  constellationShape,
  fallbackLayout,
  findConstellationLayout,
  litStars,
  nextLessonOf,
  recordStars,
  segmentStyle,
  starLayout,
} = require('../.expo/integration-tests/user/constellationRecord');
const {
  constellationLayouts,
  layoutsByStarCount,
} = require('../.expo/integration-tests/user/constellationLayouts');

const lessonSummary = (lessonId, order, status) => ({
  lessonId,
  title: `레슨 ${lessonId}`,
  order,
  status,
  unlocksAt: null,
  completedAt: null,
});

test('별자리 기록: 완료는 흰 별, 다음 학습은 ?, 나머지는 빈 별이며 레슨 순서대로 놓인다', () => {
  const lessons = [
    lessonSummary(13, 3, 'LOCKED'),
    lessonSummary(11, 1, 'COMPLETED'),
    lessonSummary(12, 2, 'UNLOCKED'),
  ];
  // 다음 학습은 기존 규칙(목록에서 처음 나오는 IN_PROGRESS·UNLOCKED)을 그대로 쓴다.
  assert.equal(nextLessonOf(lessons).lessonId, 12);
  const stars = recordStars(lessons, 12, null);
  assert.deepEqual(
    stars.map((star) => [star.lessonId, star.state]),
    [
      [11, 'done'],
      [12, 'next'],
      [13, 'todo'],
    ],
  );
  assert.equal(litStars(stars), 1);
  // 별 3개는 Figma 임시 배치를 쓴다.
  assert.deepEqual(
    stars.map((star) => star.point),
    layoutsByStarCount[3].stars,
  );
  assert.equal(segmentStyle('done'), 'solid');
  assert.equal(segmentStyle('next'), 'dashed');
  assert.equal(segmentStyle('todo'), 'dashed');

  // 다음 학습이 없으면(전부 완료·잠김) ? 별을 만들지 않는다.
  const finished = recordStars(
    [lessonSummary(1, 1, 'COMPLETED'), lessonSummary(2, 2, 'LOCKED')],
    null,
    null,
  );
  assert.deepEqual(
    finished.map((star) => star.state),
    ['done', 'todo'],
  );
  assert.equal(nextLessonOf([lessonSummary(1, 1, 'COMPLETED')]), null);
  // 진행 중 레슨이 다음 학습이다.
  assert.equal(
    nextLessonOf([lessonSummary(1, 1, 'COMPLETED'), lessonSummary(2, 2, 'IN_PROGRESS')]).lessonId,
    2,
  );
});

test('별 위치는 별자리별 설정 → 별 개수별 기본 → 자동 배치 순이고 그림은 서버 imageUrl 이 먼저다', () => {
  const unknown = { name: '없는 별자리' };
  for (const count of [0, 1, 2, 4, 7, 15]) {
    const points = fallbackLayout(count);
    assert.equal(points.length, count);
    assert.ok(points.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
    assert.deepEqual(
      starLayout(unknown, count),
      count === 3 ? layoutsByStarCount[3].stars : points,
    );
    // 설정이 없으면 별 순서대로 잇는다.
    assert.deepEqual(constellationShape(unknown, count).lines, chainLines(count));
  }
  const custom = {
    name: '시험 고양이 자리',
    slug: 'test-cat',
    stars: [0.1, 0.3, 0.5, 0.7].map((x) => ({ x, y: x })),
    lines: [
      [0, 1],
      [1, 2],
      [1, 3],
    ],
    image: 42,
  };
  constellationLayouts.push(custom);
  try {
    // 이름은 띄어쓰기를 무시하고, slug 가 맞으면 이름이 달라도 찾는다.
    assert.equal(findConstellationLayout({ name: '시험고양이자리' }), custom);
    assert.equal(findConstellationLayout({ name: '다른 이름', slug: 'test-cat' }), custom);
    assert.equal(findConstellationLayout(null), undefined);
    const key = { name: custom.name };
    assert.deepEqual(starLayout(key, 4), custom.stars);
    // 레슨이 설정보다 적으면 앞에서부터 쓰고 남는 별에 닿는 선은 뺀다.
    assert.deepEqual(constellationShape(key, 3), {
      points: custom.stars.slice(0, 3),
      lines: [
        [0, 1],
        [1, 2],
      ],
    });
    // 설정보다 별이 많으면 설정을 쓰지 않는다.
    assert.equal(starLayout(key, 5).length, 5);
    assert.deepEqual(constellationShape(key, 5).lines, chainLines(5));
    assert.equal(constellationImage(key, null), 42);
    assert.deepEqual(constellationImage(key, 'https://img.example/77.png'), {
      uri: 'https://img.example/77.png',
    });
  } finally {
    constellationLayouts.pop();
  }
  assert.equal(constellationImage(null, null), null);
});

test('Figma 별자리 10개 설정: 좌표는 0~1, 선은 있는 별끼리, 별자리마다 하나로 이어진다', () => {
  assert.equal(constellationLayouts.length, 10);
  const starCounts = constellationLayouts.map((layout) => layout.stars.length);
  // 기획표 '별자리 10개'의 레슨 수
  assert.deepEqual(starCounts, [6, 5, 6, 5, 7, 6, 6, 6, 6, 6]);
  for (const layout of constellationLayouts) {
    const count = layout.stars.length;
    assert.ok(
      layout.stars.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1),
      layout.name,
    );
    assert.ok(
      layout.lines.every(([a, b]) => Number.isInteger(a) && a >= 0 && a < b && b < count),
      layout.name,
    );
    const linked = new Set([0]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [a, b] of layout.lines) {
        if (linked.has(a) !== linked.has(b)) {
          linked.add(a);
          linked.add(b);
          grew = true;
        }
      }
    }
    assert.equal(linked.size, count, `${layout.name}: 떨어진 별이 있다`);
    assert.equal(findConstellationLayout({ name: layout.name }), layout);
  }
});

test('별자리 10개 slug 는 기획자 시뮬레이터 id 와 같고 slug 로 찾는다', () => {
  const expected = {
    '반짝반짝 반딧불자리': 'firefly',
    '50년 묵은 꿀단지자리': 'honeypot',
    '냥칼진 오르골자리': 'musicbox',
    '자기가 사람인 줄 아는 고양이 자리': 'human-cat',
    '목욕하기 싫어하는 고양이 자리': 'bath-cat',
    '하늘을 나는 종이배자리': 'paperboat',
    '둥실둥실 민들레자리': 'dandelion',
    '어떡할까냥 자리': 'choose-cat',
    '주인만 기다리는 고양이 자리': 'waiting-cat',
    '츄르는 많을수록 좋다냥 자리': 'churu-cat',
  };
  const figma = constellationLayouts.filter((layout) => layout.name in expected);
  assert.equal(figma.length, 10);
  for (const layout of figma) {
    assert.equal(layout.slug, expected[layout.name]);
    // 서버 이름이 달라져도 slug 가 맞으면 같은 설정을 쓴다.
    assert.equal(findConstellationLayout({ name: '바뀐 이름', slug: layout.slug }), layout);
  }
});

test('목업: 레슨을 마치고 코스 상세를 다시 읽으면 흰 별이 늘고 ? 가 다음 레슨으로 옮겨 간다', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    assert.equal(
      restoreMockSnapshot({ ...original, startedLessons: [], rewardedLessons: [], completed: [] }),
      true,
    );
    const course = mockApi('API-401', {}).data.data.courses[0];
    const detail = () => mockApi('API-402', { path: { courseId: course.courseId } }).data.data;
    const before = detail();
    const next = nextLessonOf(before.lessons);
    assert.ok(next, '목업 첫 코스에 진행할 레슨이 있어야 한다');
    const beforeStars = recordStars(before.lessons, next.lessonId, before.constellation);
    assert.equal(beforeStars.find((star) => star.lessonId === next.lessonId).state, 'next');

    mockApi('API-404', { path: { lessonId: next.lessonId }, body: { replay: false } });
    const contents = mockApi('API-403', { path: { lessonId: next.lessonId } }).data.data.contents;
    for (const content of contents) mockApi('API-405', { path: { contentId: content.contentId } });

    const after = detail();
    const afterNext = nextLessonOf(after.lessons);
    const afterStars = recordStars(after.lessons, afterNext?.lessonId ?? null, after.constellation);
    assert.equal(afterStars.find((star) => star.lessonId === next.lessonId).state, 'done');
    assert.equal(litStars(afterStars), litStars(beforeStars) + 1);
    assert.ok(afterStars.filter((star) => star.state === 'next').length <= 1);
  } finally {
    restoreMockSnapshot(original);
  }
});

const {
  completedConstellations,
  constellationCompletedOn,
  formatDotDate,
  isConstellationComplete,
} = require('../.expo/integration-tests/user/constellationRecord');

test('별자리 완성은 소속 레슨 전체 완료로 계산하고, 목록은 서버 이름·순서를 쓴다', () => {
  assert.equal(isConstellationComplete({ totalLessons: 3, completedLessons: 3 }), true);
  assert.equal(isConstellationComplete({ totalLessons: 3, completedLessons: 2 }), false);
  // 레슨이 없는 코스는 완성으로 보지 않는다.
  assert.equal(isConstellationComplete({ totalLessons: 0, completedLessons: 0 }), false);

  const course = (courseId, completedLessons, totalLessons, constellation) => ({
    courseId,
    title: `코스 ${courseId}`,
    completedLessons,
    totalLessons,
    constellation,
  });
  const courses = [
    course(2, 4, 4, { constellationId: 20, name: '코스 별자리' }),
    course(1, 1, 3, { constellationId: 10, name: '진행 중' }),
    course(3, 3, 3, null),
  ];
  const constellations = [
    { constellationId: 20, courseId: 2, name: '서버 별자리', starCount: 4, imageUrl: null },
  ];
  const list = completedConstellations(courses, constellations, { 2: '2026. 11. 05' });
  assert.deepEqual(
    list.map((item) => [item.courseId, item.name, item.completedOn, item.points.length]),
    [
      [2, '서버 별자리', '2026. 11. 05', 4],
      [3, '코스 3', null, 3],
    ],
  );
  // 별자리 조회(API-906)가 실패해도 코스 정보로 목록을 만든다.
  assert.equal(completedConstellations(courses, null, {})[0].name, '코스 별자리');
  // 완성한 별자리가 없으면 빈 목록(빈 상태 화면).
  assert.deepEqual(completedConstellations([course(1, 0, 3, null)], constellations, {}), []);
});

test('완성일은 한국시간 YYYY. MM. DD 이고, 상세 완성일은 모든 레슨 완료 때만 마지막 완료 시각이다', () => {
  // 2026-11-04T15:30Z = 2026-11-05 00:30 KST
  assert.equal(formatDotDate('2026-11-04T15:30:00Z'), '2026. 11. 05');
  const done = (completedAt) => ({ status: 'COMPLETED', completedAt });
  assert.equal(
    constellationCompletedOn([done('2026-11-01T01:00:00Z'), done('2026-11-04T15:30:00Z')]),
    '2026. 11. 05',
  );
  assert.equal(
    constellationCompletedOn([
      done('2026-11-01T01:00:00Z'),
      { status: 'UNLOCKED', completedAt: null },
    ]),
    null,
  );
  assert.equal(constellationCompletedOn([]), null);
  assert.equal(constellationCompletedOn([done(null)]), null);
});

test('목업: 코스의 레슨을 모두 마치면 완성 별자리 목록에 나타나고, 그 전에는 빈 목록이다', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    assert.equal(
      restoreMockSnapshot({
        ...original,
        startedLessons: [],
        rewardedLessons: [],
        completed: [],
        completedConstellations: [],
      }),
      true,
    );
    const read = () => {
      const courses = mockApi('API-401', {}).data.data.courses;
      return completedConstellations(courses, mockApi('API-906', {}).data.data.constellations, {});
    };
    const target = mockApi('API-401', {}).data.data.courses.find(
      (course) => course.completedLessons === 0,
    );
    assert.ok(target, '아직 시작하지 않은 목업 코스가 있어야 한다');
    assert.equal(
      read().some((item) => item.courseId === target.courseId),
      false,
    );

    const detail = mockApi('API-402', { path: { courseId: target.courseId } }).data.data;
    for (const lesson of detail.lessons) {
      mockApi('API-404', { path: { lessonId: lesson.lessonId }, body: { replay: false } });
      const contents = mockApi('API-403', { path: { lessonId: lesson.lessonId } }).data.data
        .contents;
      for (const content of contents)
        mockApi('API-405', { path: { contentId: content.contentId } });
    }
    const after = read().find((item) => item.courseId === target.courseId);
    assert.ok(after, '레슨을 모두 마친 코스는 완성 목록에 있어야 한다');
    assert.equal(after.points.length, target.totalLessons);
  } finally {
    restoreMockSnapshot(original);
  }
});

test('0.4.1 response fields: ungraded answers, correctWord, userCode, new rewards, star titles and option locks', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({
    ...tokens,
    user: { ...user, userCode: '42001000' },
    isNew: false,
  }));
  const progress = { status: 'IN_PROGRESS', lastContentId: null, resumeContentId: null };
  const responses = {
    'post /lessons/4500/start': { reviewRequired: false, progress, contents: [] },
    'post /quizzes/1/answer': {
      graded: false,
      isCorrect: null,
      completed: true,
      explanation: '해설',
    },
    'post /quizzes/2/answer': {
      graded: true,
      isCorrect: false,
      completed: true,
      correctAnswer: { answer: 6 },
      correctWord: '헬륨',
    },
    'post /lessons/4500/complete': {
      rewards: [
        { type: 'WALLET', currency: 'STARDUST', amount: 10 },
        { type: 'WALLET', currency: 'ENERGY', amount: 1 },
        { type: 'WALLET', currency: 'STARDUST', amount: 20, convertedEnergy: 2 },
        { type: 'UNLOCK', itemId: 3, optionId: 31 },
        { type: 'STORY', storyId: 7 },
        { type: 'CONSTELLATION', badge: { badgeType: 'CONSTELLATION' } },
      ],
      wallet: { stardust: 30, energy: 5 },
      courseCompleted: true,
    },
    'get /constellations': {
      constellations: [
        {
          constellationId: 1,
          courseId: 45,
          name: '반딧불자리',
          starCount: 2,
          earnedStars: 1,
          badgeEarned: false,
          imageUrl: null,
          stars: [
            { lessonId: 4500, title: '파란 물감', order: 1, completed: true, completedAt: null },
            { lessonId: 4501, title: null, order: 2, completed: false, completedAt: null },
          ],
        },
      ],
    },
    'get /shop/items': {
      items: [
        {
          itemId: 3,
          name: '벽지',
          itemType: 'WALL',
          unlocked: true,
          unlockHint: null,
          minPrice: { currency: 'STARDUST', amount: 100 },
          options: [
            {
              optionId: 31,
              option: { color: 'blue' },
              currency: 'STARDUST',
              price: 100,
              previewAsset: 'wall.png',
              ownedCount: 0,
              unlocked: false,
              unlockHint: '반딧불자리 완성 보상',
            },
          ],
        },
      ],
    },
  };
  c.http.defaults.adapter = async (config) => {
    const key = `${config.method} ${config.url.replace(/^.*\/api\/v1/, '')}`;
    assert.ok(key in responses, key);
    return respond(config, { data: responses[key] });
  };
  const start = await api.learning.start(4500, false);
  assert.equal(start.review, undefined);
  const ungraded = await api.learning.answer(1, { index: 0 });
  assert.equal(ungraded.isCorrect, null);
  assert.deepEqual(ungraded.correctAnswer, {});
  assert.equal((await api.learning.answer(2, { index: 1 })).correctWord, '헬륨');
  const completion = await api.learning.completeLesson(4500);
  assert.deepEqual(constellationBonusLines(completion.rewards, true), [
    '에너지 +1',
    '별가루 +20 (넘친 에너지 2개)',
    '상점 새 색상 해금',
    '세계관 이야기 해금',
  ]);
  const { constellations } = await api.benefits.constellations();
  assert.equal(constellations[0].stars[1].title, null);
  const { items } = await api.room.shop();
  assert.equal(items[0].options[0].unlocked, false);
  assert.equal(c.getSnapshot().user.userCode, '42001000');
});
const { socialLoginErrorModal } = require('../.expo/integration-tests/user/socialLoginResult');
const { firstStudyRoute } = require('../.expo/integration-tests/user/welcomeFlow');

test('소셜 로그인 실패는 세션과 오류 종류에 따라 M02_7·M02_8·M02_9 로 나뉜다', () => {
  const { IntegrationError } = require('../.expo/integration-tests/client');
  const conflict = new IntegrationError('충돌', 'ACCOUNT_EXISTS_FOR_PROVIDER', 409);
  const guest = { guest: true, switchingToExisting: false };
  const member = { guest: false, switchingToExisting: false };
  assert.equal(socialLoginErrorModal(conflict, guest), 'switchAccount');
  // 서버가 switchToExisting 을 무시해 같은 409 가 다시 오면 M02_8 을 반복하지 않는다.
  assert.equal(
    socialLoginErrorModal(conflict, { guest: true, switchingToExisting: true }),
    'authFailed',
  );
  assert.equal(socialLoginErrorModal(conflict, member), 'authFailed');
  const unauthorized = new IntegrationError('인증', 'UNAUTHORIZED', 401);
  assert.equal(socialLoginErrorModal(unauthorized, guest), 'authFailed');
  assert.equal(socialLoginErrorModal(unauthorized, member), 'authFailed');
  const server = new IntegrationError('서버', 'INTERNAL', 500);
  assert.equal(socialLoginErrorModal(server, guest), 'migrationFailed');
  assert.equal(socialLoginErrorModal(server, member), 'authFailed');
  const network = new IntegrationError('연결', 'ERR_NETWORK', null);
  assert.equal(socialLoginErrorModal(network, guest), 'migrationFailed');
  const config = new IntegrationError('설정', 'CONFIGURATION_ERROR', null);
  assert.equal(socialLoginErrorModal(config, guest), 'authFailed');
  assert.equal(socialLoginErrorModal(new Error('Google 오류'), guest), 'authFailed');
});

test('소셜 로그인은 isNew 를 돌려주고 switchToExisting 을 요청할 때만 보낸다', async () => {
  const { c, api } = setup();
  const bodies = [];
  c.http.defaults.adapter = async (config) => {
    bodies.push(JSON.parse(config.data));
    return respond(config, { data: { ...tokens, user, isNew: bodies.length === 1 } });
  };
  assert.deepEqual(await api.account.oauthLogin('google', { idToken: 'id-1' }), { isNew: true });
  assert.equal('switchToExisting' in bodies[0], false);
  assert.deepEqual(
    await api.account.oauthLogin('google', { idToken: 'id-1', switchToExisting: true }),
    {
      isNew: false,
    },
  );
  assert.equal(bodies[1].switchToExisting, true);
  assert.equal(c.getSnapshot().authenticated, true);
});

test('목업 소셜 로그인 시나리오로 새 회원·기존 계정 충돌·서버 오류를 만든다', async () => {
  const modulePath = require.resolve('../.expo/integration-tests/mockApi');
  const prior = process.env.EXPO_PUBLIC_MOCK_SCENARIO;
  const load = (scenario) => {
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = scenario;
    delete require.cache[modulePath];
    return require(modulePath).mockApi;
  };
  const oauth = { path: { provider: 'google' }, body: { idToken: 'mock' } };
  try {
    const fresh = load('oauth-new');
    fresh('API-104', {});
    assert.equal(fresh('API-105', oauth).data.data.isNew, true);
    fresh('API-101', {});
    assert.equal(fresh('API-105', oauth).data.data.isNew, false);
    const conflict = load('oauth-conflict');
    conflict('API-101', {});
    for (const body of [oauth.body, { ...oauth.body, switchToExisting: true }])
      assert.throws(
        () => conflict('API-105', { ...oauth, body }),
        (error) => error.code === 'ACCOUNT_EXISTS_FOR_PROVIDER' && error.status === 409,
      );
    assert.throws(
      () => load('oauth-server-error')('API-105', oauth),
      (error) => error.status === 500,
    );
    assert.throws(
      () => load('oauth-unauthorized')('API-105', oauth),
      (error) => error.status === 401,
    );
  } finally {
    if (prior === undefined) delete process.env.EXPO_PUBLIC_MOCK_SCENARIO;
    else process.env.EXPO_PUBLIC_MOCK_SCENARIO = prior;
    delete require.cache[modulePath];
  }
});

test('첫 학습 경로는 첫 코스의 잠기지 않은 레슨을 열고 불러오지 못하면 null 이다', async () => {
  const learning = {
    courses: async () => ({ courses: [{ courseId: 3 }] }),
    course: async () => ({
      lessons: [
        { lessonId: 31, title: '잠김', status: 'LOCKED' },
        { lessonId: 32, title: '별의 탄생', status: 'COMPLETED' },
      ],
    }),
  };
  assert.deepEqual(await firstStudyRoute(learning), {
    pathname: '/learn/study/[lessonId]',
    params: { lessonId: '32', title: '별의 탄생', fromWelcome: 'true', replay: 'true' },
  });
  assert.equal(
    await firstStudyRoute({ ...learning, courses: async () => ({ courses: [] }) }),
    null,
  );
  assert.equal(
    await firstStudyRoute({
      ...learning,
      courses: async () => {
        throw new Error('offline');
      },
    }),
    null,
  );
});
