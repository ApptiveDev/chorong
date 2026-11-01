import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Me } from '../models';
import { Button, Card, Field, Nav, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function ProfileScreen() {
  const session = useIntegration(),
    task = useTask();
  const [me, setMe] = useState<Me | null>(null),
    [nickname, setNickname] = useState(''),
    [notice, setNotice] = useState('');
  const load = () =>
    task.run(async () => {
      const result = await api.account.me();
      setMe(result);
      setNickname(result.nickname);
    });
  useEffect(() => {
    if (session.ready && session.authenticated) void load();
  }, [session.ready, session.authenticated]);
  return (
    <UserScreen title="마이페이지">
      <UserStatus task={task} />
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
      {!session.authenticated ? <Nav href="/account" label="계정 관리" /> : null}
      {me ? (
        <>
          <Card title="내 정보">
            <Text style={styles.text}>
              {me.nickname} · {me.status === 'GUEST' ? '게스트' : '회원'}
            </Text>
            <Field label="닉네임" value={nickname} onChange={setNickname} />
            <Button
              title="닉네임 저장"
              disabled={task.busy || !nickname.trim()}
              onPress={() =>
                void task.run(
                  async () => {
                    await api.account.update({ nickname: nickname.trim() });
                    await api.account.me().then(setMe);
                  },
                  () => setNotice('닉네임을 변경했습니다.'),
                )
              }
            />
          </Card>
          <Card title="학습">
            <Text style={styles.text}>
              완료한 레슨 {me.progress.completedLessons}/{me.progress.totalLessons}
            </Text>
          </Card>
          <Card title="보유 재화">
            <Text style={styles.text}>
              별 {me.wallet.star} · 별가루 {me.wallet.stardust}
            </Text>
          </Card>
          <Card title="알림">
            <Text style={styles.text}>{me.pushEnabled ? '학습 알림 켜짐' : '학습 알림 꺼짐'}</Text>
            <Button
              title={me.pushEnabled ? '알림 끄기' : '알림 켜기'}
              disabled={task.busy}
              onPress={() =>
                void task.run(async () => {
                  await api.account.update({ pushEnabled: !me.pushEnabled });
                  await api.account.me().then(setMe);
                })
              }
            />
          </Card>
        </>
      ) : null}
      <Button
        title="새로고침"
        disabled={task.busy || !session.authenticated}
        onPress={() => void load()}
      />
      <Nav href="/account" label="계정 관리" />
    </UserScreen>
  );
}
