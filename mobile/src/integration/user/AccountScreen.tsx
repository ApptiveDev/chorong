import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import { UserStatus } from './Screen';

const navy = '#273a52';

export default function AccountScreen() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [notice, setNotice] = useState('');
  const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : null;
  const login = () =>
    void task.run(async () => {
      await api.account.login(email.trim(), password);
      setPassword('');
      router.replace('/quiz');
    });
  const signup = () =>
    void task.run(
      () => api.account.signup(email.trim(), password),
      (result) => {
        setVerificationId(result.verificationId);
        setPassword('');
        setNotice('인증코드를 입력하세요.');
      },
    );
  const verify = () =>
    void task.run(async () => {
      await api.account.verify(verificationId, code.trim());
      setCode('');
      router.replace('/quiz');
    });
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={navy} />
          <Text style={s.backText}>제어실</Text>
        </Pressable>
        <Text style={s.title}>로그인·기록 연결</Text>
        <UserStatus task={task} />
        {notice ? <Text style={s.caption}>{notice}</Text> : null}
        {session.authenticated ? (
          <View style={s.card}>
            <Text style={s.heading}>{session.user?.nickname}</Text>
            <Text style={s.caption}>
              {session.user?.status === 'GUEST' ? '게스트 로그인' : '회원'}
            </Text>
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.heading}>기록을 이어가고 우주선을 꾸며요</Text>
            <Text style={s.caption}>로그인하면 학습 기록을 확인할 수 있습니다.</Text>
          </View>
        )}
        <View style={s.illustration}>
          <Ionicons name="planet-outline" size={38} color="#a5b3c3" />
          <Text style={s.caption}>초롱이 · 우주선</Text>
        </View>
        <Text style={s.section}>이메일로 계속</Text>
        <TextInput
          accessibilityLabel="이메일"
          placeholder="이메일"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={s.input}
        />
        <TextInput
          accessibilityLabel="비밀번호"
          placeholder="비밀번호"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={s.input}
        />
        <Action title="로그인" disabled={task.busy || !email || !password} onPress={login} />
        <Outline title="회원가입" disabled={task.busy || !email || !password} onPress={signup} />
        {verificationId ? (
          <>
            <Text style={s.caption}>이메일로 받은 인증코드를 입력하세요.</Text>
            <TextInput
              accessibilityLabel="인증코드"
              placeholder="인증코드"
              value={code}
              onChangeText={setCode}
              style={s.input}
            />
            <Action title="인증 완료" disabled={task.busy || !code} onPress={verify} />
          </>
        ) : null}
        <Text style={s.section}>다른 방법</Text>
        {(['애플로 계속', '구글로 계속', '카카오로 계속'] as const).map((title) => (
          <Outline key={title} title={title} disabled onPress={() => {}} />
        ))}
        <Text style={s.caption}>소셜 로그인은 인증 설정 후 사용할 수 있습니다.</Text>
        {!session.authenticated ? (
          <>
            <Outline
              title="게스트로 시작"
              disabled={task.busy || platform === null}
              onPress={() => {
                if (platform)
                  void task.run(async () => {
                    await api.account.guest(platform);
                    router.replace('/quiz');
                  });
              }}
            />
            {platform === null ? (
              <Text style={s.caption}>웹 게스트 로그인은 플랫폼 명세 확인이 필요합니다.</Text>
            ) : null}
          </>
        ) : null}
        {session.authenticated ? (
          <>
            <Outline title="프로필과 계정" onPress={() => router.push('/profile')} />
            <Outline
              title="로그아웃"
              disabled={task.busy}
              onPress={() =>
                void task.run(
                  () => api.account.logout(false),
                  () => setNotice('로그아웃됐습니다.'),
                )
              }
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.primary, disabled && s.disabled]}
    >
      <Text style={s.primaryText}>{title}</Text>
    </Pressable>
  );
}
function Outline({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.outline, disabled && s.disabled]}
    >
      <Text style={s.outlineText}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 18, gap: 9, paddingBottom: 35 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' },
  backText: { color: navy, fontSize: 12 },
  title: { textAlign: 'center', color: navy, fontSize: 17, fontWeight: '700', marginBottom: 7 },
  card: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 5,
    backgroundColor: '#f8f9fb',
    padding: 13,
    gap: 4,
  },
  heading: { color: navy, fontSize: 13, fontWeight: '700' },
  caption: { color: '#7b8795', fontSize: 12, lineHeight: 18 },
  illustration: {
    height: 130,
    backgroundColor: '#f2f4f7',
    borderWidth: 1,
    borderColor: '#dce2e8',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  section: { color: navy, fontSize: 12, fontWeight: '700', marginTop: 7 },
  input: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 10,
    color: navy,
    fontSize: 13,
  },
  primary: {
    minHeight: 43,
    borderRadius: 4,
    backgroundColor: navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  outline: {
    minHeight: 42,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dce2e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { color: navy, fontSize: 12 },
  disabled: { opacity: 0.45 },
});
