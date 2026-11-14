import type { SessionStorage } from '../client';
import type { ReviewSet } from '../models';

// 서버의 복습 날짜 기준(Asia/Seoul)과 같은 오늘 날짜(YYYY-MM-DD).
export const kstDate = (now = Date.now()) =>
  new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const rewardedOnKey = (userId: number) => `chorong.review.rewardedOn.${userId}`;

// 서버는 "오늘 복습을 마쳤는지"를 내려주지 않는다. 대신 복습 세션 완료(API-503)가 성공한 날을
// 사용자별로 기록한다. 서버는 그날 첫 완료 세션에 항상 보상을 주므로(하루 3세션까지),
// 오늘 완료가 성공했다면 오늘의 복습 보상은 이미 받은 것이다.
export async function markReviewRewardedToday(
  storage: SessionStorage,
  userId: number,
  now = Date.now(),
) {
  await storage.set(rewardedOnKey(userId), kstDate(now));
}

export async function reviewRewardedToday(
  storage: SessionStorage,
  userId: number,
  now = Date.now(),
): Promise<boolean> {
  return (await storage.get(rewardedOnKey(userId))) === kstDate(now);
}

// 복습하기 화면 안내 상자 셋째 줄.
// - rewardedToday: 이 기기에서 오늘 복습 완료(API-503)가 성공했는지. null 은 아직 읽는 중.
// - rewardEligible: 서버 ReviewSet.rewardEligible(오늘 보상 세션이 남았는지). null 은 아직 모름.
// 둘 다 모르면 null 을 돌려주고 화면은 그 줄을 비워 둔다.
export function reviewRewardNotice({
  rewardEligible,
  rewardedToday,
}: {
  rewardEligible: boolean | null;
  rewardedToday: boolean | null;
}): string | null {
  // Figma 656:3917(L05_2 복습 안내 / 오늘 보상 이미 받음)
  if (rewardedToday === true || rewardEligible === false)
    return '오늘의 복습 보상은 이미 받았어요.';
  // Figma 342:540
  if (rewardedToday === false && rewardEligible === true) return '오늘 첫 복습 완료 시 별가루 +5';
  return null;
}

export type ReviewStartAction = { kind: 'start' } | { kind: 'empty' };

// 복습 시작 버튼: 실제 복습 세트(API-501)를 받아 문항이 없으면 이동하지 않고 모달을 띄운다.
// 문항은 계약 변환(contract.reviewSet)을 통과한 것만 들어온다. 조회·변환 실패는 예외로 올려
// 호출 쪽의 기존 오류 표시로 처리하고, "문제 없음"으로 바꾸지 않는다.
export async function checkReviewStart(
  load: () => Promise<ReviewSet>,
  onSet?: (set: ReviewSet) => void,
): Promise<ReviewStartAction> {
  const set = await load();
  onSet?.(set);
  return set.reviewItems.length > 0 ? { kind: 'start' } : { kind: 'empty' };
}
