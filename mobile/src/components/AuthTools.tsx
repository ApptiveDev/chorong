import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../providers/AuthProvider';

export function AuthTools() {
  const { authenticated, user, operation, error, login, signup, me, refresh, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const busy = operation !== null;

  const run = async (action: () => Promise<void>, success: string, clearPassword = false) => {
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch {
      // 오류는 공통 인증 상태에 기록한다. 자동 갱신 실패도 같은 위치에 표시한다.
    } finally {
      if (clearPassword) setPassword('');
    }
  };

  const button = (label: string, onPress: () => void, disabled = busy) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>인증 테스트</Text>
      <Text>{authenticated ? '로그인됨' : '로그인되지 않음'}</Text>
      <Text style={styles.hint}>
        아이디는 이메일입니다. 화면을 이동해도 로그인은 유지되며, 새로고침하면 다시 로그인해야
        합니다.
      </Text>

      {!authenticated ? (
        <>
          <Text style={styles.label}>아이디(이메일)</Text>
          <TextInput
            accessibilityLabel="아이디(이메일)"
            style={styles.input}
            placeholder="이메일 입력"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            maxLength={255}
            editable={!busy}
          />
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            accessibilityLabel="비밀번호"
            style={styles.input}
            placeholder="비밀번호 입력"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            maxLength={72}
            editable={!busy}
          />
          <Text style={styles.hint}>테스트 계정 가입 시 비밀번호는 8~72자입니다.</Text>
          <View style={styles.actions}>
            {button(
              '로그인',
              () => {
                void run(
                  () => login({ email, password }),
                  '로그인과 내 정보 확인을 완료했습니다.',
                  true,
                );
              },
              busy || !email.trim() || !password,
            )}
            {button(
              '테스트 계정 가입',
              () => {
                void run(
                  () => signup({ email, password }),
                  '테스트 계정을 만들고 로그인했습니다.',
                  true,
                );
              },
              busy || !email.trim() || password.length < 8,
            )}
          </View>
        </>
      ) : (
        <>
          {user ? (
            <View style={styles.user}>
              <Text>사용자 ID: {user.userId}</Text>
              <Text>이메일: {user.email ?? '없음'}</Text>
              <Text>닉네임: {user.nickname ?? '없음'}</Text>
              <Text>인증 수단: {user.providers.join(', ')}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>내 정보를 조회해 주세요.</Text>
          )}
          <View style={styles.actions}>
            {button('내 정보 조회', () => {
              void run(me, '내 정보를 확인했습니다.');
            })}
            {button('토큰 갱신', () => {
              void run(refresh, '로그인 토큰을 갱신했습니다.');
            })}
            {button('로그아웃', () => {
              void run(logout, '서버 로그아웃을 확인하고 로그인 정보를 지웠습니다.', true);
            })}
          </View>
        </>
      )}
      {busy ? <ActivityIndicator accessibilityLabel="인증 요청 처리 중" /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {!error && message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  heading: { fontSize: 18, fontWeight: '600' },
  label: { fontSize: 14, color: '#374151' },
  hint: { fontSize: 13, lineHeight: 20, color: '#6b7280' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 15 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { backgroundColor: '#111827', borderRadius: 8, padding: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  user: { gap: 6 },
  error: { color: '#b91c1c', fontSize: 13, lineHeight: 20 },
  message: { color: '#166534', fontSize: 13, lineHeight: 20 },
});
