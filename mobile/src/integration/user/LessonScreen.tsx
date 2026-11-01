import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useTask } from '../hooks';
import type { Lesson } from '../models';
import { Button, Card, positiveId, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function LessonScreen() {
  const { lessonId, status } = useLocalSearchParams<{ lessonId: string; status?: string }>(),
    router = useRouter(),
    task = useTask();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const load = () =>
    task.run(async () => {
      const data = await api.learning.lesson(positiveId(String(lessonId)));
      setLesson(data);
      return data;
    });
  useEffect(() => {
    void load();
  }, [lessonId]);
  return (
    <UserScreen title={lesson?.title ?? '레슨'}>
      <UserStatus task={task} />
      <Button title="레슨 새로고침" disabled={task.busy} onPress={() => void load()} />
      {lesson ? (
        <>
          <Text style={styles.text}>{lesson.description}</Text>
          <Text style={styles.text}>콘텐츠 {lesson.contents.length}개</Text>
          <Card title="학습하기">
            <Text style={styles.text}>시작하면 이어하기 위치와 선행 복습 여부를 확인합니다.</Text>
            <Button
              title={status === 'IN_PROGRESS' ? '이어하기' : '시작하기'}
              disabled={task.busy || status === 'LOCKED'}
              onPress={() =>
                router.push({
                  pathname: '/learn/study/[lessonId]',
                  params: { lessonId: String(lesson.lessonId), title: lesson.title },
                })
              }
            />
            {status === 'COMPLETED' ? (
              <Button
                title="다시 학습하기"
                onPress={() =>
                  router.push({
                    pathname: '/learn/study/[lessonId]',
                    params: {
                      lessonId: String(lesson.lessonId),
                      replay: 'true',
                      title: lesson.title,
                    },
                  })
                }
              />
            ) : null}
          </Card>
        </>
      ) : null}
    </UserScreen>
  );
}
