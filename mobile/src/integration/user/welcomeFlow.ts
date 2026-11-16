import type { createIntegrationApi } from '../api';
import type { CourseDetail } from '../models';

export function firstStudyLesson(lessons: CourseDetail['lessons']) {
  const lesson = lessons.find((item) => item.status !== 'LOCKED');
  return lesson ? { lesson, replay: lesson.status === 'COMPLETED' } : null;
}

type LearningApi = Pick<ReturnType<typeof createIntegrationApi>['learning'], 'courses' | 'course'>;

// 첫 코스에서 처음 열 레슨의 학습 화면 경로. 웰컴 '첫 학습 시작하기'와 M01_3 이 같이 쓴다.
// 레슨이 없거나 불러오지 못하면 null 이다. 호출한 쪽은 학습 홈으로 보내고, 홈이 다시 불러온다.
export async function firstStudyRoute(learning: LearningApi) {
  try {
    const { courses } = await learning.courses();
    const firstCourse = courses[0];
    if (!firstCourse) return null;
    const detail = await learning.course(firstCourse.courseId);
    const firstStudy = firstStudyLesson(detail.lessons);
    if (!firstStudy) return null;
    return {
      pathname: '/learn/study/[lessonId]' as const,
      params: {
        lessonId: String(firstStudy.lesson.lessonId),
        title: firstStudy.lesson.title,
        fromWelcome: 'true',
        replay: firstStudy.replay ? 'true' : 'false',
      },
    };
  } catch {
    return null;
  }
}
