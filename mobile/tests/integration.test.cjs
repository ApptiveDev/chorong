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
test('all 47 APIs are inventoried; unused avatar and artwork APIs remain deferred', async () => {
  assert.equal(Object.keys(catalog).length, 47);
  const { c } = setup();
  let sent = 0;
  c.http.defaults.adapter = async (config) => {
    sent++;
    return respond(config, {});
  };
  const deferred = Object.keys(catalog).filter((id) => catalog[id][3] === 'deferred');
  assert.deepEqual(deferred, ['API-704', 'API-908']);
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
test('profile nickname validation follows the server length and rejects unsupported characters', () => {
  assert.equal(nicknameValidationError('가'), '닉네임은 2~12자로 입력하세요.');
  assert.equal(
    nicknameValidationError('가나다라마바사아자차카타파'),
    '닉네임은 2~12자로 입력하세요.',
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
  assert.equal((await api.review.next(11)).reviewItems.length, 0);
  for (const content of lesson.contents) await api.learning.completeContent(content.contentId);
  const review = await api.review.next(11);
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
    (await api.review.next(11)).reviewItems.some((item) => item.quiz.quizId === first.quiz.quizId),
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
    [5, 10],
  );
  assert.equal(
    completedCourse.completion.rewards.some((item) => item.type === 'CONSTELLATION'),
    true,
  );
  assert.equal(
    (await api.benefits.constellations()).constellations.find((item) => item.courseId === 1).name,
    '빛을 찾아서',
  );
  assert.equal(
    (await api.benefits.rewards({ size: 100 })).data.rewards.some(
      (item) => item.type === 'CONSTELLATION' && item.source.courseId === 1,
    ),
    true,
  );
});
test('달의 모양 목업은 맞아요만 정답으로 채점한다', () => {
  const moon = mockApi('API-403', { path: { lessonId: 12 } }).data.data;
  const quiz = moon.contents.find((content) => content.quiz)?.quiz;
  assert.ok(quiz);
  const grade = (index) =>
    mockApi('API-406', {
      path: { quizId: quiz.quizId },
      body: { answer: { index } },
    }).data.data;
  assert.equal(grade(0).isCorrect, true);
  assert.equal(grade(1).isCorrect, false);
  assert.deepEqual(grade(1).correctAnswer, { answer: [0] });
  mockApi('API-501', { query: { lessonId: 12 } });
  const review = mockApi('API-502', {
    path: { reviewItemId: 1 },
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

  const review = await api.review.next(22);
  assert.equal(review.reviewItems[0].quiz.type, 'CHOSUNG');
  const reviewed = await api.review.answer(review.reviewItems[0].reviewItemId, {
    texts: ['증발'],
  });
  assert.equal(reviewed.isCorrect, true);
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

  const review = await api.review.next(21);
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

test('목업 레슨 시작은 처음 시작할 때만 에너지를 쓰고, 에너지 없이 마치면 별가루를 주지 않는다', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    const fresh = {
      ...original,
      wallet: { ...original.wallet, energy: 5 },
      startedLessons: [],
      rewardedLessons: [],
      completed: [],
    };
    assert.equal(restoreMockSnapshot(fresh), true);
    const start = () => mockApi('API-404', { path: { lessonId: 21 }, body: { replay: false } });
    start();
    assert.equal(mockApi('API-904', {}).data.data.energy, 4);
    start();
    assert.equal(mockApi('API-904', {}).data.data.energy, 4);

    assert.equal(restoreMockSnapshot({ ...fresh, wallet: { ...fresh.wallet, energy: 0 } }), true);
    start();
    assert.equal(mockApi('API-904', {}).data.data.energy, 0);

    const stardust = mockApi('API-904', {}).data.data.stardust;
    const contents = mockApi('API-403', { path: { lessonId: 21 } }).data.data.contents;
    let result;
    for (const content of contents)
      result = mockApi('API-405', { path: { contentId: content.contentId } }).data.data;
    assert.equal(result.lessonCompleted, true);
    assert.equal(result.completion.stardustSkipped, true);
    assert.equal(
      result.completion.rewards.some((item) => item.type === 'WALLET'),
      false,
    );
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust);
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

test('0.3.2 topic filters work together and old course responses remain valid', async () => {
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  const mock = new IntegrationClient(
    'https://mock.invalid/api/v1',
    storage,
    () => uuid,
    false,
    mockApi,
  );
  const api = createIntegrationApi(mock);
  await api.account.guest('ANDROID');
  const all = (await api.learning.courses()).courses;
  assert.equal(all.length, 4);
  assert.ok(all.every((item) => typeof item.topic === 'string'));
  const first = all[0];
  assert.deepEqual((await api.learning.courses(undefined, first.topic)).courses, [first]);
  assert.deepEqual((await api.learning.courses(first.category, first.topic)).courses, [first]);
  assert.deepEqual((await api.learning.courses('없는 분야', first.topic)).courses, []);
  assert.equal((await api.learning.course(first.courseId)).topic, first.topic);
  const { c, api: real } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const { topic, ...legacy } = first;
  c.http.defaults.adapter = async (config) => {
    assert.deepEqual(config.params, { category: first.category, topic });
    return respond(config, { data: { courses: [legacy] } });
  };
  const response = await real.learning.courses(first.category, topic);
  assert.equal(response.courses[0].topic, undefined);
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
    courseCompleted: false,
    quizSummary: { correctCount: 1, totalCount: 1 },
    stardustSkipped: false,
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
    assert.equal(result.completion, null);
    assert.equal(complete(contents.at(-1).contentId).lessonCompleted, true);
    assert.deepEqual(mockSnapshot(), before);
    assert.equal(start().progress.lastContentId, null);
  } finally {
    restoreMockSnapshot(original);
  }
});

const {
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
  // 다시 하기: 이미 받은 레슨(null), 이번에도 에너지 없음(stardustSkipped), 미지급 별가루 지급
  assert.deepEqual(replayCompletion(null), { kind: 'replayPlain' });
  assert.deepEqual(replayCompletion(undefined), { kind: 'replayPlain' });
  assert.deepEqual(replayCompletion(completion([], { stardustSkipped: true })), {
    kind: 'replayPlain',
  });
  assert.deepEqual(replayCompletion(completion([stardust(1)], { stardustSkipped: false })), {
    kind: 'replayRewarded',
    stardust: 1,
  });
  // 오늘의 복습: 지급 / 하루 한도 초과·이미 끝난 세션(rewards=[])
  assert.deepEqual(reviewCompletion([stardust(3)]), { kind: 'reviewRewarded', stardust: 3 });
  assert.deepEqual(reviewCompletion([]), { kind: 'reviewAlreadyRewarded' });
  assert.deepEqual(reviewScore({ 1: true, 2: false, 3: true }, [1, 2, 3]), {
    correct: 2,
    total: 3,
  });
  assert.equal(reviewScore({ 1: true }, [1, 2]), null);
  assert.equal(reviewScore({}, []), null);
});

test('목업 다시 하기: 에너지 없이 마친 레슨은 에너지를 쓰고 다시 마치면 별가루를 한 번만 준다', () => {
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
    assert.equal(first.completion.stardustSkipped, true);

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
    mockApi('API-404', { path: { lessonId: 21 }, body: { replay: true } });
    assert.equal(mockApi('API-904', {}).data.data.energy, 1);
    const rewarded = replayLesson();
    // 이어서 시작해도 에너지를 다시 쓰지 않는다.
    assert.equal(rewarded.completion.wallet.energy, 1);
    assert.equal(rewarded.lessonCompleted, true);
    assert.deepEqual(rewarded.completion.rewards, [
      { type: 'WALLET', currency: 'STARDUST', amount: 5 },
    ]);
    assert.equal(rewarded.completion.stardustSkipped, false);
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust + 5);
    assert.deepEqual(replayCompletion(rewarded.completion), {
      kind: 'replayRewarded',
      stardust: 5,
    });

    // 같은 레슨을 또 다시 하면 에너지·별가루 모두 변하지 않는다.
    const plain = replayLesson();
    assert.equal(plain.lessonCompleted, true);
    assert.equal(plain.completion, null);
    assert.equal(mockApi('API-904', {}).data.data.energy, 1);
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust + 5);
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
    mockApi('API-404', { path: { lessonId: 21 }, body: { replay: true } });
    let result;
    for (const content of contents)
      result = mockApi('API-405', { path: { contentId: content.contentId } }).data.data;
    assert.equal(result.lessonCompleted, true);
    assert.equal(result.completion.stardustSkipped, true);
    assert.deepEqual(result.completion.rewards, []);
    assert.equal(mockApi('API-904', {}).data.data.energy, 0);
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust);
    assert.deepEqual(replayCompletion(result.completion), { kind: 'replayPlain' });
  } finally {
    restoreMockSnapshot(original);
  }
});

test('목업 복습 완료는 하루 3세션까지 보상하고 같은 키 재요청은 다시 지급하지 않는다', () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    const complete = (key) =>
      mockApi('API-503', { body: { reviewItemIds: [1, 2, 3, 4, 5] }, key }).data.data;
    const stardust = mockApi('API-904', {}).data.data.stardust;
    const first = complete('review-test-1');
    assert.deepEqual(reviewCompletion(first.rewards), { kind: 'reviewRewarded', stardust: 3 });
    assert.deepEqual(complete('review-test-1'), first);
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust + 3);
    complete('review-test-2');
    complete('review-test-3');
    const fourth = complete('review-test-4');
    assert.deepEqual(fourth.rewards, []);
    assert.deepEqual(reviewCompletion(fourth.rewards), { kind: 'reviewAlreadyRewarded' });
    assert.equal(mockApi('API-904', {}).data.data.stardust, stardust + 9);
  } finally {
    restoreMockSnapshot(original);
  }
});

const {
  checkReviewStart,
  kstDate,
  markReviewRewardedToday,
  reviewRewardNotice,
  reviewRewardedToday,
} = require('../.expo/integration-tests/user/reviewStart');

test('복습 안내 셋째 줄: 오늘 완료 기록 또는 rewardEligible=false 면 보상 받음, 모르면 비워 둔다', () => {
  const first = '오늘 첫 복습 완료 시 별가루 +5';
  const already = '오늘의 복습 보상은 이미 받았어요.';
  const notice = (rewardEligible, rewardedToday) =>
    reviewRewardNotice({ rewardEligible, rewardedToday });
  assert.equal(notice(null, null), null);
  assert.equal(notice(true, null), null);
  assert.equal(notice(null, false), null);
  assert.equal(notice(true, false), first);
  // 하루 3세션 중 첫 완료 뒤에도 서버 rewardEligible 은 true 지만 완료 기록으로 ② 를 보여 준다.
  assert.equal(notice(true, true), already);
  assert.equal(notice(null, true), already);
  assert.equal(notice(false, false), already);
  assert.equal(notice(false, null), already);
});

test('복습 완료 기록은 사용자별·KST 날짜별이며 재실행 뒤에도 저장소에서 읽힌다', async () => {
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
  // 2026-11-14 23:30 KST = 2026-11-14T14:30Z, 다음 날 00:10 KST = 2026-11-14T15:10Z
  const lateNight = Date.parse('2026-11-14T14:30:00Z');
  const afterMidnight = Date.parse('2026-11-14T15:10:00Z');
  assert.equal(kstDate(lateNight), '2026-11-14');
  assert.equal(kstDate(afterMidnight), '2026-11-15');
  assert.equal(await reviewRewardedToday(storage, 7, lateNight), false);
  await markReviewRewardedToday(storage, 7, lateNight);
  assert.equal(await reviewRewardedToday(storage, 7, lateNight), true);
  // 같은 기기의 다른 사용자, 날짜가 바뀐 뒤에는 기록이 적용되지 않는다.
  assert.equal(await reviewRewardedToday(storage, 8, lateNight), false);
  assert.equal(await reviewRewardedToday(storage, 7, afterMidnight), false);
  // SecureStore 키 규칙([A-Za-z0-9._-])을 지킨다.
  assert.ok([...entries.keys()].every((key) => /^[A-Za-z0-9._-]+$/.test(key)));
});

test('복습 시작은 문항 0개면 모달, 1개 이상이면 이동, 조회 실패는 문제 없음으로 바꾸지 않는다', async () => {
  const { c, api } = setup();
  await c.authenticate(async () => ({ ...tokens, user, isNew: false }));
  const quiz = v032Quiz(32030, 'SINGLE', { options: ['가', '나'] });
  let reply;
  const requested = [];
  c.http.defaults.adapter = async (config) => {
    requested.push({ url: config.url, params: config.params });
    return reply(config);
  };
  const seen = [];
  const check = (lessonId) =>
    checkReviewStart(
      () => api.review.next(lessonId),
      (set) => seen.push(set.rewardEligible),
    );

  reply = (config) =>
    respond(config, {
      data: { reviewItems: [], message: '더 이상 복습할 문제가 없어요', rewardEligible: false },
    });
  assert.deepEqual(await check(), { kind: 'empty' });

  reply = (config) =>
    respond(config, {
      data: { reviewItems: [{ reviewItemId: 32931, quiz }], message: null, rewardEligible: true },
    });
  assert.deepEqual(await check(7), { kind: 'start' });
  assert.deepEqual(seen, [false, true]);
  assert.deepEqual(requested, [
    { url: '/reviews/next', params: undefined },
    { url: '/reviews/next', params: { lessonId: 7 } },
  ]);

  // 서버 오류와 계약에 맞지 않는 응답은 예외로 올라가 기존 오류 표시로 간다.
  reply = (config) => fail(config, 500, 'INTERNAL_ERROR');
  await assert.rejects(check());
  reply = (config) => respond(config, { data: { message: null, rewardEligible: true } });
  await assert.rejects(check());
  reply = (config) =>
    respond(config, {
      data: { reviewItems: [{ reviewItemId: 1, quiz: { quizId: 1 } }], rewardEligible: true },
    });
  await assert.rejects(check());
  assert.deepEqual(seen, [false, true]);
});

test('목업 복습 세트: 문제가 없으면 모달 분기, rewardEligible 은 오늘 보상 세션이 남았는지 따른다', async () => {
  const original = JSON.parse(JSON.stringify(mockSnapshot()));
  try {
    assert.equal(restoreMockSnapshot({ ...original, rewardedLessons: [], studyAnswers: [] }), true);
    const next = () => Promise.resolve(contract.reviewSet(mockApi('API-501', {}).data.data));
    assert.deepEqual(await checkReviewStart(next), { kind: 'empty' });
    // 오늘 보상 세션을 모두 쓰면 rewardEligible=false 로 바뀐다.
    for (let index = 0; index < 4; index += 1)
      mockApi('API-503', { body: { reviewItemIds: [1, 2, 3, 4, 5] }, key: `eligible-${index}` });
    assert.equal((await next()).rewardEligible, false);
    assert.equal(
      reviewRewardNotice({ rewardEligible: (await next()).rewardEligible, rewardedToday: false }),
      '오늘의 복습 보상은 이미 받았어요.',
    );
  } finally {
    restoreMockSnapshot(original);
  }
});
