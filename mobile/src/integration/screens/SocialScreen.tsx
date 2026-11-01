import { useState } from 'react';
import { Text } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { BlockedUser, HousingCard, HousingVisit, ReportReason } from '../models';
import { Button, Card, Choices, Field, Json, Page, positiveId, styles, TaskStatus } from '../ui';

export default function SocialScreen() {
  const { generation } = useIntegration();
  return <SocialFlow key={generation} />;
}
function SocialFlow() {
  const task = useTask();
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const [housings, setHousings] = useState<HousingCard[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [housingId, setHousingId] = useState(''),
    [visit, setVisit] = useState<HousingVisit | null>(null);
  const [reason, setReason] = useState<ReportReason>('OTHER'),
    [detail, setDetail] = useState('');
  const [userId, setUserId] = useState(''),
    [users, setUsers] = useState<BlockedUser[]>([]),
    [blockCursor, setBlockCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null),
    [likeState, setLikeState] = useState<unknown>();
  const explore = (next = false) =>
    task.run(async () => {
      const result = await api.social.explore({
        sort,
        size: 20,
        ...(next && cursor ? { cursor } : {}),
      });
      setHousings((old) =>
        next
          ? [
              ...old.filter((h) => !result.data.housings.some((n) => h.housingId === n.housingId)),
              ...result.data.housings,
            ]
          : result.data.housings,
      );
      setCursor(result.meta.nextCursor);
      return result;
    });
  const blocks = async (next = false) => {
    const result = await api.social.blocks({
      size: 20,
      ...(next && blockCursor ? { cursor: blockCursor } : {}),
    });
    setUsers((old) =>
      next
        ? [
            ...old.filter((u) => !result.data.users.some((n) => u.userId === n.userId)),
            ...result.data.users,
          ]
        : result.data.users,
    );
    setBlockCursor(result.meta.nextCursor);
    return result;
  };
  const loadVisit = (id: number) =>
    task.run(async () => {
      setVisit(null);
      setLikeState(undefined);
      const result = await api.social.visit(id);
      setVisit(result);
      setHousingId(String(id));
      return result;
    });
  const changeLike = (liked: boolean) =>
    task.run(async () => {
      if (!visit) throw new Error('우주를 먼저 방문하세요.');
      const id = visit.housing.housingId,
        result = await (liked ? api.social.like(id) : api.social.unlike(id));
      setLikeState(result);
      try {
        setVisit(await api.social.visit(id));
        setNotice(null);
      } catch (error) {
        setVisit(null);
        setNotice(`좋아요 변경 성공. 재조회 실패: ${error instanceof Error ? error.message : ''}`);
      }
      return result;
    });
  return (
    <Page title="다른 우주 탐색·소셜" member>
      <Text style={styles.text}>
        내 우주 공개 설정이 필요합니다. 하우징 변경은 보류 중이므로 서버에서 공개된 테스트 계정을
        사용하세요.
      </Text>
      <TaskStatus task={task} />
      {notice ? <Text style={styles.error}>{notice}</Text> : null}
      <Card title="[API-801] 공개 우주 목록">
        <Choices
          values={['recent', 'popular']}
          value={sort}
          onChange={(v) => {
            setSort(v);
            setHousings([]);
            setCursor(null);
          }}
        />
        <Button title="우주 목록 조회" disabled={task.busy} onPress={() => void explore()} />
        {housings.map((h) => (
          <Button
            key={h.housingId}
            title={`${h.name} · ${h.ownerNickname} · 좋아요 ${h.likeCount} · 방문`}
            disabled={task.busy}
            onPress={() => void loadVisit(h.housingId)}
          />
        ))}
        <Button
          title="다음 페이지 조회"
          disabled={task.busy || !cursor}
          onPress={() => void explore(true)}
        />
        <Text>nextCursor: {cursor ?? '없음'}</Text>
      </Card>
      <Card title="[API-802~805] 방문·좋아요·신고">
        <Field
          label="방문할 housingId"
          value={housingId}
          onChange={(v) => {
            setHousingId(v);
            setVisit(null);
          }}
          numeric
        />
        <Button
          title="우주 상세 조회"
          disabled={task.busy || !housingId}
          onPress={() =>
            void task.run(async () => {
              setVisit(null);
              const result = await api.social.visit(positiveId(housingId));
              setVisit(result);
              return result;
            })
          }
        />
        <Json value={visit} />
        <Button
          title="좋아요 등록"
          disabled={task.busy || !visit || visit.likedByMe}
          onPress={() => void changeLike(true)}
        />
        <Button
          title="좋아요 취소"
          disabled={task.busy || !visit || !visit.likedByMe}
          onPress={() => void changeLike(false)}
        />
        <Json value={likeState} />
        <Choices
          values={['INAPPROPRIATE_NAME', 'ABUSE', 'SPAM', 'OTHER']}
          value={reason}
          onChange={setReason}
        />
        <Field label="신고 상세 (최대 255자)" value={detail} onChange={setDetail} multiline />
        <Button
          title="이 우주 신고"
          disabled={task.busy || !visit || detail.length > 255}
          onPress={() =>
            void task.run(() =>
              api.social.report(visit!.housing.housingId, reason, detail || undefined),
            )
          }
        />
      </Card>
      <Card title="[API-806~808] 차단 관리">
        <Text style={styles.text}>
          방문 응답에는 소유자 userId가 없습니다. 백엔드가 확인한 사용자 ID를 입력하세요.
          housingId를 대신 사용하지 마세요.
        </Text>
        <Field label="차단 대상 userId" value={userId} onChange={setUserId} numeric />
        <Button
          title="사용자 차단"
          disabled={task.busy || !userId}
          onPress={() =>
            void task.run(async () => {
              await api.social.block(positiveId(userId));
              setVisit(null);
              setHousings([]);
              setCursor(null);
              try {
                await blocks();
                return { status: '차단 완료' };
              } catch (error) {
                return {
                  status: '차단 완료, 목록 재조회 실패',
                  detail: error instanceof Error ? error.message : '',
                };
              }
            })
          }
        />
        <Button
          title="차단 목록 조회"
          disabled={task.busy}
          onPress={() => void task.run(() => blocks())}
        />
        {users.map((u) => (
          <Button
            key={u.userId}
            title={`${u.nickname} · userId=${u.userId} · 차단 해제`}
            disabled={task.busy}
            onPress={() =>
              void task.run(async () => {
                await api.social.unblock(u.userId);
                setUsers([]);
                setBlockCursor(null);
                try {
                  await blocks();
                  return { status: '차단 해제 완료' };
                } catch (error) {
                  return {
                    status: '차단 해제 완료, 목록 재조회 실패',
                    detail: error instanceof Error ? error.message : '',
                  };
                }
              })
            }
          />
        ))}
        <Button
          title="차단 목록 다음 페이지 조회"
          disabled={task.busy || !blockCursor}
          onPress={() => void task.run(() => blocks(true))}
        />
      </Card>
    </Page>
  );
}
