import { integrationApi as api } from '../runtime';
import { isConstellationReward } from '../contract';
import { formatDotDate } from './constellationRecord';

// 별자리 완성일: 보상 내역(API-905)의 별자리 뱃지 지급 시각(코스별 첫 기록). 'YYYY. MM. DD'.
// 별자리 기록 목록과 별자리 상세가 같은 기준을 쓴다.
export async function loadConstellationDates(): Promise<Record<number, string>> {
  const dates: Record<number, string> = {};
  let cursor: string | null = null;
  do {
    const page = await api.benefits.rewards({ size: 100, ...(cursor ? { cursor } : {}) });
    for (const item of page.data.rewards) {
      const courseId = Number(item.source.courseId);
      if (isConstellationReward(item) && courseId && !dates[courseId])
        dates[courseId] = formatDotDate(item.grantedAt);
    }
    cursor = page.meta.nextCursor;
  } while (cursor);
  return dates;
}
