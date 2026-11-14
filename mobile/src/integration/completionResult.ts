import type { LessonCompleteResponse } from './models';

type Reward = LessonCompleteResponse['rewards'][number];

// 응답 rewards 에 실린 WALLET·STARDUST 지급량 합계. 응답에 없는 보상은 만들지 않는다.
export function grantedStardust(rewards: readonly Reward[] | null | undefined): number {
  return (rewards ?? []).reduce(
    (sum, reward) =>
      reward.type === 'WALLET' &&
      reward.currency === 'STARDUST' &&
      typeof reward.amount === 'number' &&
      reward.amount > 0
        ? sum + reward.amount
        : sum,
    0,
  );
}

export type ReplayCompletion =
  { kind: 'replayRewarded'; stardust: number } | { kind: 'replayPlain' };

// 다시 하기 마지막 콘텐츠 완료(API-405)의 completion 으로 완료 화면을 고른다.
// - 별가루가 실려 오면: 에너지 부족으로 못 받은 별가루를 이번에 받음(L06_4).
// - completion=null(이미 받은 레슨) 또는 stardustSkipped=true(이번에도 에너지 없음): 보상 없는 재학습(L06_5).
export function replayCompletion(
  completion: LessonCompleteResponse | null | undefined,
): ReplayCompletion {
  const stardust = grantedStardust(completion?.rewards);
  return stardust > 0 ? { kind: 'replayRewarded', stardust } : { kind: 'replayPlain' };
}

export type ReviewCompletion =
  { kind: 'reviewRewarded'; stardust: number } | { kind: 'reviewAlreadyRewarded' };

// 복습 세션 완료(API-503)의 rewards 로 완료 화면을 고른다.
// 서버는 하루 보상 세션(3회)을 넘겼거나 이미 끝난 세션이면 rewards=[] 를 보낸다(L06_7).
export function reviewCompletion(rewards: readonly Reward[] | null | undefined): ReviewCompletion {
  const stardust = grantedStardust(rewards);
  return stardust > 0 ? { kind: 'reviewRewarded', stardust } : { kind: 'reviewAlreadyRewarded' };
}

// 복습 문항별 채점 결과(API-502 isCorrect)로 정답 수를 센다. 채점 결과가 빠진 문항이 있으면 null.
export function reviewScore(
  graded: Readonly<Record<number, boolean>>,
  reviewItemIds: readonly number[],
): { correct: number; total: number } | null {
  if (!reviewItemIds.length || reviewItemIds.some((id) => graded[id] === undefined)) return null;
  return {
    correct: reviewItemIds.filter((id) => graded[id]).length,
    total: reviewItemIds.length,
  };
}
