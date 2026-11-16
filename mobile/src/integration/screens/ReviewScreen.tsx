import { useState } from 'react';
import { Text } from 'react-native';
import { integrationApi as api, client } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { ReviewSet } from '../models';
import { Button, Card, Json, Nav, Page, styles, TaskStatus } from '../ui';
import { QuizInput } from './QuizInput';

export default function ReviewScreen() {
  const { generation } = useIntegration();
  return <ReviewFlow key={generation} />;
}
function ReviewFlow() {
  const auth = useIntegration(),
    task = useTask();
  const [set, setReview] = useState<ReviewSet | null>(null);
  const [answered, setAnswered] = useState<Set<number>>(new Set()),
    [done, setDone] = useState(false);
  const [key, setKey] = useState(''),
    [summary, setSummary] = useState<unknown>();
  return (
    <Page title="복습 → 채점 → 세션 보상">
      <TaskStatus task={task} />
      <Card title="[API-504] 복습 상태">
        <Button
          title="복습 상태 조회"
          disabled={task.busy || !auth.authenticated}
          onPress={() => void task.run(() => api.review.status())}
        />
      </Card>
      <Card title="[API-501] 복습 회차 시작 (부를 때마다 새 회차, 이전 열린 회차는 종료)">
        <Button
          title="복습 세트 조회"
          disabled={task.busy || !auth.authenticated}
          onPress={() =>
            void task.run(async () => {
              const data = await api.review.next();
              setReview(data);
              setAnswered(new Set());
              setDone(false);
              setKey(client.idempotencyKey(`review:${data.reviewSessionId ?? Date.now()}`));
              setSummary(undefined);
              return data;
            })
          }
        />
      </Card>
      {set ? (
        <>
          <Text style={styles.text}>
            회차 {set.reviewSessionId ?? '없음'} · 보상 대상: {String(set.rewardEligible)} · 제출{' '}
            {answered.size}/{set.reviewItems.length}
          </Text>
          {set.reviewItems.length === 0 ? (
            <Text style={styles.text}>{set.message ?? '복습 문제가 없습니다.'}</Text>
          ) : null}
          {set.reviewItems.map((item) => (
            <Card key={`${key}:${item.reviewItemId}`} title={`[API-502] 복습 ${item.reviewItemId}`}>
              <QuizInput
                quiz={item.quiz}
                disabled={task.busy || done || answered.has(item.reviewItemId)}
                submit={(answer) => api.review.answer(item.reviewItemId, answer)}
                onAnswered={() => setAnswered((s) => new Set(s).add(item.reviewItemId))}
              />
            </Card>
          ))}
          <Button
            title="복습 세션 완료·보상 확인"
            disabled={
              task.busy ||
              done ||
              !set.reviewSessionId ||
              set.reviewItems.length !== 5 ||
              answered.size !== 5
            }
            onPress={() =>
              void task.run(async () => {
                const result = await api.review.complete(set.reviewSessionId!, key);
                setDone(true);
                try {
                  setSummary({
                    wallet: await api.benefits.wallet(),
                    rewards: await api.benefits.rewards({ size: 20 }),
                  });
                } catch (error) {
                  setSummary({
                    warning: '복습 완료 성공. 보상 후속 조회 실패.',
                    detail: error instanceof Error ? error.message : '',
                  });
                }
                return result;
              })
            }
          />
          <Button
            title="[API-505] 복습 회차 종료"
            disabled={task.busy || done || !set.reviewSessionId}
            onPress={() =>
              void task.run(async () => {
                await api.review.abandon(set.reviewSessionId!);
                setDone(true);
              })
            }
          />
          <Json value={summary} />
          {done ? <Nav href="/integration/learning" label="학습으로 돌아가기" /> : null}
        </>
      ) : null}
    </Page>
  );
}
