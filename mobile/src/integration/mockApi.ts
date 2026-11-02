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
  rewardedLessons: Set<number>;
  blockedUsers: { userId: number; nickname: string; blockedAt: string }[];
};
const state: MockState = {
  user: { ...me },
  wallet: { ...me.wallet },
  likes: new Set(),
  placements: [...room.placements],
  inventory: [...inventory],
  completed: new Set(),
  rewardedLessons: new Set(),
  blockedUsers: [{ userId: 5, nickname: '별이', blockedAt: '2026-10-30T00:00:00Z' }],
};
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
const completion = () => ({
  rewards: [{ type: 'WALLET' as const, currency: 'STAR' as const, amount: 5 }],
  wallet: state.wallet,
  courseCompleted: false,
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
    case 'API-105':
      state.user = { ...state.user, status: 'ACTIVE', providers: ['EMAIL'] };
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
              .map(({ lessons, description, ...summary }) => summary),
      });
    case 'API-402':
      return response(
        courses.find((item) => item.courseId === id(options, 'courseId')) ?? courses[0],
      );
    case 'API-403':
      return response(lesson(id(options, 'lessonId')) ?? lessons[0]);
    case 'API-404': {
      const selected = lesson(id(options, 'lessonId')) ?? lessons[0];
      return response({
        reviewRequired: false,
        review: null,
        progress: {
          status: 'IN_PROGRESS',
          lastContentId: null,
          resumeContentId: selected.contents[0]?.contentId ?? null,
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
      if (done && selected && !state.rewardedLessons.has(selected.lessonId)) {
        state.rewardedLessons.add(selected.lessonId);
        state.wallet = { ...state.wallet, star: state.wallet.star + 5 };
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
        completion: done ? completion() : null,
      });
    }
    case 'API-406':
    case 'API-502':
      return response({
        attemptId: 1,
        isCorrect: true,
        correctAnswer: { index: 0 },
        explanation: '내용을 잘 이해했어요.',
        streakDays: 2,
        ...(apiId === 'API-502' ? { excludedUntil: null } : {}),
      });
    case 'API-407':
      return response(completion());
    case 'API-408':
      return response({
        courses: courses.map((item) => ({
          courseId: item.courseId,
          completedLessons: item.completedLessons,
          totalLessons: item.totalLessons,
        })),
        current: { lessonId: 12, courseId: 1, status: 'UNLOCKED' },
      });
    case 'API-501':
      return response({
        reviewItems: empty ? [] : [{ reviewItemId: 1, quiz: lessons[0].contents.at(-1)!.quiz }],
        message: empty ? '복습할 문제가 없습니다.' : null,
        rewardEligible: !empty,
      });
    case 'API-503':
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
      const socialPlacements = room.placements.map((item, index) => ({
        ...item,
        placementId: selected.housingId * 10 + index,
        inventoryId: `social-${selected.housingId}-${item.itemId}`,
        transform: {
          ...item.transform,
          x: selected.housingId === 2 ? 0.35 : selected.housingId === 3 ? 0.65 : 0.5,
          y: selected.housingId === 4 ? 0.38 : 0.63,
        },
      }));
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
            : [{ type: 'WALLET', source: { lessonId: 11 }, grantedAt: '2026-11-01T09:00:00Z' }],
        },
        true,
      );
    case 'API-906':
      return response({
        constellations: empty
          ? []
          : [
              {
                constellationId: 1,
                courseId: 1,
                name: '작은곰자리',
                starCount: 2,
                earnedStars: 1,
                badgeEarned: false,
                imageUrl: null,
              },
              {
                constellationId: 2,
                courseId: 2,
                name: '오리온자리',
                starCount: 2,
                earnedStars: 0,
                badgeEarned: false,
                imageUrl: null,
              },
            ],
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
