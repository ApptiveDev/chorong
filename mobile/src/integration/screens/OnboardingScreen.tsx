import { useState } from 'react';
import { Switch, Text } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Lesson, Me } from '../models';
import { Button, Card, Json, Nav, Page, styles, TaskStatus } from '../ui';
import { QuizInput } from './QuizInput';
import { ContentView } from './LearningScreen';

export default function OnboardingScreen() {
  const { generation } = useIntegration();
  return <OnboardingFlow key={generation} />;
}
function OnboardingFlow() {
  const auth = useIntegration(),
    task = useTask();
  const [me, setMe] = useState<Me | null>(null),
    [lesson, setLesson] = useState<Lesson | null>(null);
  const [answered, setAnswered] = useState<Set<number>>(new Set()),
    [skip, setSkip] = useState(false),
    [completed, setCompleted] = useState(false);
  const [summary, setSummary] = useState<unknown>();
  const finish = (skipped: boolean) =>
    task.run(async () => {
      const result = await api.onboarding.complete(skipped);
      setCompleted(result.onboardingCompleted);
      try {
        setMe(await api.account.me());
        setSummary({
          wallet: await api.benefits.wallet(),
          rewards: await api.benefits.rewards({ size: 20 }),
        });
      } catch (error) {
        setSummary({
          warning: '완료 응답 수신. 후속 조회 실패.',
          detail: error instanceof Error ? error.message : '',
        });
      }
      return result;
    });
  const quizzes = lesson?.contents.filter((c) => c.contentType === 'QUIZ') ?? [];
  return (
    <Page title="온보딩 → 문제 풀이 → 보상">
      <TaskStatus task={task} />
      <Button
        title="[API-201,601] 온보딩 시작·상태 조회"
        disabled={task.busy || !auth.authenticated}
        onPress={() =>
          void task.run(async () => {
            const user = await api.account.me();
            setMe(user);
            setCompleted(user.onboardingCompleted);
            if (user.onboardingCompleted) {
              setLesson(null);
              return user;
            }
            const data = await api.onboarding.load();
            setLesson(data.lesson);
            setAnswered(new Set());
            return data;
          })
        }
      />
      {me ? (
        <Text style={styles.text}>서버 온보딩 완료 상태: {String(me.onboardingCompleted)}</Text>
      ) : null}
      {completed ? (
        <>
          <Text style={styles.text}>온보딩 완료됨</Text>
          <Nav href="/integration/learning" label="학습 시작" />
        </>
      ) : lesson ? (
        <>
          {lesson.contents.map((content) => (
            <Card key={content.contentId} title={`${lesson.title} · ${content.order}`}>
              <ContentView content={content} />
              {content.quiz ? (
                <QuizInput
                  quiz={content.quiz}
                  disabled={task.busy || answered.has(content.quiz.quizId)}
                  submit={(answer) => api.learning.answer(content.quiz!.quizId, answer)}
                  onAnswered={() => setAnswered((s) => new Set(s).add(content.quiz!.quizId))}
                />
              ) : null}
            </Card>
          ))}
          <Button
            title="[API-602] 온보딩 완료·보상 확인"
            disabled={
              task.busy ||
              quizzes.length === 0 ||
              quizzes.some((c) => !c.quiz || !answered.has(c.quiz.quizId))
            }
            onPress={() => void finish(false)}
          />
          <Text style={styles.text}>건너뛰면 보상이 없으며 다시 진행할 수 없습니다.</Text>
          <Switch accessibilityLabel="온보딩 건너뛰기 확인" value={skip} onValueChange={setSkip} />
          <Button
            title="[API-602] 온보딩 건너뛰기"
            disabled={task.busy || !skip}
            onPress={() => void finish(true)}
          />
        </>
      ) : null}
      <Json value={summary} />
    </Page>
  );
}
