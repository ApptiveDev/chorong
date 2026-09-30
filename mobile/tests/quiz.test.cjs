const assert = require('node:assert/strict');
const { test } = require('node:test');
const { AxiosError } = require('axios');
const {
  parseLessonId,
  quizImageUri,
  quizErrorMessage,
} = require('../.expo/quiz-tests/lib/quiz.js');
const {
  prepareQuiz,
  initialResponse,
  responseIssue,
  toggleSelection,
  connectMatch,
  moveItem,
  sliderSteps,
  sliderValue,
  shuffled,
} = require('../.expo/quiz-tests/lib/quiz-state.js');
const fixtures = require('../../backend/core/src/test/resources/quiz/quiz-items.json');
const raw = (fixture) => ({ ...fixture, quizId: fixture.quizOrder, lessonId: 23 });

for (const fixture of fixtures) {
  test(`${fixture.caseId}: API fixture renders with an isolated response and accepts a complete submission`, () => {
    const before = JSON.stringify(fixture);
    const quiz = prepareQuiz(raw(fixture));
    const first = initialResponse(quiz);
    const second = initialResponse(quiz);
    assert.notEqual(first, second);
    assert.equal(responseIssue(quiz, fixture.correctResponse), null);
    if (!['SLIDER', 'SORT'].includes(quiz.interactionType)) assert.ok(responseIssue(quiz, first));
    assert.equal(JSON.stringify(fixture), before);
    assert.ok(!Object.hasOwn(first, 'correct'));
  });
}

test('lesson ID rejects rounding, exponent notation, zero and negative inputs', () => {
  assert.equal(parseLessonId(' 23 '), 23);
  assert.equal(parseLessonId('9007199254740991'), Number.MAX_SAFE_INTEGER);
  for (const value of ['', '0', '-1', '1.1', '1e3', 'NaN', '9007199254740992'])
    assert.equal(parseLessonId(value), null);
});
test('unsupported types and malformed configs fail without rendering controls', () => {
  assert.throws(
    () => prepareQuiz({ ...raw(fixtures[0]), interactionType: 'NEW_TYPE' }),
    /지원하지/,
  );
  for (const config of [
    null,
    {},
    { min: 1, max: 0, step: 1 },
    { min: 0, max: 1, step: 0 },
    { min: 0, max: 1, step: 0.1, initialValue: 0.15 },
  ])
    assert.throws(() => prepareQuiz({ ...raw(fixtures[0]), config }));
});
test('slider sends decimal grid values without binary arithmetic noise and clamps ends', () => {
  const config = { min: -0.2, max: 0.35, step: 0.1 };
  assert.equal(sliderSteps(config), 5);
  assert.deepEqual(
    Array.from({ length: 6 }, (_, i) => sliderValue(config, i)),
    [-0.2, -0.1, 0, 0.1, 0.2, 0.3],
  );
  assert.equal(sliderValue(config, -50), -0.2);
  assert.equal(sliderValue(config, 50), 0.3);
  assert.equal(sliderValue({ min: 1e-8, max: 9e-8, step: 2e-8 }, 3), 7e-8);
});
test('single choice replaces selection and multiple choice respects the limit', () => {
  assert.deepEqual(toggleSelection(['a'], 'b', true, 1), ['b']);
  assert.deepEqual(toggleSelection(['a'], 'a', true, 1), []);
  assert.deepEqual(toggleSelection(['a', 'b'], 'c', false, 2), ['a', 'b']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'a', false, 2), ['b']);
});
test('matching moves an occupied right item and preserves one-to-one connections', () => {
  assert.deepEqual(connectMatch({ a: 'x', b: 'y' }, 'a', 'y'), { a: 'y' });
  const unusual = connectMatch({}, '__proto__', 'constructor');
  assert.equal(Object.hasOwn(unusual, '__proto__'), true);
});
test('sort moves by item ID without mutating source or losing items', () => {
  const order = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(order, 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(order, 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(order, 0, -1), order);
  assert.deepEqual(order, ['a', 'b', 'c']);
});
test('shuffle changes presentation while preserving the original IDs and config', () => {
  const original = ['a', 'b', 'c', 'd'];
  const display = shuffled(original, () => 0);
  assert.notDeepEqual(display, original);
  assert.deepEqual([...display].sort(), original);
  assert.deepEqual(original, ['a', 'b', 'c', 'd']);
});
test('partial placement and matching cannot submit', () => {
  const drag = prepareQuiz(raw(fixtures.find((f) => f.interactionType === 'DRAG_DROP')));
  assert.ok(responseIssue(drag, { placements: { newton: 'modern' } }));
  const match = prepareQuiz(raw(fixtures.find((f) => f.interactionType === 'MATCHING')));
  assert.ok(responseIssue(match, { matches: { newton: 'gravity' } }));
});
test('images resolve relative to API origin and reject executable schemes', () => {
  const { api } = require('../.expo/quiz-tests/lib/api.js');
  const previous = api.defaults.baseURL;
  api.defaults.baseURL = 'https://api.example.invalid';
  assert.equal(quizImageUri('/images/a.png'), 'https://api.example.invalid/images/a.png');
  assert.equal(quizImageUri('javascript:alert(1)'), null);
  assert.equal(quizImageUri('file:///tmp/a'), null);
  api.defaults.baseURL = previous;
});
test('network, disabled preview and invalid stored data produce different messages', () => {
  const failure = (status) => new AxiosError('failure', '', {}, {}, { status });
  assert.match(quizErrorMessage(failure(401)), /서버 설정/);
  assert.match(
    quizErrorMessage(
      new AxiosError(
        'disabled',
        '',
        {},
        {},
        { status: 404, data: { code: 'QUIZ_PREVIEW_DISABLED' } },
      ),
    ),
    /이 환경/,
  );
  assert.match(quizErrorMessage(failure(409)), /데이터/);
  assert.match(quizErrorMessage(new AxiosError('offline')), /연결/);
});
function loadPreview(adapter) {
  const axios = require('axios');
  const original = axios.defaults.adapter;
  axios.defaults.adapter = adapter;
  delete require.cache[require.resolve('../.expo/quiz-tests/lib/quiz.js')];
  const loaded = require('../.expo/quiz-tests/lib/quiz.js');
  axios.defaults.adapter = original;
  return loaded.quizApi;
}

test('preview requests use no authentication and return a result without a stored attempt', async () => {
  const { api } = require('../.expo/quiz-tests/lib/api.js');
  const authInterceptor = api.interceptors.request.use((config) => {
    config.headers.set('Authorization', 'Bearer unused-test-token');
    return config;
  });
  const calls = [];
  const quizApi = loadPreview(async (config) => {
    calls.push(config);
    assert.equal(config.headers.get('Authorization'), undefined);
    const reply = (data) => ({ config, data, status: 200, statusText: '', headers: {} });
    if (config.url === '/api/dev/quizzes') {
      assert.equal(config.params.lessonId, 23);
      return reply([raw(fixtures[0])]);
    }
    assert.equal(config.url, '/api/dev/quizzes/1/check');
    assert.deepEqual(JSON.parse(config.data), { response: { value: 1760 } });
    return reply({
      graded: true,
      correct: true,
      completed: true,
      explanation: 'server explanation',
    });
  });
  try {
    const list = await quizApi.list(23);
    assert.equal(list[0].quizId, 1);
    const result = await quizApi.check(1, { value: 1760 });
    assert.equal(result.explanation, 'server explanation');
    assert.equal(Object.hasOwn(result, 'attemptId'), false);
    assert.equal(calls.length, 2);
  } finally {
    api.interceptors.request.eject(authInterceptor);
  }
});
test('preview failure does not call login or token refresh', async () => {
  const calls = [];
  const quizApi = loadPreview(async (config) => {
    calls.push(config.url);
    throw new AxiosError('unavailable', '', config, {}, { status: 401, config, data: {} });
  });
  await assert.rejects(quizApi.list(23));
  assert.deepEqual(calls, ['/api/dev/quizzes']);
});

test('slider and swipe keep distinct numeric and string response types', () => {
  const slider = prepareQuiz(raw(fixtures.find((f) => f.interactionType === 'SLIDER')));
  assert.equal(responseIssue(slider, { value: 1760 }), null);
  assert.ok(responseIssue(slider, { value: '1760' }));
  assert.ok(responseIssue(slider, { value: Number.NaN }));
  const swipe = prepareQuiz({
    ...raw(fixtures.find((f) => f.interactionType === 'SWIPE')),
    config: { left: { value: '0', label: '왼쪽' }, right: { value: '1', label: '오른쪽' } },
  });
  assert.equal(responseIssue(swipe, { value: '1' }), null);
  assert.ok(responseIssue(swipe, { value: 1 }));
});
test('shared optional settings follow the server contract without filling omitted fields', () => {
  const source = raw(structuredClone(fixtures.find((f) => f.caseId === 'slider_exact')));
  delete source.config.initialValue;
  delete source.config.showValue;
  delete source.config.unit;
  const prepared = prepareQuiz(source);
  assert.deepEqual(prepared.config, source.config);
  assert.deepEqual(initialResponse(prepared), { value: source.config.min });
  const configured = prepareQuiz({
    ...source,
    config: { ...source.config, shuffle: false, allowRetry: true, showHint: false },
  });
  assert.equal(configured.config.shuffle, false);
  assert.equal(configured.config.allowRetry, true);
  assert.equal(configured.config.showHint, false);
  for (const invalid of [
    { shuffle: null },
    { shuffle: 'false' },
    { allowRetry: false },
    { showHint: true },
  ]) {
    assert.throws(() => prepareQuiz({ ...source, config: { ...source.config, ...invalid } }));
  }
});

test('memory cards validate even unique cards and preserve the source when shuffled', () => {
  const source = raw(structuredClone(fixtures.find((f) => f.caseId === 'flip_card')));
  const before = JSON.stringify(source);
  const prepared = prepareQuiz(source);
  assert.deepEqual(
    prepared.config.cards.map((c) => c.id).sort(),
    source.config.cards.map((c) => c.id).sort(),
  );
  assert.equal(JSON.stringify(source), before);
  for (const cards of [
    [],
    source.config.cards.slice(0, 3),
    [source.config.cards[0], source.config.cards[0]],
    [{ id: 'a' }, { id: 'b', text: 'B' }],
  ]) {
    assert.throws(() => prepareQuiz({ ...source, config: { cards } }));
  }
});
test('memory completion requires all distinct card IDs and rejects a reused or unknown card', () => {
  const fixture = fixtures.find((f) => f.caseId === 'flip_card');
  const quiz = prepareQuiz(raw(fixture));
  assert.deepEqual(initialResponse(quiz), { pairs: [] });
  assert.ok(responseIssue(quiz, { pairs: fixture.correctResponse.pairs.slice(0, 1) }));
  assert.ok(responseIssue(quiz, { pairs: Array(3).fill(fixture.correctResponse.pairs[0]) }));
  const unknown = structuredClone(fixture.correctResponse);
  unknown.pairs[0].firstCardId = 'unknown';
  assert.ok(responseIssue(quiz, unknown));
  const reversed = {
    pairs: [...fixture.correctResponse.pairs]
      .reverse()
      .map((p) => ({ firstCardId: p.secondCardId, secondCardId: p.firstCardId })),
  };
  assert.equal(responseIssue(quiz, reversed), null);
});
