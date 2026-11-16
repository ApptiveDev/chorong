import type { ReviewStatus } from '../models';

// 복습하기 화면 안내 상자 셋째 줄. 값은 복습 상태(API-504)에서 온다.
// - rewardEligible: 오늘(KST) 복습 보상을 아직 받지 않았는지. null 은 아직 모름.
// - rewardAmount: 오늘 첫 완료 보상 별가루. 없으면 명세 기본값 5.
// 모르면 null 을 돌려주고 화면은 그 줄을 비워 둔다.
export function reviewRewardNotice({
  rewardEligible,
  rewardAmount,
}: {
  rewardEligible: boolean | null;
  rewardAmount?: number | null;
}): string | null {
  // Figma 656:3917(L05_2 복습 안내 / 오늘 보상 이미 받음)
  if (rewardEligible === false) return '오늘의 복습 보상은 이미 받았어요.';
  // Figma 342:540
  if (rewardEligible === true)
    return `오늘 첫 복습 완료 시 별가루 +${rewardAmount && rewardAmount > 0 ? rewardAmount : 5}`;
  return null;
}

export type ReviewStartAction = { kind: 'start' } | { kind: 'empty' };

// 복습 시작 버튼: 복습 상태(API-504)만 읽고 회차는 만들지 않는다. 회차(API-501)는 복습 화면이 한 번 만든다.
// 후보가 5개 미만(available=false)이면 이동하지 않고 모달을 띄운다.
// 조회·변환 실패는 예외로 올려 호출 쪽의 기존 오류 표시로 처리하고, "문제 없음"으로 바꾸지 않는다.
export async function checkReviewStart(
  load: () => Promise<ReviewStatus>,
  onStatus?: (status: ReviewStatus) => void,
): Promise<ReviewStartAction> {
  const status = await load();
  onStatus?.(status);
  return status.available ? { kind: 'start' } : { kind: 'empty' };
}

// ERR-22 REVIEW_SESSION_CLOSED: 이미 끝난(새 API-501 호출로 닫혔거나 나가기로 종료된) 회차에 답하거나 완료하려 했다.
export function isReviewSessionClosed(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'REVIEW_SESSION_CLOSED'
  );
}
