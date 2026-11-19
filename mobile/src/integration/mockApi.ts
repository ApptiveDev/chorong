import type { EnabledApiId } from './catalog';
import { IntegrationError, type MockResponder } from './client';
import type { Lesson } from './models';
import {
  chosungCountMockQuizId,
  chosungMockQuizId,
  sliderMockQuizId,
  tileMockQuizId,
  sharpenMockQuizId,
  zoomOutMockQuizId,
  inlineWordMockQuizId,
  courses,
  inventory,
  lessons,
  me,
  room,
  shopItems,
  socialCards,
} from './mockData';
import { mockVisibility } from './mockVisibility';

declare const process: { env: Record<string, string | undefined> };

// 목업 복습 회차(API-501~505). items 는 reviewItemId → quizId, answers 는 reviewItemId → 첫 채점 정답 여부.
type MockReviewSession = {
  status: 'OPEN' | 'COMPLETED' | 'ABANDONED';
  items: Map<number, number>;
  answers: Map<number, boolean>;
};
type MockState = {
  user: typeof me;
  wallet: typeof me.wallet;
  likes: Set<number>;
  placements: typeof room.placements;
  inventory: typeof inventory;
  completed: Set<number>;
  startedLessons: Set<number>;
  rewardedLessons: Set<number>;
  completedConstellations: Map<number, string>;
  studyAnswers: Map<number, boolean>;
  reviewedToday: Map<number, string>;
  reviewSessions: Map<number, MockReviewSession>;
  blockedUsers: { userId: number; nickname: string; blockedAt: string }[];
};
const state: MockState = {
  user: { ...me },
  wallet: { ...me.wallet },
  likes: new Set(),
  placements: [...room.placements],
  inventory: [...inventory],
  completed: new Set(),
  startedLessons: new Set(),
  rewardedLessons: new Set(),
  completedConstellations: new Map(),
  studyAnswers: new Map(),
  reviewedToday: new Map(),
  reviewSessions: new Map(),
  blockedUsers: [{ userId: 5, nickname: '별이', blockedAt: '2026-10-30T00:00:00Z' }],
};

type MockSnapshot = {
  version: 2;
  user: MockState['user'];
  wallet: MockState['wallet'];
  likes: number[];
  placements: MockState['placements'];
  inventory: MockState['inventory'];
  completed: number[];
  startedLessons: number[];
  rewardedLessons: number[];
  completedConstellations: [number, string][];
  studyAnswers: [number, boolean][];
  reviewedToday: [number, string][];
  blockedUsers: MockState['blockedUsers'];
  housingName: string;
  isPublic: boolean;
};

export function mockSnapshot(): MockSnapshot {
  return {
    version: 2,
    user: state.user,
    wallet: state.wallet,
    likes: [...state.likes],
    placements: state.placements,
    inventory: state.inventory,
    completed: [...state.completed],
    startedLessons: [...state.startedLessons],
    rewardedLessons: [...state.rewardedLessons],
    completedConstellations: [...state.completedConstellations],
    studyAnswers: [...state.studyAnswers],
    reviewedToday: [...state.reviewedToday],
    blockedUsers: state.blockedUsers,
    housingName: room.housing.name,
    isPublic: mockVisibility.get(),
  };
}

export function restoreMockSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Partial<MockSnapshot>;
  if (
    saved.version !== 2 ||
    !saved.user ||
    !saved.wallet ||
    typeof saved.wallet.energy !== 'number' ||
    !Array.isArray(saved.likes) ||
    !Array.isArray(saved.placements) ||
    !Array.isArray(saved.inventory) ||
    !Array.isArray(saved.completed) ||
    !Array.isArray(saved.startedLessons) ||
    !Array.isArray(saved.rewardedLessons) ||
    !Array.isArray(saved.completedConstellations) ||
    !Array.isArray(saved.studyAnswers) ||
    !Array.isArray(saved.reviewedToday) ||
    !Array.isArray(saved.blockedUsers) ||
    typeof saved.housingName !== 'string' ||
    typeof saved.isPublic !== 'boolean'
  )
    return false;
  state.user = saved.user;
  state.wallet = saved.wallet;
  state.likes = new Set(saved.likes);
  state.placements = saved.placements;
  state.inventory = saved.inventory;
  state.completed = new Set(saved.completed);
  state.startedLessons = new Set(saved.startedLessons);
  state.rewardedLessons = new Set(saved.rewardedLessons);
  state.completedConstellations = new Map(saved.completedConstellations);
  state.studyAnswers = new Map(saved.studyAnswers);
  state.reviewedToday = new Map(saved.reviewedToday);
  state.reviewSessions = new Map();
  replayProgress.clear();
  savedProgress.clear();
  state.blockedUsers = saved.blockedUsers;
  room.housing = { ...room.housing, name: saved.housingName, isPublic: saved.isPublic };
  mockVisibility.set(saved.isPublic);
  for (const item of shopItems)
    for (const option of item.options)
      option.owned = state.inventory.some((owned) => owned.optionId === option.optionId);
  return true;
}
const scenario = process.env.EXPO_PUBLIC_MOCK_SCENARIO;
const empty = scenario === 'empty';
const response = (data?: unknown, paged = false) => ({
  status: data === undefined ? 204 : 200,
  data: data === undefined ? null : paged ? { data, meta: { nextCursor: null } } : { data },
  headers: {},
});
const id = (options: { path?: Record<string, string | number> }, key: string) =>
  Number(options.path?.[key]);
// 서버처럼 학습 레슨의 첫 퀴즈는 채점하지 않는다(QuizPublic.graded=false, 0.4.1).
// 목업 첫 레슨(lessons[0])의 퀴즈는 온보딩 퀴즈와 ID 가 같아 구분할 수 없으므로 두 번째 레슨부터 적용한다.
const ungradedFirstQuizIds = new Set(
  lessons
    .slice(1)
    .map((item) => item.contents.find((content) => content.quiz)?.quiz?.quizId)
    .filter((quizId): quizId is number => quizId !== undefined),
);
const withUngradedFirstQuiz = (item: Lesson): Lesson => ({
  ...item,
  contents: item.contents.map((content) =>
    content.quiz && ungradedFirstQuizIds.has(content.quiz.quizId)
      ? { ...content, quiz: { ...content.quiz, graded: false } }
      : content,
  ),
});
const lesson = (lessonId: number) => {
  const found = lessons.find((item) => item.lessonId === lessonId);
  return found && withUngradedFirstQuiz(found);
};
const card = (housingId: number) => socialCards.find((item) => item.housingId === housingId);
const courseDone = (courseId: number) =>
  courses
    .find((item) => item.courseId === courseId)
    ?.lessons.every(
      (item) => item.status === 'COMPLETED' || state.rewardedLessons.has(item.lessonId),
    ) ?? false;
const replayProgress = new Map<number, Set<number>>();
// 에너지 없이 마쳐 레슨 별가루를 아직 받지 않은 레슨(rewardStatus=NO_ENERGY). 명세(#16): 에너지가 있을 때
// 다시 하기를 마치면 그때 에너지 1을 쓰고 별가루를 준다. 목업 스냅샷에는 저장하지 않는다.
const unpaidStardustLessons = new Set<number>();
// 도중 나가기(API-409)로 저장한 화면과 미제출 입력. 목업 스냅샷에는 저장하지 않는다.
const savedProgress = new Map<
  number,
  { contentId: number; draft: { contentId: number; input: Record<string, unknown> } | null }
>();
// 목업 레슨 내용은 바뀌지 않으므로 레슨 버전(contentVersion)은 늘 1이다.
const MOCK_CONTENT_VERSION = 1;
const MAX_DRAFT_BYTES = 4096;
const utf8Bytes = (text: string) =>
  Array.from(text).reduce((sum, char) => {
    const code = char.codePointAt(0) ?? 0;
    return sum + (code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4);
  }, 0);
type LessonRewardStatus = 'GRANTED' | 'NO_ENERGY' | 'ALREADY_GRANTED';
const courseLessons = () =>
  courses.flatMap((course) =>
    course.lessons.map((item) => ({ ...item, courseId: course.courseId })),
  );
const lessonDone = (item: { lessonId: number; status: string }) =>
  item.status === 'COMPLETED' || state.rewardedLessons.has(item.lessonId);
// 레슨 별가루를 받았는지. 목업 데이터에서 처음부터 COMPLETED 인 레슨은 받은 것으로 본다.
const lessonStardustGranted = (lessonId: number) => {
  const item = courseLessons().find((entry) => entry.lessonId === lessonId);
  return !unpaidStardustLessons.has(lessonId) && !!item && lessonDone(item);
};
// 명세(#16) LessonCompletionService.grantStardust: 에너지는 보상을 받는 완료 때 1 쓴다.
// 에너지가 없으면 주지 않고 보상 미수령으로 남긴다. 레슨 완료 표시(rewardedLessons) 전에 부른다.
const grantLessonStardust = (lessonId: number): LessonRewardStatus => {
  if (lessonStardustGranted(lessonId)) return 'ALREADY_GRANTED';
  const energy = state.wallet.energy ?? 0;
  if (energy <= 0) {
    unpaidStardustLessons.add(lessonId);
    return 'NO_ENERGY';
  }
  unpaidStardustLessons.delete(lessonId);
  state.wallet = {
    ...state.wallet,
    energy: energy - 1,
    stardust: state.wallet.stardust + LESSON_STARDUST,
  };
  return 'GRANTED';
};
// 완료 응답 nextLesson. 완료하지 않은 첫 레슨이며 모두 마쳤으면 null.
const nextMockLesson = () => {
  const next = courseLessons().find((item) => !lessonDone(item));
  return next ? { lessonId: next.lessonId, courseId: next.courseId, title: next.title } : null;
};
// 서버 보상 상수(LessonCompletionService·ReviewCompletionService·OnboardingService)와 같은 값.
// 별자리 완성은 뱃지만 주고 별가루 보너스는 없다.
const LESSON_STARDUST = 1;
const REVIEW_STARDUST = 5;
const ONBOARDING_STARDUST = 50;
let onboardingRewarded = false;
// 명세(API-503): 복습 보상은 완료 시각 기준 한국 날짜마다 첫 완료 한 번(별가루 5).
// 같은 Idempotency-Key 는 같은 응답을 돌려준다.
const reviewRewards = { date: '' };
const reviewResponses = new Map<string, unknown>();
const kstToday = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
// 명세 rewardEligible(API-501·504): 오늘(KST) 복습 보상을 아직 받지 않았는지.
const reviewRewardEligible = () => reviewRewards.date !== kstToday();
let reviewSessionSeq = 0;
const reviewError = (code: string, message: string, status: number) =>
  new IntegrationError(`${code}: ${message} (HTTP ${status})`, code, status);
const reviewSessionClosed = () =>
  reviewError('REVIEW_SESSION_CLOSED', '이미 끝난 복습입니다.', 409);
// 목업 복습 후보: 첫 레슨(11)을 마쳤으면 그 레슨에서 푼 퀴즈 중 오늘 복습에서 맞히지 않은 것.
// 이번 체험판은 틀린 문제 4개와 맞힌 문제 1개가 있어야 회차를 만든다(API-504 available 도 같은 기준).
const reviewCandidates = () => {
  if (empty || !state.rewardedLessons.has(11) || !state.studyAnswers.size)
    return { count: 0, wrong: [] as number[], right: [] as number[] };
  const today = new Date().toISOString().slice(0, 10);
  const available = [...state.studyAnswers].filter(
    ([quizId]) => state.reviewedToday.get(quizId) !== today,
  );
  return {
    count: available.length,
    wrong: available.filter(([, correct]) => !correct).map(([quizId]) => quizId),
    right: available.filter(([, correct]) => correct).map(([quizId]) => quizId),
  };
};
// 서버처럼 API-501 마다 끝나지 않은 이전 회차를 닫고 새 회차를 연다. reviewItemId 는 회차마다 다르다.
const openReviewSession = (quizIds: number[]) => {
  for (const session of state.reviewSessions.values())
    if (session.status === 'OPEN') session.status = 'ABANDONED';
  if (!quizIds.length) return null;
  reviewSessionSeq += 1;
  const reviewSessionId = reviewSessionSeq;
  const items = new Map(
    quizIds.map((quizId, index) => [reviewSessionId * 100 + index + 1, quizId]),
  );
  state.reviewSessions.set(reviewSessionId, { status: 'OPEN', items, answers: new Map() });
  return { reviewSessionId, items };
};
const findReviewSession = (reviewItemId: number) =>
  [...state.reviewSessions.values()].find((item) => item.items.has(reviewItemId));
// API-502: 열린 회차의 문항만 받는다. 닫힌 회차 문항이면 ERR-22.
const openReviewItemQuiz = (reviewItemId: number) => {
  const session = findReviewSession(reviewItemId);
  if (session && session.status !== 'OPEN') throw reviewSessionClosed();
  return session?.items.get(reviewItemId);
};
const recordReviewAnswer = (reviewItemId: number, correct: boolean) => {
  const session = findReviewSession(reviewItemId);
  if (session && !session.answers.has(reviewItemId)) session.answers.set(reviewItemId, correct);
};
// API-503·505 본문의 reviewSessionId 로 회차를 찾는다.
const reviewSession = (raw: unknown) => {
  const reviewSessionId = Number(body(raw).reviewSessionId);
  if (!(reviewSessionId > 0))
    throw reviewError('VALIDATION_FAILED', '요청 값이 올바르지 않습니다.', 400);
  const session = state.reviewSessions.get(reviewSessionId);
  if (!session) throw reviewError('NOT_FOUND', '대상을 찾을 수 없습니다.', 404);
  return session;
};
// 명세(#16) LessonCompleteResponse. 별가루는 rewardStatus=GRANTED 일 때만 싣는다.
// courseCompleted·firstLesson 은 이 레슨을 처음 완료(firstCompletion)했을 때만 true 다.
const completion = (
  courseId: number | undefined,
  rewardStatus: LessonRewardStatus,
  firstCompletion = false,
  newBadge = false,
) => ({
  rewards: [
    ...(rewardStatus === 'GRANTED'
      ? [{ type: 'WALLET' as const, currency: 'STARDUST' as const, amount: LESSON_STARDUST }]
      : []),
    ...(newBadge
      ? [
          {
            type: 'CONSTELLATION' as const,
            badge: {
              type: 'CONSTELLATION',
              constellationId: courses.find((item) => item.courseId === courseId)?.constellation
                ?.constellationId,
            },
          },
        ]
      : []),
  ],
  wallet: state.wallet,
  rewardStatus,
  firstLesson: firstCompletion && courseLessons().filter(lessonDone).length === 1,
  firstCompletion,
  courseCompleted: firstCompletion && courseId ? courseDone(courseId) : false,
  nextLesson: nextMockLesson(),
});
const auth = () => ({
  accessToken: 'mock-access',
  refreshToken: 'mock-refresh',
  expiresIn: 1800,
  user: { userId: state.user.userId, nickname: state.user.nickname, status: state.user.status },
  isNew: false,
});
const body = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const groupedInventory = (items: typeof state.inventory) => {
  const groups = new Map<string, (typeof items)[number][]>();
  for (const item of items) {
    const key = `${item.itemId}:${item.optionId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].map((copies) => ({
    itemId: copies[0].itemId,
    optionId: copies[0].optionId,
    itemType: copies[0].itemType,
    name: copies[0].name,
    option: copies[0].option,
    ownedCount: copies.length,
    placedCount: copies.filter((copy) => copy.placed).length,
    availableCount: copies.filter((copy) => !copy.placed).length,
    copies: copies.map(({ inventoryId, acquiredVia, acquiredAt, placed }) => ({
      inventoryId,
      acquiredVia,
      acquiredAt,
      placed,
    })),
  }));
};
const shopContractItem = (item: (typeof shopItems)[number]) => ({
  ...item,
  options: item.options.map(({ owned: _owned, ...option }) => ({
    ...option,
    ownedCount: state.inventory.filter((copy) => copy.optionId === option.optionId).length,
  })),
});
const contractPlacement = (item: (typeof room.placements)[number]) => ({
  ...item,
  transform: {
    x: item.transform.x,
    y: item.transform.y,
    layer: item.transform.layer,
    flippedX: (item.transform as typeof item.transform & { flippedX?: boolean }).flippedX ?? false,
  },
});
const firstLessonQuiz = (quizId: number) =>
  lessons[0].contents.find((content) => content.quiz?.quizId === quizId)?.quiz;
const scoreFirstLessonAnswer = (quizId: number, raw: unknown) => {
  const selected = firstLessonQuiz(quizId);
  if (!selected) return null;
  const expected = selected.options?.answer as number[];
  const kind = selected.options?.mockHtmlType;
  const answer = body(raw);
  const order = answer.order;
  const correct =
    kind === 'range'
      ? Array.isArray(answer.texts) &&
        Math.abs(Number(answer.texts[0]) - Math.log10(expected[0])) <= 0.3
      : kind === 'match'
        ? Array.isArray(order) && expected.every((value, index) => order[index] === value)
        : kind === 'multi'
          ? Array.isArray(answer.texts) &&
            JSON.stringify(answer.texts.map(Number).sort()) === JSON.stringify([...expected].sort())
          : kind === 'ox'
            ? answer.value === (expected[0] === 0)
            : answer.index === expected[0];
  const explanations: Record<number, string> = {
    11001: '태양에서는 불이 타는 대신, 원자핵이 합쳐지는 핵융합이 일어나요.',
    11002: '합쳐질 수소가 있어야 빛나요. 불이 아니라서 산소나 불씨는 필요 없어요.',
    11003: '헬륨은 합쳐지기 전보다 약 0.7% 가벼워요. 줄어든 질량이 빛과 열이 돼요.',
    11004:
      '태양은 1초마다 약 400만 톤의 질량을 에너지로 바꿔요. 아주 작은 변화가 쉬지 않고 일어나요.',
    11005: '빛이 된 만큼 질량이 줄어요. 그래도 태양은 워낙 커서 앞으로 50억 년쯤 더 빛나요.',
    11006: '태양과 밤하늘의 별은 핵융합으로 빛나요. 모닥불과 촛불은 산소와 반응하며 타는 불이에요.',
    11007:
      '수소가 헬륨으로 합쳐질 때 줄어든 질량이 빛과 열이 돼요. 태양은 1초마다 약 400만 톤을 에너지로 바꾸죠.',
    11008: '태양 속에서는 아무것도 타지 않아요. 원자핵이 합쳐지며 줄어든 질량이 빛과 열이 돼요.',
  };
  return { correct, expected, explanation: explanations[quizId] };
};
const scoreOtherLessonAnswer = (quizId: number, raw: unknown) => {
  const selected = lessons
    .slice(1)
    .flatMap((item) => item.contents)
    .find((content) => content.quiz?.quizId === quizId)?.quiz;
  if (selected?.type !== 'MULTIPLE_CHOICE' || !Array.isArray(selected.options?.choices))
    return null;
  const yes = selected.options.choices.find(
    (choice) =>
      choice &&
      typeof choice === 'object' &&
      choice.label === '맞아요' &&
      Number.isSafeInteger(choice.index),
  );
  if (!yes) return null;
  return {
    correct: body(raw).index === yes.index,
    expected: [yes.index as number],
    explanation: `정답은 '${yes.label}'입니다.`,
  };
};

// 서버 채점 대역. 서버(QuizGrader.chosung)처럼 인정 정답 목록과 공백을 빼고 비교하고
// correctAnswer 는 첫 정답 문자열 { answer: 문자열 } 로 돌려준다.
const chosungMockAnswers = new Map([
  [
    chosungMockQuizId,
    { answers: ['증발'], explanation: '물이 데워져 수증기가 되는 현상을 증발이라고 해요.' },
  ],
  [
    chosungCountMockQuizId,
    {
      answers: ['전체 개수'],
      explanation: '마지막에 말한 수가 전체 개수예요.\n셋까지 셌다면 모두 세 개예요.',
    },
  ],
]);
const scoreChosungAnswer = (quizId: number, raw: unknown) => {
  const expected = chosungMockAnswers.get(quizId);
  if (!expected) return null;
  const answer = body(raw).answer;
  const normalize = (value: string) => value.replace(/\s/g, '');
  return {
    correct:
      typeof answer === 'string' &&
      expected.answers.some((accepted) => normalize(accepted) === normalize(answer)),
    expected: expected.answers[0],
    explanation: expected.explanation,
  };
};
// 서버 채점 대역. SINGLE 표시 방식(TILE 등)은 일반 SINGLE 처럼 보기 순번 { answer } 로 채점한다.
const presentedMockAnswers = new Map([
  [
    tileMockQuizId,
    {
      answer: 0,
      explanation: '수소 원자핵 넷이 합쳐지는 핵융합 그림이에요.',
    },
  ],
  [
    sharpenMockQuizId,
    {
      answer: 0,
      explanation: '수소 원자핵 넷이 합쳐지는 핵융합 그림이에요.',
    },
  ],
  [
    zoomOutMockQuizId,
    {
      answer: 0,
      explanation: '수소 원자핵 넷이 합쳐지는 핵융합 그림이에요.',
    },
  ],
  [
    inlineWordMockQuizId,
    {
      answer: 6,
      // 틀린 낱말(산소) 자리에 들어갈 바른 낱말. 서버처럼 채점 결과로만 돌려준다.
      correctWord: '헬륨',
      explanation: '수소 원자핵이 합쳐지는 일, 핵융합이에요.\n이때 줄어든 질량이 빛과 열이 돼요.',
    },
  ],
]);
const scorePresentedAnswer = (quizId: number, raw: unknown) => {
  const expected = presentedMockAnswers.get(quizId);
  if (!expected) return null;
  return {
    correct: body(raw).answer === expected.answer,
    expected: expected.answer,
    explanation: expected.explanation,
    ...('correctWord' in expected ? { correctWord: expected.correctWord } : {}),
  };
};
// 서버 채점 대역. 명세대로 |answer - 정답| <= 허용 오차면 정답이고 closeness(0~100)를 돌려준다.
// 정답 위치·오차는 응답 전에는 공개하지 않는다. 근접도 계산식은 목업용이며 서버 식과 다를 수 있다.
const sliderMockAnswers = new Map([
  [
    sliderMockQuizId,
    {
      answer: 24 / 36,
      tolerance: 0.05,
      explanation: '지구는 약 24시간에 한 바퀴 자전해요. 그래서 하루가 24시간이에요.',
    },
  ],
]);
const scoreSliderAnswer = (quizId: number, raw: unknown) => {
  const expected = sliderMockAnswers.get(quizId);
  if (!expected) return null;
  const answer = body(raw).answer;
  if (typeof answer !== 'number' || answer < 0 || answer > 1)
    throw new Error('MOCK_VALIDATION_FAILED: SLIDER answer 는 0~1 숫자입니다.');
  const distance = Math.abs(answer - expected.answer);
  return {
    correct: distance <= expected.tolerance,
    expected: expected.answer,
    explanation: expected.explanation,
    closeness: Math.max(0, Math.round(100 - distance * 100)),
  };
};

export const mockApi: MockResponder = (apiId: EnabledApiId, options) => {
  if (
    scenario === 'error' &&
    !['API-101', 'API-103', 'API-104', 'API-105', 'API-106'].includes(apiId)
  )
    throw new Error('MOCK_ERROR: 요청 실패 상태를 시험합니다.');
  const input = body(options.body);
  switch (apiId) {
    case 'API-101':
      state.user = { ...state.user, status: 'GUEST', providers: ['GUEST'] };
      return response({ ...auth(), isNew: true });
    case 'API-103':
    case 'API-104':
      state.user = { ...state.user, status: 'ACTIVE', providers: ['EMAIL'] };
      return response(auth());
    case 'API-105': {
      // 소셜 로그인 결과 모달을 시험하는 시나리오(EXPO_PUBLIC_MOCK_SCENARIO).
      // 서버처럼 switchToExisting 은 읽지 않는다. 게스트 여부는 목업 사용자 상태로 대신한다.
      const guest = state.user.status === 'GUEST';
      if (scenario === 'oauth-conflict' && guest)
        throw new IntegrationError(
          'ACCOUNT_EXISTS_FOR_PROVIDER: 이미 연결된 로그인 수단입니다. (HTTP 409)',
          'ACCOUNT_EXISTS_FOR_PROVIDER',
          409,
        );
      if (scenario === 'oauth-unauthorized')
        throw new IntegrationError(
          'UNAUTHORIZED: 인증이 필요합니다. (HTTP 401)',
          'UNAUTHORIZED',
          401,
        );
      if (scenario === 'oauth-server-error')
        throw new IntegrationError(
          'INTERNAL: 서버 오류가 발생했습니다. (HTTP 500)',
          'INTERNAL',
          500,
        );
      state.user = {
        ...state.user,
        status: 'ACTIVE',
        providers: [String(options.path?.provider ?? '').toUpperCase()],
      };
      // oauth-new: 기존 계정 없이 새 회원이 만들어진 경우(M01_3). 게스트 전환은 새 회원이 아니다.
      return response({ ...auth(), isNew: scenario === 'oauth-new' && !guest });
    }
    case 'API-102':
      return response({ verificationId: 'mock-verification', expiresAt: '2026-11-03T00:00:00Z' });
    case 'API-106':
      return response({
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        expiresIn: 1800,
      });
    case 'API-107':
    case 'API-110':
    case 'API-301':
    case 'API-302':
      return response();
    case 'API-806': {
      const userId = id(options, 'userId');
      if (!state.blockedUsers.some((user) => user.userId === userId))
        state.blockedUsers.push({
          userId,
          nickname: `사용자 ${userId}`,
          blockedAt: '2026-11-02T00:00:00Z',
        });
      return response();
    }
    case 'API-807':
      state.blockedUsers = state.blockedUsers.filter(
        (user) => user.userId !== id(options, 'userId'),
      );
      return response();
    case 'API-108':
    case 'API-109':
      return response({ providers: ['EMAIL'] });
    case 'API-201':
      return response({
        ...state.user,
        wallet: state.wallet,
        housing: { ...state.user.housing, isPublic: mockVisibility.get() },
      });
    case 'API-202':
      state.user = {
        ...state.user,
        nickname: typeof input.nickname === 'string' ? input.nickname : state.user.nickname,
        pushEnabled:
          typeof input.pushEnabled === 'boolean' ? input.pushEnabled : state.user.pushEnabled,
      };
      return response({
        ...state.user,
        wallet: state.wallet,
        housing: { ...state.user.housing, isPublic: mockVisibility.get() },
      });
    case 'API-401':
      return response({
        courses: empty
          ? []
          : courses.map(({ lessons, description, ...summary }) => ({
              ...summary,
              completedLessons:
                summary.completedLessons +
                lessons.filter(
                  (item) => item.status !== 'COMPLETED' && state.rewardedLessons.has(item.lessonId),
                ).length,
            })),
      });
    case 'API-402': {
      const selected =
        courses.find((item) => item.courseId === id(options, 'courseId')) ?? courses[0];
      return response({
        ...selected,
        lessons: selected.lessons.map((item) => ({
          ...item,
          status:
            state.startedLessons.has(item.lessonId) || state.rewardedLessons.has(item.lessonId)
              ? lesson(item.lessonId)?.contents.every((content) =>
                  state.completed.has(content.contentId),
                )
                ? 'COMPLETED'
                : 'IN_PROGRESS'
              : item.status,
        })),
      });
    }
    case 'API-403':
      return response(lesson(id(options, 'lessonId')) ?? lessons[0]);
    case 'API-404': {
      const selected = lesson(id(options, 'lessonId')) ?? lessons[0];
      // 명세(#16): 시작할 때 에너지를 쓰지 않는다. 보상을 아직 받지 않은 레슨에 에너지 0으로 들어오면
      // energyNotice=true 로 알린다(다시 하기 포함).
      const energyNotice =
        !lessonStardustGranted(selected.lessonId) && (state.wallet.energy ?? 0) === 0;
      if (input.replay === true) {
        let completed = replayProgress.get(selected.lessonId);
        if (!completed || completed.size === selected.contents.length || input.restart === true) {
          completed = new Set();
          replayProgress.set(selected.lessonId, completed);
        }
        return response({
          reviewRequired: false,
          review: null,
          progress: {
            status: 'COMPLETED',
            lastContentId:
              selected.contents.filter((content) => completed.has(content.contentId)).at(-1)
                ?.contentId ?? null,
            resumeContentId:
              selected.contents.find((content) => !completed.has(content.contentId))?.contentId ??
              null,
            contentVersion: MOCK_CONTENT_VERSION,
          },
          energyNotice,
          contents: empty ? [] : selected.contents,
        });
      }
      replayProgress.delete(selected.lessonId);
      state.startedLessons.add(selected.lessonId);
      // API-402 레슨 상태와 같은 기준이다. 보상을 받은 뒤 목업 레슨에 콘텐츠가 늘어나면
      // 남은 콘텐츠가 있으므로 IN_PROGRESS 로 이어 하게 한다.
      const isCompleted = () =>
        state.rewardedLessons.has(selected.lessonId) &&
        selected.contents.every((content) => state.completed.has(content.contentId));
      // 명세(API-404 restart): 이어하기 확인에서 '처음부터'. 저장 화면·draft·완료 위치를 지운다.
      if (input.restart === true && !isCompleted()) {
        savedProgress.delete(selected.lessonId);
        for (const content of selected.contents) state.completed.delete(content.contentId);
      }
      const lastContentId =
        selected.contents.filter((content) => state.completed.has(content.contentId)).at(-1)
          ?.contentId ?? null;
      const saved = savedProgress.get(selected.lessonId);
      return response({
        reviewRequired: false,
        review: null,
        progress: {
          status: isCompleted() ? 'COMPLETED' : 'IN_PROGRESS',
          lastContentId,
          // API-409 로 저장한 화면이 있으면 그 화면부터 이어 한다.
          resumeContentId:
            saved?.contentId ??
            selected.contents.find((content) => !state.completed.has(content.contentId))
              ?.contentId ??
            null,
          ...(saved?.draft ? { draft: saved.draft } : {}),
          contentVersion: MOCK_CONTENT_VERSION,
        },
        energyNotice,
        contents: empty ? [] : selected.contents,
      });
    }
    case 'API-405': {
      const contentId = id(options, 'contentId');
      const selected = lessons.find((item) =>
        item.contents.some((content) => content.contentId === contentId),
      );
      const replayed = selected && replayProgress.get(selected.lessonId);
      if (replayed && selected) {
        const next = selected.contents.find((content) => !replayed.has(content.contentId));
        if (!replayed.has(contentId) && next?.contentId !== contentId)
          throw new Error('MOCK_VALIDATION_FAILED: 콘텐츠 순서를 확인하세요.');
        replayed.add(contentId);
        const resumeContentId =
          selected.contents.find((content) => !replayed.has(content.contentId))?.contentId ?? null;
        // 백엔드 completeReplay(#16): 보상 미수령 레슨이면 이때 에너지 1을 써서 별가루를 준다.
        // 이미 받은 레슨은 ALREADY_GRANTED, 이번에도 에너지가 없으면 NO_ENERGY 로 지급 없이 돌려준다.
        return response({
          progress: { status: 'COMPLETED', lastContentId: contentId, resumeContentId },
          lessonCompleted: resumeContentId === null,
          completion:
            resumeContentId === null
              ? completion(selected.courseId, grantLessonStardust(selected.lessonId))
              : null,
        });
      }
      state.completed.add(contentId);
      // 명세(API-405): 콘텐츠를 완료하면 API-409 로 저장한 화면·draft 를 지운다.
      if (selected) savedProgress.delete(selected.lessonId);
      const done =
        !!selected && selected.contents.every((content) => state.completed.has(content.contentId));
      let newBadge = false;
      let rewardStatus: LessonRewardStatus | null = null;
      if (done && selected && !state.rewardedLessons.has(selected.lessonId)) {
        rewardStatus = grantLessonStardust(selected.lessonId);
        state.rewardedLessons.add(selected.lessonId);
        if (
          courseDone(selected.courseId) &&
          !state.completedConstellations.has(selected.courseId)
        ) {
          state.completedConstellations.set(selected.courseId, new Date().toISOString());
          newBadge = true;
        }
      }
      return response({
        progress: {
          status: done ? 'COMPLETED' : 'IN_PROGRESS',
          lastContentId: contentId,
          resumeContentId: done
            ? null
            : (selected?.contents.find((content) => !state.completed.has(content.contentId))
                ?.contentId ?? null),
        },
        lessonCompleted: done,
        // 이미 완료한 레슨의 재보고는 지급·차감 없이 현재 보상 상태만 돌려준다.
        completion:
          done && selected
            ? rewardStatus
              ? completion(selected.courseId, rewardStatus, true, newBadge)
              : completion(
                  selected.courseId,
                  lessonStardustGranted(selected.lessonId) ? 'ALREADY_GRANTED' : 'NO_ENERGY',
                )
            : null,
      });
    }
    case 'API-406':
    case 'API-502': {
      const quizId =
        apiId === 'API-406'
          ? id(options, 'quizId')
          : openReviewItemQuiz(id(options, 'reviewItemId'));
      const scored = quizId
        ? (scoreFirstLessonAnswer(quizId, input.answer) ??
          scoreChosungAnswer(quizId, input.answer) ??
          scoreSliderAnswer(quizId, input.answer) ??
          scorePresentedAnswer(quizId, input.answer) ??
          scoreOtherLessonAnswer(quizId, input.answer))
        : null;
      if (!scored) throw new Error(`MOCK_QUIZ_NOT_FOUND: quizId=${quizId ?? 'unknown'}`);
      if (quizId) {
        if (apiId === 'API-406' && input.replay !== true && firstLessonQuiz(quizId))
          state.studyAnswers.set(quizId, scored.correct);
        if (apiId === 'API-502') {
          recordReviewAnswer(id(options, 'reviewItemId'), scored.correct);
          if (scored.correct)
            state.reviewedToday.set(quizId, new Date().toISOString().slice(0, 10));
        }
      }
      // 채점하지 않는 첫 퀴즈: isCorrect=null, correctAnswer 없음(해설은 그대로).
      if (apiId === 'API-406' && quizId && ungradedFirstQuizIds.has(quizId))
        return response({
          attemptId: 1,
          graded: false,
          isCorrect: null,
          explanation: scored.explanation ?? '내용을 잘 이해했어요.',
          streakDays: 2,
        });
      return response({
        attemptId: 1,
        graded: true,
        isCorrect: scored.correct,
        correctAnswer: { answer: scored.expected },
        ...('correctWord' in scored && scored.correct !== undefined
          ? { correctWord: scored.correctWord }
          : {}),
        ...('closeness' in scored ? { closeness: scored.closeness } : {}),
        explanation: scored.explanation ?? '내용을 잘 이해했어요.',
        streakDays: 2,
        ...(apiId === 'API-502' ? { excludedUntil: null } : {}),
      });
    }
    case 'API-407': {
      // 목업은 마지막 콘텐츠 완료(API-405)가 레슨을 끝내므로 API-407 은 재확인만 한다.
      // 백엔드처럼 이미 완료한 레슨은 지급·차감 없이 현재 보상 상태를 돌려준다.
      const selected = lesson(id(options, 'lessonId'));
      return response(
        completion(
          selected?.courseId,
          selected && lessonStardustGranted(selected.lessonId) ? 'ALREADY_GRANTED' : 'NO_ENERGY',
        ),
      );
    }
    case 'API-408':
      return response({
        courses: courses.map((item) => ({
          courseId: item.courseId,
          completedLessons:
            item.completedLessons +
            item.lessons.filter(
              (lesson) =>
                lesson.status !== 'COMPLETED' && state.rewardedLessons.has(lesson.lessonId),
            ).length,
          totalLessons: item.totalLessons,
        })),
        current: state.startedLessons.size
          ? (() => {
              const lessonId = [...state.startedLessons].at(-1)!;
              const selected = lesson(lessonId);
              const rewarded = state.rewardedLessons.has(lessonId);
              return {
                lessonId,
                courseId: selected?.courseId ?? 1,
                ...(selected ? { title: selected.title } : {}),
                status: rewarded ? 'COMPLETED' : 'IN_PROGRESS',
                // 완료한 화면이나 API-409 저장 화면이 있으면 이어하기로 표시한다.
                resumable:
                  !rewarded &&
                  (savedProgress.has(lessonId) ||
                    !!selected?.contents.some((content) => state.completed.has(content.contentId))),
              };
            })()
          : { lessonId: 12, courseId: 1, status: 'UNLOCKED', resumable: false },
      });
    case 'API-409': {
      // 명세(API-409): 진행 중인 레슨에서 이미 도달한 화면(마지막 완료 화면의 다음까지)만 저장한다.
      // 아니면 409 ERR-07. draft.contentId 는 contentId 와 같아야 하고 input 은 4KB 이하 객체다.
      const selected = lesson(id(options, 'lessonId'));
      const contentId = input.contentId;
      if (!selected || typeof contentId !== 'number')
        throw new Error('MOCK_VALIDATION_FAILED: contentId 가 필요합니다.');
      const index = selected.contents.findIndex((content) => content.contentId === contentId);
      if (index < 0) throw new Error('MOCK_VALIDATION_FAILED: 레슨에 없는 콘텐츠입니다.');
      let draft: { contentId: number; input: Record<string, unknown> } | null = null;
      if (input.draft !== undefined && input.draft !== null) {
        const raw = body(input.draft);
        const draftInput = raw.input;
        if (
          raw.contentId !== contentId ||
          !draftInput ||
          typeof draftInput !== 'object' ||
          Array.isArray(draftInput) ||
          // UTF-8 바이트 수. 서버(MAX_DRAFT_BYTES)와 같은 기준이다.
          utf8Bytes(JSON.stringify(draftInput)) > MAX_DRAFT_BYTES
        )
          throw new Error('MOCK_VALIDATION_FAILED: draft 를 확인하세요.');
        draft = { contentId, input: draftInput as Record<string, unknown> };
      }
      const reachable = selected.contents.findIndex(
        (content) => !state.completed.has(content.contentId),
      );
      if (
        !state.startedLessons.has(selected.lessonId) ||
        replayProgress.has(selected.lessonId) ||
        reachable < 0 ||
        index > reachable
      )
        throw new Error('MOCK_CONFLICT: ERR-07 진행 중인 레슨의 도달한 화면만 저장할 수 있습니다.');
      savedProgress.set(selected.lessonId, { contentId, draft });
      return response({
        progress: {
          status: 'IN_PROGRESS',
          lastContentId:
            selected.contents.filter((content) => state.completed.has(content.contentId)).at(-1)
              ?.contentId ?? null,
          resumeContentId: contentId,
          ...(draft ? { draft } : {}),
          contentVersion: MOCK_CONTENT_VERSION,
        },
      });
    }
    case 'API-501': {
      const emptyMessage =
        '더 이상 복습할 문제가 없어요. 새로운 내용을 배우거나, 다음에 다시 확인해 주세요.';
      // 서버에는 없는 목업 시험용 경로: query.lessonId 로 그 레슨 마지막 퀴즈 1문항 회차를 연다(채점 확인용, 완료 불가).
      const requestedLessonId = Number(body(options.query).lessonId);
      if (!empty && requestedLessonId > 0 && requestedLessonId !== 11) {
        const quiz = (lesson(requestedLessonId) ?? lessons[1]).contents.at(-1)!.quiz;
        const opened = openReviewSession(quiz ? [quiz.quizId] : []);
        return response({
          reviewSessionId: opened?.reviewSessionId ?? null,
          reviewItems: opened ? [{ reviewItemId: [...opened.items.keys()][0], quiz }] : [],
          message: opened ? null : emptyMessage,
          rewardEligible: reviewRewardEligible(),
        });
      }
      const { count, wrong, right } = reviewCandidates();
      const shuffle = (values: number[]) => [...values].sort(() => Math.random() - 0.5);
      const selected =
        wrong.length >= 4 && right.length >= 1
          ? shuffle([...shuffle(wrong).slice(0, 4), ...shuffle(right).slice(0, 1)])
          : [];
      const opened = openReviewSession(selected);
      return response({
        reviewSessionId: opened?.reviewSessionId ?? null,
        reviewItems: opened
          ? [...opened.items].map(([reviewItemId, quizId]) => ({
              reviewItemId,
              quiz: firstLessonQuiz(quizId),
            }))
          : [],
        message: opened
          ? null
          : empty
            ? '복습할 문제가 없습니다.'
            : count < 5
              ? emptyMessage
              : '복습을 구성할 문제가 부족해요. 이번 체험판은 틀린 문제 4개와 맞힌 문제 1개로 구성해요.',
        rewardEligible: reviewRewardEligible(),
      });
    }
    case 'API-503': {
      const key = options.key;
      if (key && reviewResponses.has(key)) return response(reviewResponses.get(key));
      const session = reviewSession(options.body);
      if (session.status === 'ABANDONED') throw reviewSessionClosed();
      const correctCount = [...session.answers.values()].filter(Boolean).length;
      const totalCount = session.items.size;
      // 서버: 5문항을 모두 제출해야 완료할 수 있다(ERR-07).
      if (session.status === 'OPEN' && (totalCount !== 5 || session.answers.size !== totalCount))
        throw reviewError('CONFLICT', '현재 상태에서 요청을 처리할 수 없습니다.', 409);
      const paid = session.status === 'OPEN' && reviewRewardEligible();
      if (paid) {
        reviewRewards.date = kstToday();
        state.wallet = { ...state.wallet, stardust: state.wallet.stardust + REVIEW_STARDUST };
      }
      session.status = 'COMPLETED';
      const data = {
        rewards: paid ? [{ type: 'WALLET', currency: 'STARDUST', amount: REVIEW_STARDUST }] : [],
        wallet: state.wallet,
        correctCount,
        totalCount,
        rewardStatus: paid ? 'GRANTED' : 'ALREADY_GRANTED',
      };
      if (key) reviewResponses.set(key, data);
      return response(data);
    }
    case 'API-504': {
      const { count, wrong, right } = reviewCandidates();
      return response({
        available: wrong.length >= 4 && right.length >= 1,
        candidateCount: count,
        rewardEligible: reviewRewardEligible(),
        rewardAmount: REVIEW_STARDUST,
      });
    }
    case 'API-505': {
      const session = reviewSession(options.body);
      if (session.status === 'OPEN') session.status = 'ABANDONED';
      return response();
    }
    case 'API-601':
      return response({ lesson: lessons[0] });
    case 'API-602': {
      // 서버처럼 건너뛰지 않고 마친 첫 완료에만 별가루를 준다.
      const paid = input.skipped !== true && !onboardingRewarded;
      if (paid) {
        onboardingRewarded = true;
        state.wallet = { ...state.wallet, stardust: state.wallet.stardust + ONBOARDING_STARDUST };
      }
      return response({
        rewards: paid
          ? [{ type: 'WALLET', currency: 'STARDUST', amount: ONBOARDING_STARDUST }]
          : [],
        wallet: state.wallet,
        onboardingCompleted: true,
      });
    }
    case 'API-701':
      return response({
        ...room,
        housing: { ...room.housing, isPublic: mockVisibility.get() },
        placements: state.placements.map(contractPlacement),
      });
    case 'API-703': {
      const housing = {
        ...room.housing,
        name: typeof input.name === 'string' ? input.name : room.housing.name,
        isPublic: typeof input.isPublic === 'boolean' ? input.isPublic : mockVisibility.get(),
      };
      room.housing = housing;
      state.user = {
        ...state.user,
        housing: { ...state.user.housing, isPublic: housing.isPublic },
      };
      mockVisibility.set(housing.isPublic);
      return response(housing);
    }
    case 'API-702': {
      const requested = Array.isArray(input.placements) ? input.placements : [];
      state.placements = requested.flatMap((value, index) => {
        const next = body(value);
        const owned = state.inventory.find((item) => item.inventoryId === next.inventoryId);
        if (!owned) return [];
        const previous = state.placements.find((item) => item.inventoryId === owned.inventoryId);
        return [
          {
            placementId: previous?.placementId ?? 100 + index,
            inventoryId: owned.inventoryId,
            area: next.area as (typeof room.placements)[number]['area'],
            transform: next.transform as (typeof room.placements)[number]['transform'],
            itemId: owned.itemId,
            optionId: owned.optionId,
            option: owned.option,
          },
        ];
      });
      state.inventory = state.inventory.map((item) => ({
        ...item,
        placed: state.placements.some((placement) => placement.inventoryId === item.inventoryId),
      }));
      return response({ placements: state.placements.map(contractPlacement) });
    }
    case 'API-704': {
      const x = Number(input.x);
      const y = Number(input.y);
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1))
        throw new Error('MOCK_VALIDATION_FAILED: x·y 는 0~1 이어야 합니다.');
      const placementId = typeof input.placementId === 'number' ? input.placementId : null;
      room.avatar = {
        x,
        y,
        state: input.state === 'SIT' || input.state === 'SLEEP' ? input.state : 'IDLE',
        placementId: state.placements.some((item) => item.placementId === placementId)
          ? placementId
          : null,
      };
      return response(room.avatar);
    }
    case 'API-801':
      return response(
        {
          // 서버처럼 차단한 사용자는 빼고 보낸다. 서버는 하우징 ID 로 소유자 user_id 를 쓴다.
          housings: empty
            ? []
            : socialCards
                .filter(
                  (card) => !state.blockedUsers.some((user) => user.userId === card.housingId),
                )
                .sort((a, b) =>
                  options.query && 'sort' in options.query && options.query.sort === 'popular'
                    ? b.likeCount - a.likeCount
                    : a.housingId - b.housingId,
                ),
        },
        true,
      );
    case 'API-802': {
      const selected = card(id(options, 'housingId')) ?? socialCards[0];
      const layout =
        selected.housingId === 2
          ? [
              [105, 2, 0.48, 0.78],
              [108, 2, 0.26, 0.62],
              [107, 0, 0.73, 0.49],
              [104, 1, 0.8, 0.76],
              [106, 3, 0.52, 0.53],
            ]
          : selected.housingId === 3
            ? [
                [105, 1, 0.45, 0.76],
                [101, 1, 0.33, 0.66],
                [102, 0, 0.52, 0.57],
                [104, 1, 0.78, 0.57],
                [104, 3, 0.22, 0.81],
              ]
            : [
                [105, 0, 0.48, 0.77],
                [101, 4, 0.32, 0.66],
                [106, 0, 0.7, 0.55],
              ];
      const socialPlacements = layout.map(([itemId, colorIndex, x, y], index) => {
        const item = shopItems.find((candidate) => candidate.itemId === itemId)!;
        const option = item.options[colorIndex];
        return {
          placementId: selected.housingId * 10 + index,
          inventoryId: `social-${selected.housingId}-${index}`,
          area: 'INTERIOR' as const,
          transform: { x, y, flippedX: false, layer: index },
          itemId,
          optionId: option.optionId,
          option: option.option,
        };
      });
      return response({
        housing: {
          housingId: selected.housingId,
          name: selected.name,
          isPublic: true,
          likeCount: selected.likeCount + (state.likes.has(selected.housingId) ? 1 : 0),
        },
        placements: socialPlacements,
        avatar: { x: 0.5, y: 0.5, state: 'IDLE', placementId: null },
        ownerNickname: selected.ownerNickname,
        likedByMe: state.likes.has(selected.housingId),
      });
    }
    case 'API-803':
    case 'API-804': {
      const housingId = id(options, 'housingId');
      if (apiId === 'API-803') state.likes.add(housingId);
      else state.likes.delete(housingId);
      return response({
        likeCount: (card(housingId)?.likeCount ?? 0) + (state.likes.has(housingId) ? 1 : 0),
        likedByMe: state.likes.has(housingId),
      });
    }
    case 'API-805':
      return response({ reportId: 1 });
    case 'API-808':
      return response(
        {
          users: empty ? [] : state.blockedUsers,
        },
        true,
      );
    case 'API-901':
      return response({
        items: empty
          ? []
          : shopItems
              .filter(
                (item) =>
                  !options.query ||
                  !('itemType' in options.query) ||
                  item.itemType === options.query.itemType,
              )
              .map(shopContractItem),
      });
    case 'API-902': {
      const item =
        shopItems.find((value) => value.itemId === id(options, 'itemId')) ?? shopItems[0];
      const contractItem = shopContractItem(item);
      return response({ item: contractItem, options: contractItem.options });
    }
    case 'API-903': {
      const selections = (Array.isArray(input.items) ? input.items : []).flatMap((selection) => {
        const quantity = body(selection).quantity;
        return Array.from({ length: typeof quantity === 'number' ? quantity : 1 }, () => selection);
      });
      const purchased = selections.flatMap((selection, index) => {
        const chosen = body(selection);
        const item = shopItems.find((value) => value.itemId === chosen.itemId);
        const option = item?.options.find((value) => value.optionId === chosen.optionId);
        if (!item || !option || !item.unlocked) return [];
        if (state.wallet.stardust < option.price) return [];
        state.wallet = {
          ...state.wallet,
          stardust: state.wallet.stardust - option.price,
        };
        const owned = {
          inventoryId: `mock-purchase-${state.inventory.length + index + 1}`,
          itemId: item.itemId,
          optionId: option.optionId,
          itemType: item.itemType,
          name: item.name,
          option: option.option,
          acquiredVia: 'PURCHASE' as const,
          acquiredAt: '2026-11-02T00:00:00Z',
          placed: false,
        };
        state.inventory.push(owned);
        option.owned = true;
        return [owned];
      });
      return response({ inventoryItems: groupedInventory(purchased), wallet: state.wallet });
    }
    case 'API-904':
      return response(state.wallet);
    case 'API-905':
      return response(
        {
          rewards: empty
            ? []
            : [
                ...[...state.completedConstellations].map(([courseId, grantedAt]) => ({
                  type: 'CONSTELLATION',
                  source: { courseId },
                  grantedAt,
                })),
                { type: 'WALLET', source: { lessonId: 11 }, grantedAt: '2026-11-01T09:00:00Z' },
              ],
        },
        true,
      );
    case 'API-906':
      return response({
        constellations: empty
          ? []
          : courses.map((course) => ({
              constellationId: course.constellation!.constellationId,
              courseId: course.courseId,
              name: course.constellation!.name,
              starCount: course.totalLessons,
              earnedStars:
                course.completedLessons +
                course.lessons.filter(
                  (item) => item.status !== 'COMPLETED' && state.rewardedLessons.has(item.lessonId),
                ).length,
              badgeEarned: state.completedConstellations.has(course.courseId),
              imageUrl: null,
              // 완료하지 않은 별은 title=null(앱은 ??? 로 표시).
              stars: course.lessons.map((item) => {
                const completed =
                  item.status === 'COMPLETED' || state.rewardedLessons.has(item.lessonId);
                return {
                  lessonId: item.lessonId,
                  title: completed ? item.title : null,
                  order: item.order,
                  completed,
                  completedAt: completed ? item.completedAt : null,
                };
              }),
            })),
      });
    case 'API-907':
      return response({
        items: empty
          ? []
          : groupedInventory(
              state.inventory.filter(
                (item) =>
                  !options.query ||
                  !('itemType' in options.query) ||
                  item.itemType === options.query.itemType,
              ),
            ),
      });
  }
};
