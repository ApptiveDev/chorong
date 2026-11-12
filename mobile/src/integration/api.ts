import type { IntegrationClient } from './client';
import * as m from './models';
import { array, bool, nullable, num, object, optional, str, unknownObject } from './schema';

export function createIntegrationApi(client: IntegrationClient) {
  const account = {
    guest: (platform: m.Platform) =>
      client.authenticate(async () =>
        client.request('API-101', m.authResponse, {
          body: { deviceUuid: await client.deviceUuid(), platform },
        }),
      ),
    signup: (email: string, password: string) =>
      client.request('API-102', object({ verificationId: str, expiresAt: str }), {
        body: { email, password },
      }),
    verify: (verificationId: string, code: string) =>
      client.authenticate(() =>
        client.request('API-103', m.authResponse, { body: { verificationId, code } }),
      ),
    login: (email: string, password: string) =>
      client.authenticate(async () =>
        client.request('API-104', m.authResponse, {
          body: { email, password, deviceUuid: await client.deviceUuid() },
        }),
      ),
    oauth: (provider: Exclude<m.Provider, 'email'>, credentials: m.OAuthCredential) =>
      client.authenticate(async () =>
        client.request('API-105', m.authResponse, {
          path: { provider },
          body: { ...credentials, deviceUuid: await client.deviceUuid() },
        }),
      ),
    refresh: client.refresh,
    logout: (all: boolean) =>
      client.endSession(() => client.request('API-107', null, { body: { all } })),
    link: (provider: m.Provider, credentials: m.OAuthCredential & { verificationId?: string }) =>
      client.request('API-108', m.providers, { path: { provider }, body: credentials }),
    unlink: (provider: m.Provider) =>
      client.request('API-109', m.providers, { path: { provider } }),
    withdraw: (reason?: string) =>
      client.endSession(() => client.request('API-110', null, { body: { reason } })),
    me: async () => {
      const data = await client.request('API-201', m.me);
      client.setUser(data);
      return data;
    },
    update: async (body: { nickname?: string; pushEnabled?: boolean }) => {
      const data = await client.request('API-202', m.me, { body });
      client.setUser(data);
      return data;
    },
    registerPush: async (platform: m.Platform, pushToken: string) =>
      client.request('API-301', null, {
        body: { deviceUuid: await client.deviceUuid(), platform, pushToken },
      }),
    removePush: async () =>
      client.request('API-302', null, { path: { deviceUuid: await client.deviceUuid() } }),
  };
  const learning = {
    courses: (category?: string, topic?: string) =>
      client.request('API-401', object({ courses: array(m.courseSummary) }), {
        query: category || topic ? { category, topic } : undefined,
      }),
    course: (courseId: number) => client.request('API-402', m.courseDetail, { path: { courseId } }),
    lesson: (lessonId: number) => client.request('API-403', m.lessonDetail, { path: { lessonId } }),
    start: (lessonId: number, replay: boolean) =>
      client.request('API-404', m.lessonStart, { path: { lessonId }, body: { replay } }),
    completeContent: (contentId: number) =>
      client.request('API-405', m.contentComplete, { path: { contentId } }),
    answer: (quizId: number, answer: m.QuizAnswer, replay = false) =>
      client.request('API-406', m.answerResult, { path: { quizId }, body: { answer, replay } }),
    completeLesson: (lessonId: number) =>
      client.request('API-407', m.lessonComplete, {
        path: { lessonId },
        key: client.idempotencyKey(`lesson:${lessonId}`),
      }),
    progress: () => client.request('API-408', m.overallProgress),
  };
  const review = {
    next: (lessonId?: number) =>
      client.request('API-501', m.reviewSet, { query: lessonId ? { lessonId } : undefined }),
    answer: (reviewItemId: number, answer: m.QuizAnswer) =>
      client.request(
        'API-502',
        object({
          attemptId: num,
          isCorrect: bool,
          completed: bool,
          correctAnswer: optional(nullable(unknownObject)),
          explanation: optional(nullable(str)),
          streakDays: num,
          excludedUntil: nullable(str),
          closeness: optional(num),
          source: optional(str),
        }),
        { path: { reviewItemId }, body: { answer } },
      ),
    complete: (reviewItemIds: number[], sessionKey: string) =>
      client.request('API-503', m.rewards, { body: { reviewItemIds }, key: sessionKey }),
  };
  const onboarding = {
    load: () => client.request('API-601', object({ lesson: m.lessonDetail })),
    complete: (skipped: boolean) =>
      client.request('API-602', m.onboardingComplete, {
        body: { skipped },
        key: client.idempotencyKey(`onboarding:${skipped}`),
      }),
  };
  const social = {
    explore: (query: m.PageQuery & { sort: 'recent' | 'popular' }) =>
      client.page('API-801', object({ housings: array(m.housingCard) }), { query }),
    visit: (housingId: number) =>
      client.request('API-802', m.housingVisit, { path: { housingId } }),
    like: (housingId: number) => client.request('API-803', m.likeState, { path: { housingId } }),
    unlike: (housingId: number) => client.request('API-804', m.likeState, { path: { housingId } }),
    report: (housingId: number, reason: m.ReportReason, detail?: string) =>
      client.request('API-805', object({ reportId: num }), { body: { housingId, reason, detail } }),
    block: (userId: number) => client.request('API-806', null, { path: { userId } }),
    unblock: (userId: number) => client.request('API-807', null, { path: { userId } }),
    blocks: (query: m.PageQuery) =>
      client.page('API-808', object({ users: array(m.blockedUser) }), { query }),
  };
  const benefits = {
    wallet: () => client.request('API-904', m.wallet),
    rewards: (query: m.PageQuery) =>
      client.page('API-905', object({ rewards: array(m.rewardRecord) }), { query }),
    constellations: () =>
      client.request('API-906', object({ constellations: array(m.constellation) })),
  };
  const room = {
    me: () => client.request('API-701', m.housingDetail),
    save: (placements: m.PlacementInput[]) =>
      client.request('API-702', object({ placements: array(m.placement) }), {
        body: { placements },
      }),
    inventory: (itemType?: 'FURNITURE' | 'OBJECT') =>
      client.request('API-907', object({ items: array(m.inventoryItem) }), {
        query: itemType ? { itemType } : undefined,
      }),
    shop: (itemType?: 'FURNITURE' | 'OBJECT') =>
      client.request('API-901', object({ items: array(m.shopItem) }), {
        query: itemType ? { itemType } : undefined,
      }),
    item: (itemId: number) =>
      client.request('API-902', object({ item: m.shopItem, options: array(m.shopOption) }), {
        path: { itemId },
      }),
    purchase: (items: m.ShopSelection[], key: string) =>
      client.request(
        'API-903',
        object({ inventoryItems: array(m.inventoryItem), wallet: m.wallet }),
        { body: { items }, key },
      ),
  };
  return { account, learning, review, onboarding, social, benefits, room };
}
