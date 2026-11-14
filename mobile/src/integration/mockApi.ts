import type { EnabledApiId } from './catalog';
import type { MockResponder } from './client';
import {
  chosungMockQuizId,
  sliderMockQuizId,
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
  activeReview: Map<number, number>;
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
  activeReview: new Map(),
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
  state.activeReview = new Map();
  replayProgress.clear();
  replayEnergySpent.clear();
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
const lesson = (lessonId: number) => lessons.find((item) => item.lessonId === lessonId);
const card = (housingId: number) => socialCards.find((item) => item.housingId === housingId);
const courseDone = (courseId: number) =>
  courses
    .find((item) => item.courseId === courseId)
    ?.lessons.every(
      (item) => item.status === 'COMPLETED' || state.rewardedLessons.has(item.lessonId),
    ) ?? false;
// 에너지 0 으로 시작한 레슨. 명세(API-404): 완료해도 레슨 별가루를 주지 않는다(stardustSkipped).
// 별 뱃지·코스 보상은 에너지와 무관하다. 목업 스냅샷에는 저장하지 않는다.
const noEnergyLessons = new Set<number>();
const replayProgress = new Map<number, Set<number>>();
// 에너지 없이 마쳐 레슨 별가루를 아직 받지 않은 레슨. 명세(API-404): 다시 하기는 이런 레슨일 때만
// 에너지를 쓰고, 완료하면 그때 별가루를 준다. 목업 스냅샷에는 저장하지 않는다.
const unpaidStardustLessons = new Set<number>();
const replayEnergySpent = new Set<number>();
// 명세(API-503): 복습 보상은 하루 3세션까지. 같은 Idempotency-Key 는 같은 응답을 돌려준다.
const REVIEW_DAILY_REWARD_LIMIT = 3;
const reviewRewards = { date: '', paid: 0 };
const reviewResponses = new Map<string, unknown>();
// 날짜가 바뀌면 지급 횟수를 0 으로 되돌린다.
const reviewRewardsToday = () => {
  const today = new Date().toISOString().slice(0, 10);
  if (reviewRewards.date !== today) Object.assign(reviewRewards, { date: today, paid: 0 });
  return reviewRewards;
};
// 명세 ReviewSet.rewardEligible: 오늘 보상 세션(3회)이 남아 있는지.
const reviewRewardEligible = () => reviewRewardsToday().paid < REVIEW_DAILY_REWARD_LIMIT;
const completion = (courseId?: number, newBadge = false, stardustSkipped = false) => ({
  rewards: [
    ...(stardustSkipped
      ? []
      : [{ type: 'WALLET' as const, currency: 'STARDUST' as const, amount: 5 }]),
    ...(newBadge
      ? [
          { type: 'WALLET' as const, currency: 'STARDUST' as const, amount: 10 },
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
  courseCompleted: courseId ? courseDone(courseId) : false,
  ...(stardustSkipped ? { stardustSkipped: true } : {}),
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

// 서버 채점 대역. 명세대로 공백을 빼고 비교하고 correctAnswer 는 { answer: 문자열 } 로 돌려준다.
const chosungMockAnswers = new Map([
  [
    chosungMockQuizId,
    { answer: '증발', explanation: '물이 데워져 수증기가 되는 현상을 증발이라고 해요.' },
  ],
]);
const scoreChosungAnswer = (quizId: number, raw: unknown) => {
  const expected = chosungMockAnswers.get(quizId);
  if (!expected) return null;
  const answer = body(raw).answer;
  const normalize = (value: string) => value.replace(/\s/g, '');
  return {
    correct: typeof answer === 'string' && normalize(answer) === normalize(expected.answer),
    expected: expected.answer,
    explanation: expected.explanation,
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
    case 'API-105':
      state.user = {
        ...state.user,
        status: 'ACTIVE',
        providers: [String(options.path?.provider ?? '').toUpperCase()],
      };
      return response(auth());
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
          : courses
              .filter((item) => {
                const query = options.query as { category?: string; topic?: string } | undefined;
                return (
                  (!query?.category || item.category === query.category) &&
                  (!query?.topic || item.topic === query.topic)
                );
              })
              .map(({ lessons, description, ...summary }) => ({
                ...summary,
                completedLessons:
                  summary.completedLessons +
                  lessons.filter(
                    (item) =>
                      item.status !== 'COMPLETED' && state.rewardedLessons.has(item.lessonId),
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
      if (input.replay === true) {
        let completed = replayProgress.get(selected.lessonId);
        if (!completed || completed.size === selected.contents.length) {
          completed = new Set();
          replayProgress.set(selected.lessonId, completed);
          replayEnergySpent.delete(selected.lessonId);
        }
        // 명세(API-404): 다시 하기는 별가루를 아직 받지 않은 레슨일 때만 에너지를 쓴다.
        // 이어서 시작하면 다시 쓰지 않고, 에너지가 0이면 줄이지 않는다.
        const replayEnergy = state.wallet.energy ?? 0;
        if (
          unpaidStardustLessons.has(selected.lessonId) &&
          !replayEnergySpent.has(selected.lessonId) &&
          replayEnergy > 0
        ) {
          state.wallet = { ...state.wallet, energy: replayEnergy - 1 };
          replayEnergySpent.add(selected.lessonId);
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
          },
          contents: empty ? [] : selected.contents,
        });
      }
      replayProgress.delete(selected.lessonId);
      // 명세(API-404): 레슨을 시작할 때 에너지 1개를 쓴다. 이어서 시작하거나
      // 이미 별가루를 받은 레슨을 다시 하면 쓰지 않는다. 에너지가 0이면 줄이지 않는다.
      const energy = state.wallet.energy ?? 0;
      if (
        !state.startedLessons.has(selected.lessonId) &&
        !state.rewardedLessons.has(selected.lessonId)
      ) {
        if (energy > 0) state.wallet = { ...state.wallet, energy: energy - 1 };
        else noEnergyLessons.add(selected.lessonId);
      }
      state.startedLessons.add(selected.lessonId);
      const completedContents = selected.contents.filter((content) =>
        state.completed.has(content.contentId),
      );
      const lastContentId = completedContents.at(-1)?.contentId ?? null;
      return response({
        reviewRequired: false,
        review: null,
        progress: {
          status: state.rewardedLessons.has(selected.lessonId) ? 'COMPLETED' : 'IN_PROGRESS',
          lastContentId,
          resumeContentId:
            selected.contents.find((content) => !state.completed.has(content.contentId))
              ?.contentId ?? null,
        },
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
        // 백엔드 completeReplay: 이미 별가루를 받은 레슨이면 completion=null, 아니면 이번 지급 결과.
        let replayCompletion = null;
        if (resumeContentId === null && unpaidStardustLessons.has(selected.lessonId)) {
          const paid = replayEnergySpent.has(selected.lessonId);
          if (paid) {
            unpaidStardustLessons.delete(selected.lessonId);
            state.wallet = { ...state.wallet, stardust: state.wallet.stardust + 5 };
          }
          replayCompletion = {
            rewards: paid
              ? [{ type: 'WALLET' as const, currency: 'STARDUST' as const, amount: 5 }]
              : [],
            wallet: state.wallet,
            courseCompleted: courseDone(selected.courseId),
            stardustSkipped: !paid,
          };
        }
        return response({
          progress: { status: 'COMPLETED', lastContentId: contentId, resumeContentId },
          lessonCompleted: resumeContentId === null,
          completion: replayCompletion,
        });
      }
      state.completed.add(contentId);
      const done =
        !!selected && selected.contents.every((content) => state.completed.has(content.contentId));
      let newBadge = false;
      const stardustSkipped = !!selected && noEnergyLessons.has(selected.lessonId);
      if (done && selected && !state.rewardedLessons.has(selected.lessonId)) {
        state.rewardedLessons.add(selected.lessonId);
        noEnergyLessons.delete(selected.lessonId);
        if (!stardustSkipped)
          state.wallet = { ...state.wallet, stardust: state.wallet.stardust + 5 };
        else unpaidStardustLessons.add(selected.lessonId);
        if (
          courseDone(selected.courseId) &&
          !state.completedConstellations.has(selected.courseId)
        ) {
          state.completedConstellations.set(selected.courseId, new Date().toISOString());
          state.wallet = { ...state.wallet, stardust: state.wallet.stardust + 10 };
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
        completion: done ? completion(selected?.courseId, newBadge, stardustSkipped) : null,
      });
    }
    case 'API-406':
    case 'API-502': {
      const quizId =
        apiId === 'API-406'
          ? id(options, 'quizId')
          : state.activeReview.get(id(options, 'reviewItemId'));
      const scored = quizId
        ? (scoreFirstLessonAnswer(quizId, input.answer) ??
          scoreChosungAnswer(quizId, input.answer) ??
          scoreSliderAnswer(quizId, input.answer) ??
          scoreOtherLessonAnswer(quizId, input.answer))
        : null;
      if (!scored) throw new Error(`MOCK_QUIZ_NOT_FOUND: quizId=${quizId ?? 'unknown'}`);
      if (quizId) {
        if (apiId === 'API-406' && input.replay !== true && firstLessonQuiz(quizId))
          state.studyAnswers.set(quizId, scored.correct);
        if (apiId === 'API-502' && scored.correct)
          state.reviewedToday.set(quizId, new Date().toISOString().slice(0, 10));
      }
      return response({
        attemptId: 1,
        isCorrect: scored.correct,
        correctAnswer: { answer: scored.expected },
        ...('closeness' in scored ? { closeness: scored.closeness } : {}),
        explanation: scored.explanation ?? '내용을 잘 이해했어요.',
        streakDays: 2,
        ...(apiId === 'API-502' ? { excludedUntil: null } : {}),
      });
    }
    case 'API-407':
      return response(completion());
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
          ? {
              lessonId: [...state.startedLessons].at(-1)!,
              courseId: lesson([...state.startedLessons].at(-1)!)?.courseId ?? 1,
              status: state.rewardedLessons.has([...state.startedLessons].at(-1)!)
                ? 'COMPLETED'
                : 'IN_PROGRESS',
            }
          : { lessonId: 12, courseId: 1, status: 'UNLOCKED' },
      });
    case 'API-501': {
      if (empty)
        return response({
          reviewItems: [],
          message: '복습할 문제가 없습니다.',
          rewardEligible: false,
        });
      const requestedLessonId = Number(body(options.query).lessonId);
      if (requestedLessonId > 0 && requestedLessonId !== 11) {
        const quiz = (lesson(requestedLessonId) ?? lessons[1]).contents.at(-1)!.quiz;
        state.activeReview = new Map(quiz ? [[1, quiz.quizId]] : []);
        return response({
          reviewItems: [
            {
              reviewItemId: 1,
              quiz,
            },
          ],
          message: null,
          rewardEligible: reviewRewardEligible(),
        });
      }
      if (state.rewardedLessons.has(11) && state.studyAnswers.size) {
        const today = new Date().toISOString().slice(0, 10);
        const available = [...state.studyAnswers].filter(
          ([quizId]) => state.reviewedToday.get(quizId) !== today,
        );
        const wrong = available.filter(([, correct]) => !correct).map(([quizId]) => quizId);
        const right = available.filter(([, correct]) => correct).map(([quizId]) => quizId);
        const shuffle = (values: number[]) => [...values].sort(() => Math.random() - 0.5);
        const selected =
          wrong.length >= 4 && right.length >= 1
            ? shuffle([...shuffle(wrong).slice(0, 4), ...shuffle(right).slice(0, 1)])
            : [];
        state.activeReview = new Map(selected.map((quizId, index) => [index + 1, quizId]));
        return response({
          reviewItems: selected.map((quizId, index) => ({
            reviewItemId: index + 1,
            quiz: firstLessonQuiz(quizId),
          })),
          message: selected.length
            ? null
            : available.length < 5
              ? '더 이상 복습할 문제가 없어요. 새로운 내용을 배우거나, 다음에 다시 확인해 주세요.'
              : '복습을 구성할 문제가 부족해요. 이번 체험판은 틀린 문제 4개와 맞힌 문제 1개로 구성해요.',
          rewardEligible: reviewRewardEligible(),
        });
      }
      return response({
        reviewItems: [],
        message: '더 이상 복습할 문제가 없어요. 새로운 내용을 배우거나, 다음에 다시 확인해 주세요.',
        rewardEligible: reviewRewardEligible(),
      });
    }
    case 'API-503': {
      const key = options.key;
      if (key && reviewResponses.has(key)) return response(reviewResponses.get(key));
      const paid = reviewRewardEligible();
      if (paid) {
        reviewRewards.paid += 1;
        state.wallet = { ...state.wallet, stardust: state.wallet.stardust + 3 };
      }
      const data = {
        rewards: paid ? [{ type: 'WALLET', currency: 'STARDUST', amount: 3 }] : [],
        wallet: state.wallet,
      };
      if (key) reviewResponses.set(key, data);
      return response(data);
    }
    case 'API-601':
      return response({ lesson: lessons[0] });
    case 'API-602':
      return response({ rewards: [], wallet: state.wallet, onboardingCompleted: true });
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
    case 'API-908':
      return response({ artworks: [] }, true);
  }
};
