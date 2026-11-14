import type { CourseDetail } from '../models';

export function firstStudyLesson(lessons: CourseDetail['lessons']) {
  const lesson = lessons.find((item) => item.status !== 'LOCKED');
  return lesson ? { lesson, replay: lesson.status === 'COMPLETED' } : null;
}
