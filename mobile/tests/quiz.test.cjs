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
// 서버 7유형 fixture(SINGLE 은 표시 방식별로 여러 문항). 앱은 integration/contract 로 받아
// 화면 모델과 제출 본문으로 바꾼다.
const apiFixtures = require('../../backend/core/src/test/resources/quiz/quiz-items.json');
// 개발용 와이어프레임(lib/quiz-state)이 다루는 이전 유형 fixture.
const fixtures = require('./fixtures/legacy-quiz-items.json');
const contract = require('../.expo/quiz-tests/integration/contract.js');
const {
  mockLessonQuizzes,
  mockQuizForLesson,
  checkMockQuiz,
} = require('../.expo/quiz-tests/lib/mock-lesson-quizzes.js');
const raw = (fixture) => ({ ...fixture, quizId: fixture.quizOrder, lessonId: 23 });

// 조회 응답 모양. fixture 는 저장 모양이라 MULTI 정답이 answer 열에 있다. 서버 조회는 정답 순번을
// config.answers 로 공개하므로(MultiPublicConfig) 백엔드 QuizApiTest 처럼 정렬해 넣는다.
const apiQuiz = (fixture) => {
  const { answer, explanation, correctResponse, wrongResponse, caseId, ...quiz } = fixture;
  const config =
    fixture.interactionType === 'MULTI'
      ? { ...quiz.config, answers: [...answer.answers].sort((a, b) => a - b) }
      : quiz.config;
  return { ...quiz, config, quizId: 7000 + fixture.quizOrder, lessonId: 23 };
};
const byCase = (caseId) => apiFixtures.find((fixture) => fixture.caseId === caseId);
// 화면 답안. 서버 fixture 의 correctResponse·wrongResponse 와 같은 제출 본문이 나와야 한다.
// SINGLE 은 표시 방식과 관계없이 보기 순번을 내고, 문항마다 정답이 달라 fixture 순번을 쓴다.
const appAnswers = {
  OX: () => ({ type: 'OX', correct: { value: true }, wrong: { value: false } }),
  SINGLE: (fixture) => ({
    type: 'MULTIPLE_CHOICE',
    correct: { index: fixture.correctResponse.answer },
    wrong: { index: fixture.wrongResponse.answer },
  }),
  // MULTI 화면은 고른 보기 순번을 문자열로 내고, 계약이 정렬한 순번 배열로 바꾼다.
  MULTI: () => ({
    type: 'MULTIPLE_CHOICE',
    correct: { texts: ['2', '1'] },
    wrong: { texts: ['0'] },
  }),
  BLANK: () => ({
    type: 'FILL_BLANK',
    correct: { texts: ['더 싼 파랑으로'] },
    wrong: { index: 0 },
  }),
  SLIDER: () => ({ type: 'SLIDER', correct: { position: 0.28 }, wrong: { position: 0.5 } }),
  MATCH: () => ({ type: 'ORDERING', correct: { order: [3, 2, 1, 0] } }),
  CHOSUNG: () => ({
    type: 'CHOSUNG',
    correct: { texts: ['울트라마린'] },
    wrong: { texts: [' 코발트 '] },
  }),
};

test('server fixture covers the seven interaction types in order', () => {
  assert.deepEqual(
    [...new Set(apiFixtures.map((fixture) => fixture.interactionType))],
    ['OX', 'SINGLE', 'MULTI', 'BLANK', 'SLIDER', 'MATCH', 'CHOSUNG'],
  );
  // SINGLE 표시 방식(SinglePresentationType)도 빠짐없이 들어 있다.
  assert.deepEqual(
    apiFixtures
      .map((fixture) => fixture.config.presentation?.type)
      .filter(Boolean)
      .sort(),
    ['AUDIO', 'INLINE_WORD', 'SHARPEN', 'TILE', 'ZOOM_OUT'],
  );
});
for (const fixture of apiFixtures) {
  test(`${fixture.caseId}: server fixture maps to the screen model and encodes the server answer body`, () => {
    const before = JSON.stringify(fixture);
    const expected = appAnswers[fixture.interactionType](fixture);
    const quiz = contract.quiz(apiQuiz(fixture));
    assert.equal(quiz.quizId, 7000 + fixture.quizOrder);
    assert.equal(quiz.type, expected.type);
    assert.ok(!JSON.stringify(quiz).includes(fixture.explanation));
    assert.deepEqual(contract.encodeAnswer(quiz.quizId, expected.correct), fixture.correctResponse);
    if (expected.wrong)
      assert.deepEqual(contract.encodeAnswer(quiz.quizId, expected.wrong), fixture.wrongResponse);
    assert.equal(JSON.stringify(fixture), before);
  });
}
test('server fixture config reaches the screen model without invented fields', () => {
  // 유형별 기본 문항(caseId 가 유형 이름). SINGLE 표시 방식 문항은 아래에서 따로 본다.
  const byType = Object.fromEntries(
    apiFixtures
      .filter((fixture) => fixture.caseId === fixture.interactionType.toLowerCase())
      .map((fixture) => [fixture.interactionType, contract.quiz(apiQuiz(fixture))]),
  );
  const config = (type) => byCase(type.toLowerCase()).config;
  assert.deepEqual(byType.OX.options, {});
  assert.deepEqual(
    byType.SINGLE.options.choices.map((choice) => choice.label),
    config('SINGLE').options,
  );
  assert.equal(byType.SINGLE.config.presentation, undefined);
  assert.deepEqual(
    byType.MULTI.options.choices.map((choice) => choice.label),
    config('MULTI').options,
  );
  assert.deepEqual(byType.MULTI.options.answer, [...byCase('multi').answer.answers].sort());
  // 표시 방식은 화면 모델에 그대로 남고, 보기는 일반 SINGLE 과 같이 바뀐다.
  for (const fixture of apiFixtures.filter((item) => item.config.presentation)) {
    const quiz = contract.quiz(apiQuiz(fixture));
    assert.deepEqual(quiz.config.presentation, fixture.config.presentation, fixture.caseId);
    assert.deepEqual(
      quiz.options.choices.map((choice) => choice.label),
      fixture.config.options,
      fixture.caseId,
    );
  }
  assert.equal(
    byType.BLANK.question,
    `${config('BLANK').before} [[blank]] ${config('BLANK').after}`,
  );
  assert.deepEqual(
    byType.BLANK.options.choices.map((choice) => choice.label),
    config('BLANK').options,
  );
  assert.deepEqual(byType.SLIDER.options, config('SLIDER'));
  assert.deepEqual(byType.CHOSUNG.options, { hint: config('CHOSUNG').hint });
  const { left, right, answer } = byType.MATCH.options;
  assert.deepEqual(
    left.map((item, index) => [item, right[answer[index]]]),
    config('MATCH').pairs,
  );
});
test('MULTI without public answers and answers of another type are rejected', () => {
  // 조회 응답에 정답 순번(config.answers)이 없으면 바로 판정할 수 없어 명세 불일치로 막는다.
  const { answers, ...storedConfig } = apiQuiz(byCase('multi')).config;
  assert.throws(
    () => contract.quiz({ ...apiQuiz(byCase('multi')), config: storedConfig }),
    /명세 불일치/,
  );
  const ox = contract.quiz(apiQuiz(apiFixtures[0]));
  assert.throws(() => contract.encodeAnswer(ox.quizId, { index: 0 }), /명세 불일치/);
  const slider = contract.quiz(apiQuiz(apiFixtures.find((f) => f.interactionType === 'SLIDER')));
  for (const position of [-0.1, 1.1, Number.NaN])
    assert.throws(() => contract.encodeAnswer(slider.quizId, { position }), /명세 불일치/);
});

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
  assert.throws(() => prepareQuiz({ ...raw(fixtures[0]), interactionType: 'SWIPE' }), /지원하지/);
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

test('slider accepts only numeric responses', () => {
  const slider = prepareQuiz(raw(fixtures.find((f) => f.interactionType === 'SLIDER')));
  assert.equal(responseIssue(slider, { value: 1760 }), null);
  assert.ok(responseIssue(slider, { value: '1760' }));
  assert.ok(responseIssue(slider, { value: Number.NaN }));
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

test('ten learning quizzes cover the remaining interaction types and retain lesson IDs', () => {
  const lessonIds = [41, 51, 61, 71, 81, 91, 101, 111, 121, 131];
  const types = ['SLIDER', 'TAP', 'DRAG_DROP', 'SORT', 'MATCHING', 'FLIP_CARD', 'MULTIPLE_CHOICE'];
  assert.equal(mockLessonQuizzes.length, lessonIds.length);
  assert.deepEqual(
    [...new Set(mockLessonQuizzes.map((quiz) => quiz.interactionType))].sort(),
    types.sort(),
  );
  for (const lessonId of lessonIds) {
    const items = mockQuizForLesson(lessonId);
    assert.equal(items.length, 1);
    assert.equal(items[0].quizId, lessonId * 10 + 1);
    assert.equal(items[0].quizOrder, 1);
    assert.equal(prepareQuiz(items[0]).interactionType, items[0].interactionType);
  }
});

test('learning quiz answers are checked locally, including unordered maps and partial memory pairs', () => {
  const answers = new Map([
    [411, { selectedOptionIds: ['down'] }],
    [511, { selectedItemIds: ['sfumato'] }],
    [611, { order: ['hear', 'remember', 'repeat'] }],
    [711, { matches: { human: 'sweet', cat: 'little' } }],
    [811, { placements: { helium: 'output', hydrogen: 'input' } }],
    [911, { selectedOptionIds: ['air'] }],
    [
      1011,
      {
        pairs: [
          { firstCardId: 'spread', secondCardId: 'curve' },
          { firstCardId: 'point', secondCardId: 'break' },
        ],
      },
    ],
    [1111, { value: 50 }],
    [1211, { selectedItemIds: ['circle'] }],
    [1311, { selectedOptionIds: ['negative'] }],
  ]);
  for (const [quizId, response] of answers) {
    assert.deepEqual(
      {
        correct: checkMockQuiz(quizId, response).correct,
        completed: checkMockQuiz(quizId, response).completed,
      },
      { correct: true, completed: true },
      `quiz ${quizId}`,
    );
  }
  assert.deepEqual(
    {
      correct: checkMockQuiz(1011, { pairs: [{ firstCardId: 'curve', secondCardId: 'spread' }] })
        .correct,
      completed: checkMockQuiz(1011, { pairs: [{ firstCardId: 'curve', secondCardId: 'spread' }] })
        .completed,
    },
    { correct: true, completed: false },
  );
  assert.equal(checkMockQuiz(411, { selectedOptionIds: ['up'] }).correct, false);
});

test('quiz.ts returns lesson quizzes in mock mode without an HTTP request', async () => {
  const previous = process.env.EXPO_PUBLIC_USE_MOCK;
  process.env.EXPO_PUBLIC_USE_MOCK = 'true';
  let requests = 0;
  try {
    const quizApi = loadPreview(async () => {
      requests++;
      throw new Error('unexpected network request');
    });
    const items = await quizApi.list(41);
    assert.equal(items[0].interactionType, 'MULTIPLE_CHOICE');
    assert.equal((await quizApi.check(411, { selectedOptionIds: ['down'] })).correct, true);
    assert.equal(requests, 0);
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_USE_MOCK;
    else process.env.EXPO_PUBLIC_USE_MOCK = previous;
    delete require.cache[require.resolve('../.expo/quiz-tests/lib/quiz.js')];
  }
});
