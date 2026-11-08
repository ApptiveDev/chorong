import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import { UserStatus } from './Screen';
import { WelcomeCat } from './WelcomeScreen';

export default function AccountScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const afterLogin = returnTo === '/social' ? '/social' : '/quiz';
  const session = useIntegration();
  const task = useTask();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const canSubmit = Boolean(email.trim() && password);

  const login = () =>
    void task.run(async () => {
      await api.account.login(email.trim(), password);
      setPassword('');
      router.replace(afterLogin);
    });
  const signup = () =>
    void task.run(
      () => api.account.signup(email.trim(), password),
      (result) => {
        setVerificationId(result.verificationId);
        setPassword('');
        setCode('');
      },
    );
  const verify = () =>
    void task.run(async () => {
      await api.account.verify(verificationId, code.trim());
      setCode('');
      router.replace(afterLogin);
    });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          onPress={() => router.back()}
          style={s.back}
        >
          <Ionicons name="chevron-back" size={24} color="#282636" />
        </Pressable>
        <View style={s.intro}>
          <WelcomeCat size={76} />
          <Text style={s.title}>{verificationId ? '이메일을 확인해요' : '로그인·회원가입'}</Text>
          <Text style={s.description}>
            {verificationId
              ? `${email.trim()}로 보낸 인증코드를 입력하세요.`
              : '배운 내용과 꾸민 우주선을 계정에 저장해요.'}
          </Text>
        </View>
        <UserStatus task={task} />
        {session.user?.status === 'ACTIVE' ? (
          <View style={s.form}>
            <Text style={s.accountName}>{session.user.nickname}</Text>
            <Text style={s.description}>로그인됨</Text>
            <Action title="프로필 보기" onPress={() => router.replace('/profile')} />
          </View>
        ) : verificationId ? (
          <View style={s.form}>
            <Text style={s.label}>인증코드</Text>
            <TextInput
              accessibilityLabel="인증코드"
              placeholder="이메일 인증코드"
              placeholderTextColor="#aaa3b1"
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              style={s.input}
            />
            <Action title="인증 완료" disabled={task.busy || !code.trim()} onPress={verify} />
            <Action title="이메일 다시 입력" secondary onPress={() => setVerificationId('')} />
          </View>
        ) : (
          <View style={s.form}>
            <Text style={s.label}>이메일</Text>
            <TextInput
              accessibilityLabel="이메일"
              placeholder="이메일"
              placeholderTextColor="#aaa3b1"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={s.input}
            />
            <Text style={s.label}>비밀번호</Text>
            <TextInput
              accessibilityLabel="비밀번호"
              placeholder="비밀번호"
              placeholderTextColor="#aaa3b1"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              style={s.input}
            />
            <View style={s.actions}>
              <Action title="로그인" disabled={task.busy || !canSubmit} onPress={login} />
              <Action
                title="회원가입"
                secondary
                disabled={task.busy || !canSubmit}
                onPress={signup}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary ? s.secondary : s.primary, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 16, paddingBottom: 34 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  intro: { alignItems: 'center', gap: 10, marginTop: 40, marginBottom: 32 },
  title: { color: '#282636', fontSize: 23, fontWeight: '700', textAlign: 'center', marginTop: 7 },
  description: { color: '#888591', fontSize: 13, lineHeight: 21, textAlign: 'center' },
  form: { gap: 10 },
  label: { color: '#655174', fontSize: 12, fontWeight: '600', marginTop: 8 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#e8e1ed',
    borderRadius: 13,
    backgroundColor: '#fbf9fc',
    paddingHorizontal: 15,
    color: '#282636',
    fontSize: 14,
  },
  actions: { gap: 10, marginTop: 15 },
  button: {
    minHeight: 52,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: '#302b38' },
  secondary: { backgroundColor: '#f2f0f5' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryText: { color: '#655b76' },
  disabled: { opacity: 0.38 },
  accountName: { color: '#282636', fontSize: 17, fontWeight: '700', textAlign: 'center' },
});
