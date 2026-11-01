import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { integrationApi as api, client } from '../runtime';
import { useTask } from '../hooks';
import type { AnswerResult, Lesson, ReviewSet } from '../models';
import { Button, Card, positiveId, styles } from '../ui';
import { QuizCard } from './QuizCard';
import { UserScreen, UserStatus } from './Screen';

export function ReviewScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>(),
    task = useTask();
  const [set, setSet] = useState<ReviewSet | null>(null),
    [done, setDone] = useState<number[]>([]),
    [notice, setNotice] = useState('');
  const [sessionKey, setSessionKey] = useState('');
  const load = () =>
    task.run(async () => {
      const result = await api.review.next(lessonId ? positiveId(lessonId) : undefined);
      setSet(result);
      setDone([]);
      setSessionKey(client.idempotencyKey(`review:${Date.now()}`));
    });
  const complete = () =>
    task.run(async () => {
      const reward = await api.review.complete(done, sessionKey);
      setNotice(
        `복습 완료. 보상 ${reward.rewards.length}건 · 별 ${reward.wallet.star} · 별가루 ${reward.wallet.stardust}`,
      );
    });
  return (
    <UserScreen title="복습하기">
      <Button title="복습 문제 불러오기" disabled={task.busy} onPress={() => void load()} />
      <UserStatus task={task} />
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
      {set?.message ? <Text style={styles.text}>{set.message}</Text> : null}
      {set?.reviewItems.map((item) => (
        <Card key={item.reviewItemId} title="복습 문제">
          <QuizCard
            quiz={item.quiz}
            disabled={done.includes(item.reviewItemId)}
            submit={(answer) => api.review.answer(item.reviewItemId, answer)}
            onGraded={(_result: AnswerResult) => setDone((old) => [...old, item.reviewItemId])}
          />
        </Card>
      ))}
      {set?.reviewItems.length === 0 ? (
        <Text style={styles.text}>복습할 문제가 없습니다.</Text>
      ) : null}
      {set && set.reviewItems.length > 0 ? (
        <Button
          title="복습 완료"
          disabled={task.busy || !!notice || done.length !== set.reviewItems.length}
          onPress={() => void complete()}
        />
      ) : null}
    </UserScreen>
  );
}

export function OnboardingScreen() {
  const task = useTask(),
    [lesson, setLesson] = useState<Lesson | null>(null),
    [answered, setAnswered] = useState<number[]>([]),
    [notice, setNotice] = useState('');
  const load = () =>
    task.run(async () => {
      const result = await api.onboarding.load();
      setLesson(result.lesson);
    });
  const complete = (skipped: boolean) =>
    task.run(async () => {
      const result = await api.onboarding.complete(skipped);
      setNotice(
        `온보딩 ${skipped ? '건너뛰기' : '완료'} · 보상 ${result.rewards.length}건 · ${result.onboardingCompleted ? '서버 완료 상태 확인' : '서버 완료 대기'}`,
      );
    });
  return (
    <UserScreen title="시작 안내">
      <Button title="온보딩 시작" disabled={task.busy} onPress={() => void load()} />
      <UserStatus task={task} />
      {lesson ? (
        <>
          <Text style={styles.subtitle}>{lesson.title}</Text>
          <Text style={styles.text}>{lesson.description}</Text>
          {lesson.contents.map((content) => (
            <Card key={content.contentId} title={`학습 ${content.order}`}>
              <Text style={styles.text}>{content.body}</Text>
              {content.quiz ? (
                <QuizCard
                  quiz={content.quiz}
                  disabled={answered.includes(content.contentId)}
                  submit={(answer) => api.learning.answer(content.quiz!.quizId, answer)}
                  onGraded={() => setAnswered((old) => [...old, content.contentId])}
                />
              ) : null}
            </Card>
          ))}
          <Button
            title="온보딩 완료"
            disabled={
              task.busy ||
              !!notice ||
              lesson.contents.some((v) => v.quiz && !answered.includes(v.contentId))
            }
            onPress={() => void complete(false)}
          />
        </>
      ) : null}
      <Button
        title="건너뛰기"
        disabled={task.busy || !!notice}
        onPress={() => void complete(true)}
      />
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
    </UserScreen>
  );
}
