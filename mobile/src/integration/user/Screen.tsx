import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Nav, styles } from '../ui';
import { useIntegration, type useTask } from '../hooks';

export function UserScreen({
  title,
  children,
  member = false,
  scroll = true,
  showTitle = true,
  dark = false,
  quiz = false,
}: {
  title: string;
  children: ReactNode;
  member?: boolean;
  scroll?: boolean;
  showTitle?: boolean;
  dark?: boolean;
  quiz?: boolean;
}) {
  const session = useIntegration();
  const content = (
    <>
      {showTitle ? <Text style={styles.title}>{title}</Text> : null}
      {session.notice ? <Text style={styles.error}>{session.notice}</Text> : null}
      {!session.ready ? (
        <ActivityIndicator accessibilityLabel="계정 확인 중" />
      ) : member && session.user?.status !== 'ACTIVE' ? (
        <>
          <Text style={styles.text}>회원가입 또는 로그인 후 사용할 수 있습니다.</Text>
          <Nav href="/account" label="계정 관리" />
        </>
      ) : (
        children
      )}
    </>
  );
  return (
    <SafeAreaView
      style={[screenStyles.safe, quiz && screenStyles.quizSafe, dark && screenStyles.darkSafe]}
      edges={scroll ? ['top', 'right', 'left'] : ['top', 'right', 'bottom', 'left']}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        <View
          style={[
            screenStyles.fixedPage,
            quiz && screenStyles.quizPage,
            dark && screenStyles.darkPage,
          ]}
        >
          {content}
        </View>
      )}
    </SafeAreaView>
  );
}
const screenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  quizSafe: { backgroundColor: '#e4e4e4' },
  fixedPage: { flex: 1, minHeight: 0, paddingHorizontal: 18, paddingTop: 12, gap: 8 },
  quizPage: { backgroundColor: '#e4e4e4', paddingHorizontal: 0, paddingTop: 0, gap: 0 },
  darkSafe: { backgroundColor: '#161616' },
  darkPage: { paddingHorizontal: 0, paddingTop: 0, gap: 0, overflow: 'hidden' },
});
export function UserStatus({ task }: { task: ReturnType<typeof useTask> }) {
  const message = task.error?.replace(/^[A-Z_]+:\s*/, '').replace(/\s*\(HTTP \d+\)$/, '');
  return (
    <>
      {task.busy ? <ActivityIndicator accessibilityLabel="불러오는 중" /> : null}
      {message ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {message}
        </Text>
      ) : null}
    </>
  );
}
