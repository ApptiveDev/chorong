import {
  constellationLayouts,
  layoutsByStarCount,
  type ConstellationImage,
  type StarPoint,
} from './constellationLayouts';

type LessonStatus = 'LOCKED' | 'UNLOCKED' | 'IN_PROGRESS' | 'COMPLETED';
type LessonLike = { lessonId: number; title: string; order: number; status: LessonStatus };

export type StarState = 'done' | 'next' | 'todo';
export type RecordStar = { lessonId: number; title: string; state: StarState; point: StarPoint };

// 학습 홈 '다음 학습'. 기존 규칙 그대로: 코스 상세(API-402) 레슨 목록에서 처음 나오는 IN_PROGRESS·UNLOCKED.
export function nextLessonOf<T extends LessonLike>(lessons: readonly T[]): T | null {
  return (
    lessons.find((lesson) => lesson.status === 'IN_PROGRESS' || lesson.status === 'UNLOCKED') ??
    null
  );
}

// 레슨 하나 = 별 하나. 완료(COMPLETED)는 흰 별, '다음 학습'과 같은 레슨은 ?, 나머지는 빈 별.
export function recordStars(
  lessons: readonly LessonLike[],
  nextLessonId: number | null,
  constellationId: number | null | undefined,
): RecordStar[] {
  const ordered = [...lessons].sort((a, b) => a.order - b.order);
  const points = starLayout(constellationId, ordered.length);
  return ordered.map((lesson, index) => ({
    lessonId: lesson.lessonId,
    title: lesson.title,
    state:
      lesson.status === 'COMPLETED' ? 'done' : lesson.lessonId === nextLessonId ? 'next' : 'todo',
    point: points[index],
  }));
}

// 별 사이 선: 앞 별을 밝혔으면 실선, 아니면 점선(Figma 757:3152·757:3153).
export const segmentStyle = (from: StarState): 'solid' | 'dashed' =>
  from === 'done' ? 'solid' : 'dashed';

export const litStars = (stars: readonly RecordStar[]) =>
  stars.filter((star) => star.state === 'done').length;

// 별 위치: 별자리별 설정 → 별 개수별 기본 배치 → 자동 배치 순으로 고른다.
export function starLayout(constellationId: number | null | undefined, count: number): StarPoint[] {
  const custom = constellationId == null ? undefined : constellationLayouts[constellationId];
  if (custom && custom.stars.length >= count) return custom.stars.slice(0, count);
  const preset = layoutsByStarCount[count];
  if (preset && preset.stars.length === count) return preset.stars;
  return fallbackLayout(count);
}

// 설정이 없는 별 개수: Figma 3개 배치처럼 왼쪽 아래에서 오른쪽 위로 완만한 호를 그리며 놓는다.
export function fallbackLayout(count: number): StarPoint[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0.5, y: 0.5 }];
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return {
      x: round(0.12 + t * 0.76),
      y: round(Math.min(0.9, Math.max(0.1, 0.78 - t * 0.56 - 0.1 * Math.sin(Math.PI * t)))),
    };
  });
}

// 별자리 그림: 서버 imageUrl 을 먼저 쓰고, 없으면 설정의 임시 그림, 둘 다 없으면 null.
export function constellationImage(
  constellationId: number | null | undefined,
  serverImageUrl: string | null | undefined,
): ConstellationImage | null {
  if (serverImageUrl) return { uri: serverImageUrl };
  return (
    (constellationId == null ? undefined : constellationLayouts[constellationId]?.image) ?? null
  );
}

const round = (value: number) => Math.round(value * 10000) / 10000;

// ---- 별자리 기록 / 지도 / 완성

type CourseLike = {
  courseId: number;
  title: string;
  totalLessons: number;
  completedLessons: number;
  constellation: { constellationId: number; name: string } | null;
};
type ConstellationLike = {
  constellationId: number;
  courseId: number;
  name: string;
  starCount: number;
  imageUrl: string | null;
};

// 별자리 완성 = 그 별자리(코스) 소속 레슨을 모두 완료했다(API-401 completedLessons / totalLessons).
export const isConstellationComplete = (
  course: Pick<CourseLike, 'totalLessons' | 'completedLessons'>,
) => course.totalLessons > 0 && course.completedLessons >= course.totalLessons;

export type CompletedConstellation = {
  courseId: number;
  constellationId: number | null;
  name: string;
  // 서버 imageUrl → 설정 그림 → null(별 배치로 그린다)
  image: ConstellationImage | null;
  // 레슨 수만큼의 별 위치(모두 밝힌 상태로 그린다)
  points: StarPoint[];
  // 'YYYY. MM. DD'. 완성 기록(API-905 별자리 뱃지)이 없으면 null.
  completedOn: string | null;
};

// 완성한 별자리 목록. 순서는 서버 코스 순서(API-401)를 따른다.
// 이름: API-906 name → 코스 constellation.name → 코스 title.
export function completedConstellations(
  courses: readonly CourseLike[],
  constellations: readonly ConstellationLike[] | null,
  completedOn: Readonly<Record<number, string>>,
): CompletedConstellation[] {
  return courses.filter(isConstellationComplete).map((course) => {
    const record = constellations?.find((item) => item.courseId === course.courseId);
    const constellationId =
      record?.constellationId ?? course.constellation?.constellationId ?? null;
    return {
      courseId: course.courseId,
      constellationId,
      name: record?.name ?? course.constellation?.name ?? course.title,
      image: constellationImage(constellationId, record?.imageUrl),
      points: starLayout(constellationId, course.totalLessons),
      completedOn: completedOn[course.courseId] ?? null,
    };
  });
}

// Figma 표기 'YYYY. MM. DD'(한국시간 기준 날짜).
export function formatDotDate(timestamp: string): string {
  const date = new Date(new Date(timestamp).getTime() + 9 * 60 * 60 * 1000);
  const [year, month, day] = date.toISOString().slice(0, 10).split('-');
  return `${year}. ${month}. ${day}`;
}

// 별자리 상세: 레슨을 모두 완료했으면 마지막 완료 시각(completedAt)을 완성일로 본다. 아니면 null.
export function constellationCompletedOn(
  lessons: readonly { status: LessonStatus; completedAt: string | null }[],
): string | null {
  if (!lessons.length || lessons.some((lesson) => lesson.status !== 'COMPLETED')) return null;
  const times = lessons
    .map((lesson) => (lesson.completedAt ? new Date(lesson.completedAt).getTime() : NaN))
    .filter((time) => !Number.isNaN(time));
  return times.length ? formatDotDate(new Date(Math.max(...times)).toISOString()) : null;
}
