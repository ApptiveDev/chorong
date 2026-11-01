import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { HousingCard, HousingVisit, ReportReason } from '../models';
import { Button, Card, Choices, Field, positiveId, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function SocialScreen() {
  const session = useIntegration(),
    router = useRouter(),
    task = useTask();
  const [cards, setCards] = useState<HousingCard[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const load = (append = false) =>
    task.run(async () => {
      const page = await api.social.explore({ sort, ...(append && cursor ? { cursor } : {}) });
      setCards((old) => (append ? [...old, ...page.data.housings] : page.data.housings));
      setCursor(page.meta.nextCursor);
    });
  useEffect(() => {
    if (session.ready && session.user?.status === 'ACTIVE') void load();
  }, [session.ready, session.user?.status, sort]);
  return (
    <UserScreen title="우주 탐험" member>
      <Choices values={['recent', 'popular'] as const} value={sort} onChange={setSort} />
      <UserStatus task={task} />
      <Button title="새로고침" disabled={task.busy} onPress={() => void load()} />
      {cards.length === 0 && !task.busy ? (
        <Text style={styles.text}>공개 우주가 없거나 연결을 확인해야 합니다.</Text>
      ) : null}
      {cards.map((card) => (
        <Card key={card.housingId} title={card.name}>
          <Text style={styles.text}>
            {card.ownerNickname} · 좋아요 {card.likeCount}
          </Text>
          <Button
            title="방문하기"
            onPress={() =>
              router.push({
                pathname: '/social/[housingId]',
                params: { housingId: String(card.housingId) },
              })
            }
          />
        </Card>
      ))}
      {cursor ? (
        <Button title="다음 목록 불러오기" disabled={task.busy} onPress={() => void load(true)} />
      ) : null}
    </UserScreen>
  );
}

export function VisitScreen() {
  const { housingId } = useLocalSearchParams<{ housingId: string }>(),
    task = useTask();
  const [visit, setVisit] = useState<HousingVisit | null>(null),
    [reason, setReason] = useState<ReportReason>('OTHER'),
    [detail, setDetail] = useState(''),
    [notice, setNotice] = useState('');
  const id = positiveId(String(housingId));
  const load = () =>
    task.run(async () => {
      const data = await api.social.visit(id);
      setVisit(data);
      return data;
    });
  useEffect(() => {
    void load();
  }, [id]);
  const like = () =>
    task.run(async () => {
      await (visit?.likedByMe ? api.social.unlike(id) : api.social.like(id));
      const next = await api.social.visit(id);
      setVisit(next);
    });
  const report = () =>
    task.run(async () => {
      await api.social.report(id, reason, detail.trim() || undefined);
      setNotice('신고를 접수했습니다.');
    });
  return (
    <UserScreen title={visit?.housing.name ?? '다른 우주'} member>
      <UserStatus task={task} />
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
      {visit ? (
        <>
          <Text style={styles.text}>
            {visit.ownerNickname} · 좋아요 {visit.housing.likeCount}
          </Text>
          <Text style={styles.text}>배치된 아이템 {visit.placements.length}개</Text>
          <Button
            title={visit.likedByMe ? '좋아요 취소' : '좋아요'}
            disabled={task.busy}
            onPress={() => void like()}
          />
          <Card title="신고">
            <Choices
              values={['INAPPROPRIATE_NAME', 'ABUSE', 'SPAM', 'OTHER'] as const}
              value={reason}
              onChange={setReason}
            />
            <Field label="신고 내용" value={detail} onChange={setDetail} />
            <Button title="신고하기" disabled={task.busy} onPress={() => void report()} />
          </Card>
          <Text style={styles.text}>
            사용자 차단은 방문 응답에 사용자 ID가 없어 연결 대기 중입니다.
          </Text>
        </>
      ) : (
        <Button title="다시 조회" disabled={task.busy} onPress={() => void load()} />
      )}
    </UserScreen>
  );
}
