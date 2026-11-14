// 사진을 쓰는 SINGLE 표시 방식(TILE·ZOOM_OUT·SHARPEN)의 사진 주소.
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
