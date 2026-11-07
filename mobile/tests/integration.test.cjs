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
const {
  mockApi,
  mockSnapshot,
  restoreMockSnapshot,
} = require('../.expo/integration-tests/mockApi');
const { mockVisibility } = require('../.expo/integration-tests/mockVisibility');
const uuid = '12345678-1234-4234-8234-123456789abc';
const user = { userId: 7, nickname: '시험', status: 'ACTIVE' };
const tokens = { accessToken: 'access-private', refreshToken: 'refresh-private', expiresIn: 3600 };
const me = {
  ...user,
  providers: ['EMAIL'],
  wallet: { star: 1, stardust: 20 },
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
  assert.equal(user.wallet.star, 120);
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
test('all 46 APIs are inventoried; unused avatar update remains deferred', async () => {
  assert.equal(Object.keys(catalog).length, 46);
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
      return respond(config, { data: { inventoryItems: [], wallet: { star: 2, stardust: 9 } } });
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
  await api.room.purchase([{ itemId: 11, optionId: 12 }], 'purchase-key-1');
  assert.equal(calls[0].method, 'put');
  assert.deepEqual(JSON.parse(calls[0].data), { placements });
  assert.equal(calls[1].method, 'post');
  assert.deepEqual(JSON.parse(calls[1].data), { items: [{ itemId: 11, optionId: 12 }] });
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
  c.http.defaults.adapter = async (config) => respond(config, { star: 1, stardust: 2 });
  await assert.rejects(api.benefits.wallet(), /명세 불일치/);
  c.http.defaults.adapter = async (config) => respond(config, { data: { star: '1', stardust: 2 } });
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
    return respond(config, { data: { star: 1, stardust: 2 } });
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
test('late protected response cannot restore data after logout', async () => {
  const { c, api } = setup();
  await login(c);
  let release;
  c.http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      release = () => resolve(respond(config, { data: { star: 1, stardust: 1 } }));
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
      data: { rewards: [], wallet: { star: 1, stardust: 2 }, courseCompleted: false },
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
  assert.equal(restoreMockSnapshot({ version: 2 }), false);
});
