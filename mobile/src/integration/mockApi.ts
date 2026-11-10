import type { EnabledApiId } from './catalog';
import type { MockResponder } from './client';
import { courses, inventory, lessons, me, room, shopItems, socialCards } from './mockData';
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
  version: 1;
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
    version: 1,
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
    saved.version !== 1 ||
    !saved.user ||
    !saved.wallet ||
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
const completion = (courseId?: number, newBadge = false) => ({
  rewards: [
    { type: 'WALLET' as const, currency: 'STARDUST' as const, amount: 5 },
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
              .filter(
                (item) =>
                  !options.query ||
                  !('category' in options.query) ||
                  item.category === options.query.category,
              )
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
      state.completed.add(contentId);
      const selected = lessons.find((item) =>
        item.contents.some((content) => content.contentId === contentId),
      );
      const done =
        !!selected && selected.contents.every((content) => state.completed.has(content.contentId));
      let newBadge = false;
      if (done && selected && !state.rewardedLessons.has(selected.lessonId)) {
        state.rewardedLessons.add(selected.lessonId);
        state.wallet = { ...state.wallet, stardust: state.wallet.stardust + 5 };
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
        completion: done ? completion(selected?.courseId, newBadge) : null,
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
          rewardEligible: true,
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
          rewardEligible: selected.length > 0,
        });
      }
      return response({
        reviewItems: [],
        message: '더 이상 복습할 문제가 없어요. 새로운 내용을 배우거나, 다음에 다시 확인해 주세요.',
        rewardEligible: false,
      });
    }
    case 'API-503':
      state.wallet = { ...state.wallet, stardust: state.wallet.stardust + 3 };
      return response({
        rewards: [{ type: 'WALLET', currency: 'STARDUST', amount: 3 }],
        wallet: state.wallet,
      });
    case 'API-601':
      return response({ lesson: lessons[0] });
    case 'API-602':
      return response({ rewards: [], wallet: state.wallet, onboardingCompleted: true });
    case 'API-701':
      return response({
        ...room,
        housing: { ...room.housing, isPublic: mockVisibility.get() },
        placements: state.placements,
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
      return response({ placements: state.placements });
    }
    case 'API-801':
      return response(
        {
          housings: empty
            ? []
            : [...socialCards].sort((a, b) =>
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
          transform: { x, y, rotation: 0, layer: index },
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
          : shopItems.filter(
              (item) =>
                !options.query ||
                !('itemType' in options.query) ||
                item.itemType === options.query.itemType,
            ),
      });
    case 'API-902': {
      const item =
        shopItems.find((value) => value.itemId === id(options, 'itemId')) ?? shopItems[0];
      return response({ item, options: item.options });
    }
    case 'API-903': {
      const selections = Array.isArray(input.items) ? input.items : [];
      const purchased = selections.flatMap((selection, index) => {
        const chosen = body(selection);
        const item = shopItems.find((value) => value.itemId === chosen.itemId);
        const option = item?.options.find((value) => value.optionId === chosen.optionId);
        if (!item || !option || !item.unlocked) return [];
        if (state.wallet[option.currency === 'STAR' ? 'star' : 'stardust'] < option.price)
          return [];
        state.wallet = {
          ...state.wallet,
          [option.currency === 'STAR' ? 'star' : 'stardust']:
            state.wallet[option.currency === 'STAR' ? 'star' : 'stardust'] - option.price,
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
      return response({ inventoryItems: purchased, wallet: state.wallet });
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
          : state.inventory.filter(
              (item) =>
                !options.query ||
                !('itemType' in options.query) ||
                item.itemType === options.query.itemType,
            ),
      });
  }
};
