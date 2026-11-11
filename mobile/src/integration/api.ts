import type { IntegrationClient } from './client';
import * as m from './models';
import * as contract from './contract';
import { array, nullable, num, object, optional, str } from './schema';

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
    courses: (category?: string) =>
      client.request('API-401', object({ courses: array(m.courseSummary) }), {
        query: category ? { category } : undefined,
      }),
    course: (courseId: number) => client.request('API-402', m.courseDetail, { path: { courseId } }),
    lesson: (lessonId: number) =>
      client.request('API-403', contract.lesson, { path: { lessonId } }),
    start: (lessonId: number, replay: boolean) =>
      client.request('API-404', contract.lessonStart, { path: { lessonId }, body: { replay } }),
    completeContent: (contentId: number) =>
      client.request('API-405', m.contentComplete, { path: { contentId } }),
    answer: (quizId: number, answer: m.QuizAnswer, replay = false) =>
      client.request('API-406', contract.answerResult, {
        path: { quizId },
        body: { answer: contract.encodeAnswer(quizId, answer), replay },
      }),
    completeLesson: (lessonId: number) =>
      client.request('API-407', m.lessonComplete, {
        path: { lessonId },
        key: client.idempotencyKey(`lesson:${lessonId}`),
      }),
    progress: () => client.request('API-408', m.overallProgress),
  };
  const review = {
    next: (lessonId?: number) =>
      client.request('API-501', contract.reviewSet, { query: lessonId ? { lessonId } : undefined }),
    answer: (reviewItemId: number, answer: m.QuizAnswer) =>
      client.request(
        'API-502',
        (value, path) => {
          const result = contract.answerResult(value, path);
          return {
            ...result,
            excludedUntil: optional(nullable(str))(
              (value as Record<string, unknown>).excludedUntil,
              path,
            ),
          };
        },
        {
          path: { reviewItemId },
          body: { answer: contract.encodeReviewAnswer(reviewItemId, answer) },
        },
      ),
    complete: (reviewItemIds: number[], sessionKey: string) =>
      client.request('API-503', m.rewards, { body: { reviewItemIds }, key: sessionKey }),
  };
  const onboarding = {
    load: () => client.request('API-601', contract.onboarding),
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
      client.request('API-802', contract.housingVisit, { path: { housingId } }),
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
    me: () => client.request('API-701', contract.housingDetail),
    update: (body: { name?: string; isPublic?: boolean }) =>
      client.request('API-703', m.housing, { body }),
    save: (placements: m.PlacementInput[]) =>
      client.request('API-702', contract.savedPlacements, {
        body: { placements: contract.placementRequest(placements) },
      }),
    inventory: (itemType?: 'FURNITURE' | 'OBJECT') =>
      client.request('API-907', contract.inventory, {
        query: itemType ? { itemType } : undefined,
      }),
    shop: (itemType?: 'FURNITURE' | 'OBJECT') =>
      client.request('API-901', contract.shopItems, {
        query: itemType ? { itemType } : undefined,
      }),
    item: (itemId: number) =>
      client.request('API-902', contract.shopDetail, {
        path: { itemId },
      }),
    purchase: (items: m.ShopSelection[], key: string) =>
      client.request(
        'API-903',
        (value, path = '$') => {
          const raw = value as { inventoryItems: unknown; wallet: unknown };
          return {
            inventoryItems: contract.inventory({ items: raw.inventoryItems }, path).items,
            wallet: m.wallet(raw.wallet, `${path}.wallet`),
          };
        },
        { body: { items: contract.purchaseRequest(items) }, key },
      ),
  };
  return { account, learning, review, onboarding, social, benefits, room };
}
