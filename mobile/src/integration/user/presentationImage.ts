// 사진을 쓰는 SINGLE 표시 방식(TILE·ZOOM_OUT·SHARPEN)의 사진 주소·단계 값·타일 칸 수.
// 레슨 사전 로딩(lessonImagePreload)과 각 문항 화면이 같은 규칙을 쓴다.
import type { Quiz, SinglePresentation } from '../models';

const IMAGE_TYPES: ReadonlySet<SinglePresentation['type']> = new Set([
  'TILE',
  'ZOOM_OUT',
  'SHARPEN',
]);

/** 사진 주소(또는 목업 이미지 키). type 을 주면 그 방식일 때만 돌려준다. */
export function presentationImageUrl(
  quiz: Quiz | null | undefined,
  type?: SinglePresentation['type'],
): string | null {
  const presentation = quiz?.config?.presentation;
  if (!presentation || !IMAGE_TYPES.has(presentation.type)) return null;
  if (type && presentation.type !== type) return null;
  const url = presentation.mediaUrl?.trim();
  return url ? url : null;
}

// 서버 검증(QuizGrader.validatePresentation)과 같은 규칙. 사진을 누를 때마다 다음 단계로 간다.
const STAGE_RULES = {
  // 서버 이름은 흐림 반경이고 앱은 모자이크 블록 크기로 쓴다(SharpenQuiz).
  // 0~32, 줄어들고 마지막은 0(원본).
  SHARPEN: { min: 0, max: 32, last: 0 },
  // 배율: 1~8, 줄어들고 마지막은 1(원본 크기).
  ZOOM_OUT: { min: 1, max: 8, last: 1 },
} as const;

/**
 * SHARPEN·ZOOM_OUT 의 stages. 규칙에 맞지 않거나 없으면 null 을 돌려주고,
 * 화면은 자체 기본값을 쓴다(서버가 조회 단계에서 막지 않을 수 있어 앱도 확인한다).
 */
export function presentationStages(
  quiz: Quiz | null | undefined,
  type: keyof typeof STAGE_RULES,
): number[] | null {
  const presentation = quiz?.config?.presentation;
  if (presentation?.type !== type) return null;
  const stages = presentation.stages;
  const rule = STAGE_RULES[type];
  if (
    !Array.isArray(stages) ||
    stages.length < 1 ||
    stages.length > 64 ||
    stages.some((value) => !Number.isInteger(value) || value < rule.min || value > rule.max) ||
    stages.some((value, index) => index > 0 && value >= stages[index - 1]) ||
    stages[stages.length - 1] !== rule.last
  )
    return null;
  return [...stages];
}

// 서버 검증과 같은 TILE 칸 수 범위(가로·세로 각각).
const TILE_GRID_RULE = { min: 2, max: 8 } as const;

const isGridSize = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= TILE_GRID_RULE.min &&
  value <= TILE_GRID_RULE.max;

/** TILE 의 세로(rows)·가로(columns) 칸 수. 하나라도 없거나 범위 밖이면 null(화면 기본값을 쓴다). */
export function presentationGrid(
  quiz: Quiz | null | undefined,
): { rows: number; columns: number } | null {
  const presentation = quiz?.config?.presentation;
  if (presentation?.type !== 'TILE') return null;
  const { rows, columns } = presentation;
  if (!isGridSize(rows) || !isGridSize(columns)) return null;
  return { rows, columns };
}
