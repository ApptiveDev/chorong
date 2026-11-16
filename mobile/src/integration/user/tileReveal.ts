// 타일 벗기기(SINGLE + config.presentation.type === 'TILE') 규칙.
// 사진을 서버 rows×columns 칸으로 모두 덮고, 사용자가 누른 칸만 하나씩 벗긴다(순서·개수는 사용자가 정한다).
// 채점 결과가 나오면 남은 칸을 모두 벗긴다.

// rows·columns 가 없거나 범위 밖일 때 쓰는 칸 수. 320×240 틀에서 40×40 정사각형이 된다.
export const TILE_DEFAULT_GRID = { rows: 6, columns: 8 } as const;
// 칸 하나가 사라지는 시간. 누른 뒤 바로 반응이 보이도록 짧게 둔다.
export const TILE_FADE_MS = 250;

/** 정답 문구. revealedCount: 보기를 고른 순간 벗긴 칸 수, total: 전체 칸 수. */
export function tileCorrectNote(revealedCount: number, total: number) {
  if (revealedCount <= 0) return '타일을 벗기지 않고 맞췄어요.';
  return revealedCount >= total
    ? '타일을 모두 벗기고 맞췄어요.'
    : `타일 ${revealedCount}개만 벗기고 맞췄어요.`;
}
