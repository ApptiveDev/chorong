// 타일 벗기기(SINGLE + config.presentation.type === 'TILE') 공개 규칙.
// 사진을 8×6 으로 덮고, 처음에 무작위 3~5칸을 열어 둔 뒤 일정 간격마다 무작위 2~4칸씩 더 연다.
// 서버의 rows·columns·stages 는 아직 쓰지 않는다(화면 규칙을 앱이 정한다).

export const TILE_COLUMNS = 8;
export const TILE_ROWS = 6;
export const TILE_COUNT = TILE_COLUMNS * TILE_ROWS;
export const TILE_INITIAL_REVEAL = { min: 3, max: 5 } as const;
export const TILE_STEP_REVEAL = { min: 2, max: 4 } as const;
export const TILE_STEP_INTERVAL_MS = 2000;
export const TILE_FADE_MS = 600;

type Random = () => number;

export function randomCount(range: { min: number; max: number }, random: Random = Math.random) {
  return range.min + Math.floor(random() * (range.max - range.min + 1));
}

/** 아직 덮인 칸 중 count 개를 무작위로 고른다. 남은 칸보다 많이 달라면 남은 칸을 모두 준다. */
export function pickHiddenTiles(
  revealed: ReadonlySet<number>,
  count: number,
  random: Random = Math.random,
): number[] {
  const hidden: number[] = [];
  for (let index = 0; index < TILE_COUNT; index++) if (!revealed.has(index)) hidden.push(index);
  // 부분 Fisher–Yates: 앞에서부터 count 칸만 섞는다.
  const take = Math.min(count, hidden.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (hidden.length - i));
    [hidden[i], hidden[j]] = [hidden[j], hidden[i]];
  }
  return hidden.slice(0, take);
}
