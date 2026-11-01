import { useState } from 'react';
import { Platform, Text } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import { Button, Card, Field, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function AccountScreen() {
  const session = useIntegration(),
    task = useTask();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [verificationId, setVerificationId] = useState(''),
    [notice, setNotice] = useState('');
  const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : null;
  return (
    <UserScreen title="계정 관리">
      <Text style={styles.text}>
        {session.authenticated
          ? `${session.user?.nickname ?? '사용자'} · ${session.user?.status === 'GUEST' ? '게스트' : '회원'}`
          : '로그인하지 않았습니다.'}
      </Text>
      <UserStatus task={task} />
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
      {platform === null ? (
        <Text style={styles.text}>
          웹 게스트 로그인은 플랫폼 값이 명세에 없어 사용할 수 없습니다. 네이티브 앱에서 시험하세요.
        </Text>
      ) : null}
      <Button
        title="게스트로 시작"
        disabled={task.busy || session.authenticated || platform === null}
        onPress={() =>
          void task.run(
            () => api.account.guest(platform!),
            () => setNotice('게스트 계정을 만들었습니다.'),
          )
        }
      />
      <Card title="이메일 로그인 및 가입">
        <Field label="이메일" value={email} onChange={setEmail} />
        <Field label="비밀번호" value={password} onChange={setPassword} secret />
        <Button
          title="로그인"
          disabled={task.busy || !email || !password}
          onPress={() =>
            void task.run(
              () => api.account.login(email.trim(), password),
              () => setNotice('로그인했습니다.'),
            )
          }
        />
        <Button
          title="회원가입"
          disabled={task.busy || !email || !password}
          onPress={() =>
            void task.run(
              () => api.account.signup(email.trim(), password),
              (result) => {
                setVerificationId(result.verificationId);
                setNotice('이메일로 보낸 인증코드를 입력하세요.');
              },
            )
          }
        />
        {verificationId ? (
          <>
            <Field label="인증코드" value={code} onChange={setCode} />
            <Button
              title="인증 완료"
              disabled={task.busy || !code}
              onPress={() =>
                void task.run(
                  () => api.account.verify(verificationId, code.trim()),
                  () => setNotice('인증하고 로그인했습니다.'),
                )
              }
            />
          </>
        ) : null}
      </Card>
      <Text style={styles.text}>소셜 로그인은 플랫폼 자격 증명 설정 후 연결할 수 있습니다.</Text>
      {session.authenticated ? (
        <Button
          title="로그아웃"
          disabled={task.busy}
          onPress={() =>
            void task.run(
              () => api.account.logout(false),
              () => setNotice('로그아웃했습니다.'),
            )
          }
        />
      ) : null}
    </UserScreen>
  );
}
