import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useTask } from '../hooks';
import type { CourseDetail } from '../models';
import { Button, Card, positiveId, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function CourseScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>(),
    router = useRouter(),
    task = useTask();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const load = () =>
    task.run(async () => {
      const data = await api.learning.course(positiveId(String(courseId)));
      setCourse(data);
      return data;
    });
  useEffect(() => {
    void load();
  }, [courseId]);
  return (
    <UserScreen title={course?.title ?? '코스'}>
      <UserStatus task={task} />
      <Button title="코스 새로고침" disabled={task.busy} onPress={() => void load()} />
      {course ? (
        <>
          <Text style={styles.text}>{course.description}</Text>
          {course.lessons.map((lesson) => (
            <Card key={lesson.lessonId} title={lesson.title}>
              <Text style={styles.text}>
                진행 상태: {lesson.status}
                {lesson.unlocksAt ? ` · 해금 예정 ${lesson.unlocksAt}` : ''}
              </Text>
              <Button
                title="레슨 보기"
                onPress={() =>
                  router.push({
                    pathname: '/learn/lesson/[lessonId]',
                    params: { lessonId: String(lesson.lessonId), status: lesson.status },
                  })
                }
              />
            </Card>
          ))}
        </>
      ) : null}
    </UserScreen>
  );
}
