import { useState } from 'react';
import { Platform as RNPlatform, Switch, Text } from 'react-native';
import { integrationApi as api, client } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import { storageNotice } from '../storage';
import type { Platform, Provider } from '../models';
import { Button, Card, Choices, Field, Json, Page, styles, TaskStatus } from '../ui';

export default function AccountScreen() {
  const { generation } = useIntegration();
  return <AccountForm key={generation} />;
}
function AccountForm() {
  const state = useIntegration(),
    task = useTask();
  const [platform, setPlatform] = useState<Platform | ''>(
    RNPlatform.OS === 'ios' ? 'IOS' : RNPlatform.OS === 'android' ? 'ANDROID' : '',
  );
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [verificationId, setVerificationId] = useState(''),
    [code, setCode] = useState('');
  const [provider, setProvider] = useState<Provider>('google');
  const [credential, setCredential] = useState(''),
    [authorizationCode, setAuthorizationCode] = useState('');
  const [all, setAll] = useState(false),
    [confirm, setConfirm] = useState(''),
    [reason, setReason] = useState('');
  const credentials = () =>
    provider === 'email'
      ? { verificationId }
      : provider === 'kakao'
        ? { accessToken: credential }
        : { idToken: credential, ...(authorizationCode ? { authorizationCode } : {}) };
  const clearCredentials = () => {
    setPassword('');
    setCredential('');
    setAuthorizationCode('');
    setCode('');
  };
  const authenticate = (action: () => Promise<void>) =>
    task.run(async () => {
      try {
        await action();
        return { status: '로그인 완료' };
      } finally {
        clearCredentials();
      }
    });
  return (
    <Page title="인증·계정 관리">
      <Text style={styles.text}>{storageNotice}</Text>
      <TaskStatus task={task} />
      <Card title="[API-101] 게스트 로그인">
        {RNPlatform.OS === 'web' ? (
          <Text style={styles.error}>
            명세에 WEB 플랫폼이 없습니다. 네이티브 계약 시험용 플랫폼을 직접 선택하세요. 웹용 계약은
            백엔드 확인이 필요합니다.
          </Text>
        ) : null}
        <Choices values={['IOS', 'ANDROID']} value={platform} onChange={setPlatform} />
        <Button
          title="게스트로 로그인"
          disabled={task.busy || !platform || state.authenticated}
          onPress={() => {
            if (platform) void authenticate(() => api.account.guest(platform));
          }}
        />
      </Card>
      <Card title="[API-102~104] 이메일 가입·로그인">
        <Field label="이메일" value={email} onChange={setEmail} />
        <Field
          label="비밀번호 (가입: 영문·숫자 포함 8~64자)"
          value={password}
          onChange={setPassword}
          secret
        />
        <Button
          title="인증코드 발송"
          disabled={task.busy || !email || !password}
          onPress={() =>
            void task.run(async () => {
              const data = await api.account.signup(email.trim(), password);
              setVerificationId(data.verificationId);
              setPassword('');
              return { status: '코드 발송 완료', expiresAt: data.expiresAt };
            })
          }
        />
        <Field
          label="인증 세션 (발송 성공 시 자동 입력)"
          value={verificationId}
          onChange={setVerificationId}
          secret
        />
        <Field label="6자리 인증코드" value={code} onChange={setCode} secret />
        <Button
          title="인증 확인·가입 완료"
          disabled={task.busy || !verificationId || !/^\d{6}$/.test(code)}
          onPress={() => void authenticate(() => api.account.verify(verificationId, code))}
        />
        <Button
          title="이메일로 로그인"
          disabled={task.busy || !email || !password}
          onPress={() => void authenticate(() => api.account.login(email.trim(), password))}
        />
        <Text style={styles.text}>
          코드 재발송은 같은 버튼을 사용합니다. 재발송 제한·만료·계정 잠금은 서버 응답을 확인하세요.
        </Text>
      </Card>
      <Card title="[API-105,108,109] OAuth·로그인 수단">
        <Text style={styles.error}>
          OAuth SDK와 플랫폼 자격 증명 설정이 없습니다. 자동 로그인은 연결 대기입니다. 아래는
          발급받은 자격 증명을 직접 입력하는 API 시험입니다.
        </Text>
        <Choices
          values={['email', 'google', 'kakao', 'apple']}
          value={provider}
          onChange={(v) => {
            setProvider(v);
            clearCredentials();
          }}
        />
        {provider !== 'email' ? (
          <Field
            label={
              provider === 'kakao'
                ? 'Kakao Access Token (화면·기록에서 숨김)'
                : 'ID Token (화면·기록에서 숨김)'
            }
            value={credential}
            onChange={setCredential}
            secret
          />
        ) : (
          <Text style={styles.text}>이메일 연동은 위에서 확인한 인증 세션을 사용합니다.</Text>
        )}
        {provider === 'apple' ? (
          <Field
            label="Apple Authorization Code (선택)"
            value={authorizationCode}
            onChange={setAuthorizationCode}
            secret
          />
        ) : null}
        <Button
          title="OAuth로 로그인·가입"
          disabled={task.busy || provider === 'email' || (!credential && !authorizationCode)}
          onPress={() => {
            if (provider !== 'email')
              void authenticate(() => api.account.oauth(provider, credentials()));
          }}
        />
        <Button
          title="로그인 수단 연동"
          disabled={
            task.busy ||
            state.user?.status !== 'ACTIVE' ||
            (provider === 'email' ? !verificationId : !credential && !authorizationCode)
          }
          onPress={() =>
            void task.run(async () => {
              const result = await api.account.link(provider, credentials());
              clearCredentials();
              await api.account.me();
              return result;
            })
          }
        />
        <Button
          title="선택한 로그인 수단 해제"
          disabled={task.busy || state.user?.status !== 'ACTIVE'}
          onPress={() =>
            void task.run(async () => {
              const result = await api.account.unlink(provider);
              await api.account.me();
              return result;
            })
          }
        />
      </Card>
      <Card title="[API-106,107,201] 현재 세션">
        <Json value={state.user} />
        <Button
          title="내 정보 다시 조회"
          disabled={task.busy || !state.authenticated}
          onPress={() => void task.run(api.account.me)}
        />
        <Button
          title="토큰 갱신"
          disabled={task.busy || !state.authenticated}
          onPress={() =>
            void task.run(async () => {
              await api.account.refresh();
              return { status: '토큰 갱신 완료' };
            })
          }
        />
        <Text>모든 디바이스에서 로그아웃</Text>
        <Switch value={all} onValueChange={setAll} />
        <Button
          title="로그아웃"
          disabled={task.busy || !state.authenticated}
          onPress={() => void task.run(() => api.account.logout(all))}
        />
        <Text style={styles.text}>
          서버 로그아웃 실패 시 세션을 유지합니다. 로컬 세션만 삭제하면 서버 토큰은 폐기되지
          않습니다.
        </Text>
        <Button
          title="로컬 세션만 삭제"
          disabled={task.busy || !state.authenticated}
          onPress={() =>
            void client.clear('로컬 세션 삭제됨. 서버 토큰 폐기 여부는 확인하지 않았습니다.')
          }
        />
      </Card>
      <Card title="[API-110] 회원 탈퇴">
        <Field label="탈퇴 사유 (선택, 최대 255자)" value={reason} onChange={setReason} />
        <Field label="실제 계정 탈퇴: ‘탈퇴’ 입력" value={confirm} onChange={setConfirm} />
        <Button
          title="회원 탈퇴"
          disabled={
            task.busy ||
            state.user?.status !== 'ACTIVE' ||
            confirm !== '탈퇴' ||
            reason.length > 255
          }
          onPress={() => void task.run(() => api.account.withdraw(reason || undefined))}
        />
      </Card>
    </Page>
  );
}
