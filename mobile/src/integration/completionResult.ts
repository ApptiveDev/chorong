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

// 별자리 완성 화면의 '완성 보너스' 줄(0.4.1). 별자리마다 보너스가 다르며 다음 형식의 조합이다.
// - WALLET STARDUST: 별가루. 레슨 보상 별가루(첫 STARDUST)는 lessonStardustGranted 일 때 빼고 센다.
// - WALLET STARDUST + convertedEnergy: 에너지가 가득 차 별가루로 바꿔 준 몫
// - WALLET ENERGY, UNLOCK(가구 또는 optionId 가 있으면 색상), STORY, INVENTORY
// 이름·내용은 응답에 없으므로 종류만 적는다. 실제 보너스 데이터는 기획 확정 후 문구를 다듬는다.
export function constellationBonusLines(
  rewards: readonly Reward[] | null | undefined,
  lessonStardustGranted: boolean,
): string[] {
  const lines: string[] = [];
  let lessonStardustSkipped = !lessonStardustGranted;
  let stardust = 0;
  for (const reward of rewards ?? []) {
    const amount = typeof reward.amount === 'number' && reward.amount > 0 ? reward.amount : 0;
    if (reward.type === 'WALLET' && reward.currency === 'STARDUST') {
      if (reward.convertedEnergy) {
        lines.push(`별가루 +${amount} (넘친 에너지 ${reward.convertedEnergy}개)`);
      } else if (!lessonStardustSkipped) {
        lessonStardustSkipped = true;
      } else stardust += amount;
    } else if (reward.type === 'WALLET' && reward.currency === 'ENERGY' && amount)
      lines.push(`에너지 +${amount}`);
    else if (reward.type === 'UNLOCK')
      lines.push(reward.optionId != null ? '상점 새 색상 해금' : '상점 새 아이템 해금');
    else if (reward.type === 'STORY') lines.push('세계관 이야기 해금');
    else if (reward.type === 'INVENTORY') lines.push('아이템 지급');
  }
  if (stardust) lines.unshift(`별가루 +${stardust}`);
  return lines;
}
