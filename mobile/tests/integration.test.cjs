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

test('v2 lesson keeps unsupported quiz content in place without grading data', () => {
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
        config: { options: ['a', 'b'] },
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
      [801, null, 803, 804, 805],
    );
    assert.deepEqual(
      parsed.contents.map((c) => c.unsupportedQuiz ?? null),
      [null, { quizId: 802, interactionType: 'MULTI' }, null, null, null],
    );
  }
  // 미지원 유형은 답안을 만들어 보내지 않는다.
  assert.throws(() => contract.encodeAnswer(802, { texts: ['0'] }), /명세 불일치/);
  assert.throws(() => contract.encodeAnswer(802, { position: 0.5 }), /명세 불일치/);
  // 온보딩은 quiz=null 콘텐츠를 답한 것으로 보고 보상을 받을 수 있어 그대로 실패시킨다.
  assert.throws(() => contract.onboarding({ lesson: raw }), /interactionType=MULTI/);
  // 복습 완료는 5문항 전부가 필요해 그대로 실패시킨다.
  assert.throws(
    () =>
      contract.reviewSet({
        reviewItems: [{ reviewItemId: 1, quiz: raw.contents[1].quiz }],
        message: null,
        rewardEligible: true,
      }),
    /interactionType=MULTI/,
  );
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
