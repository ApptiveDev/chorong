import { useState } from 'react';
import { Platform as RNPlatform, Switch, Text } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Platform } from '../models';
import { Button, Card, Choices, Field, Json, Nav, Page, styles, TaskStatus } from '../ui';

export default function ProfileScreen() {
  const { generation } = useIntegration();
  return <ProfileForm key={generation} />;
}
function ProfileForm() {
  const auth = useIntegration(),
    task = useTask();
  const [nickname, setNickname] = useState(''),
    [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState('');
  const [platform, setPlatform] = useState<Platform | ''>(
    RNPlatform.OS === 'ios' ? 'IOS' : RNPlatform.OS === 'android' ? 'ANDROID' : '',
  );
  const [rewards, setRewards] = useState<unknown[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadRewards = (next = false) =>
    task.run(async () => {
      const data = await api.benefits.rewards({ size: 20, ...(next && cursor ? { cursor } : {}) });
      setRewards((old) => (next ? [...old, ...data.data.rewards] : data.data.rewards));
      setCursor(data.meta.nextCursor);
      return data;
    });
  const update = (body: { nickname?: string; pushEnabled?: boolean }) =>
    task.run(async () => {
      const result = await api.account.update(body);
      try {
        await api.account.me();
        setNotice(null);
      } catch (e) {
        setNotice(`수정 성공. 내 정보 재조회 실패: ${e instanceof Error ? e.message : ''}`);
      }
      return result;
    });
  return (
    <Page title="마이페이지">
      <TaskStatus task={task} />
      {notice ? <Text style={styles.error}>{notice}</Text> : null}
      <Card title="[API-201,202] 내 정보">
        <Json value={auth.user} />
        <Button
          title="내 정보 조회"
          disabled={task.busy || !auth.authenticated}
          onPress={() =>
            void task.run(async () => {
              const data = await api.account.me();
              setNickname(data.nickname);
              setPushEnabled(data.pushEnabled);
              return data;
            })
          }
        />
        <Field label="닉네임 (2~12자)" value={nickname} onChange={setNickname} />
        <Button
          title="닉네임 저장"
          disabled={task.busy || !auth.authenticated || nickname.length < 2 || nickname.length > 12}
          onPress={() => void update({ nickname })}
        />
        <Nav href="/integration/account" label="로그인 수단·계정 관리 열기" />
      </Card>
      <Card title="[API-408,904~906] 진행도·재화·보상·별자리">
        <Button
          title="학습 진행도 조회"
          disabled={task.busy || !auth.authenticated}
          onPress={() => void task.run(api.learning.progress)}
        />
        <Button
          title="지갑 잔액 조회"
          disabled={task.busy || !auth.authenticated}
          onPress={() => void task.run(api.benefits.wallet)}
        />
        <Button
          title="별자리 획득 현황 조회"
          disabled={task.busy || !auth.authenticated}
          onPress={() => void task.run(api.benefits.constellations)}
        />
        <Button
          title="보상 지급 내역 조회"
          disabled={task.busy || !auth.authenticated}
          onPress={() => void loadRewards()}
        />
        <Json value={rewards} />
        <Button
          title="보상 다음 페이지 조회"
          disabled={task.busy || !cursor}
          onPress={() => void loadRewards(true)}
        />
      </Card>
      <Card title="[API-301,302,202] 알림 설정">
        <Text style={styles.error}>
          Push SDK·플랫폼 자격 증명이 설정되지 않았습니다. 자동 토큰 획득·권한 요청은 연결
          대기입니다. 실제 네이티브 Push Token으로 등록·삭제 API를 시험할 수 있습니다. 웹 Push는
          명세에 없습니다.
        </Text>
        <Text>학습 알림 사용</Text>
        <Switch
          accessibilityLabel="학습 알림 사용"
          value={pushEnabled}
          onValueChange={setPushEnabled}
        />
        <Button
          title="학습 알림 설정 저장"
          disabled={task.busy || !auth.authenticated}
          onPress={() => void update({ pushEnabled })}
        />
        <Choices values={['IOS', 'ANDROID']} value={platform} onChange={setPlatform} />
        <Field label="네이티브 Push Token" value={pushToken} onChange={setPushToken} secret />
        <Button
          title="Push Token 등록·갱신"
          disabled={
            task.busy || !auth.authenticated || !pushToken || !platform || RNPlatform.OS === 'web'
          }
          onPress={() => {
            if (platform)
              void task.run(async () => {
                await api.account.registerPush(platform, pushToken);
                setPushToken('');
              });
          }}
        />
        <Button
          title="현재 디바이스 Push Token 삭제"
          disabled={task.busy || !auth.authenticated}
          onPress={() => void task.run(api.account.removePush)}
        />
      </Card>
    </Page>
  );
}
