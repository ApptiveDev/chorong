import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, type Href } from 'expo-router';
import { redact } from './client';
import { useIntegration, type useTask } from './hooks';

export const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 50, gap: 14, backgroundColor: '#fff', flexGrow: 1 },
  card: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, gap: 10 },
  title: { fontSize: 21, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 16, fontWeight: '600' },
  text: { fontSize: 14, color: '#334155', lineHeight: 21 },
  input: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 5,
    padding: 10,
    color: '#0f172a',
    minHeight: 44,
  },
  button: { backgroundColor: '#1e40af', borderRadius: 5, padding: 12, minHeight: 44 },
  disabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b91c1c', lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  json: { fontSize: 12, color: '#334155', fontFamily: 'monospace' },
});
export function Page({
  title,
  children,
  member = false,
}: {
  title: string;
  children: ReactNode;
  member?: boolean;
}) {
  const state = useIntegration();
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>
        실제 API 모드 ·{' '}
        {state.authenticated
          ? `${state.user?.status} · userId=${state.user?.userId}`
          : '로그인 안 됨'}
      </Text>
      {state.notice ? <Text style={styles.error}>{state.notice}</Text> : null}
      {!state.ready ? (
        <ActivityIndicator accessibilityLabel="인증 복원 중" />
      ) : member && state.user?.status !== 'ACTIVE' ? (
        <>
          <Text style={styles.error}>
            회원 전용 기능입니다. 이메일 또는 OAuth로 가입·로그인하세요.
          </Text>
          <Nav href="/integration/account" label="계정 관리 열기" />
        </>
      ) : (
        children
      )}
    </ScrollView>
  );
}
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>{title}</Text>
      {children}
    </View>
  );
}
export function Button({
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
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Nav({ href, label }: { href: Href; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" style={styles.button}>
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </Link>
  );
}
export function Field({
  label,
  value,
  onChange,
  secret = false,
  multiline = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  multiline?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={styles.text}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secret}
        multiline={multiline && !secret}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={numeric ? 'numeric' : 'default'}
        style={styles.input}
      />
    </View>
  );
}
export function Choices<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T | '';
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.row}>
      {values.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === v }}
          onPress={() => onChange(v)}
          style={[styles.input, value === v && { backgroundColor: '#dbeafe' }]}
        >
          <Text>{v}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Json({ value }: { value: unknown }) {
  return value === undefined ? null : (
    <Text selectable style={styles.json}>
      {JSON.stringify(redact(value), null, 2)}
    </Text>
  );
}
export function TaskStatus({
  task,
  showResult = true,
}: {
  task: ReturnType<typeof useTask>;
  showResult?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {task.busy ? <ActivityIndicator accessibilityLabel="요청 중" /> : null}
      {task.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {task.error}
        </Text>
      ) : null}
      {showResult && task.result !== undefined ? (
        <>
          <Text style={styles.text}>요청 완료</Text>
          <Json value={task.result} />
        </>
      ) : null}
    </View>
  );
}
export function positiveId(text: string) {
  const n = Number(text);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(n))
    throw new Error('양의 정수 ID를 입력하세요.');
  return n;
}
