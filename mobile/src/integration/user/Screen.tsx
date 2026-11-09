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
  completion = false,
}: {
  title: string;
  children: ReactNode;
  member?: boolean;
  scroll?: boolean;
  showTitle?: boolean;
  completion?: boolean;
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
      style={[screenStyles.safe, completion && screenStyles.completionSafe]}
      edges={scroll ? ['top', 'right', 'left'] : ['top', 'right', 'bottom', 'left']}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        <View style={[screenStyles.fixedPage, completion && screenStyles.completionPage]}>
          {content}
        </View>
      )}
    </SafeAreaView>
  );
}
const screenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  fixedPage: { flex: 1, minHeight: 0, paddingHorizontal: 18, paddingTop: 12, gap: 8 },
  completionSafe: { backgroundColor: '#161616' },
  completionPage: { paddingHorizontal: 0, paddingTop: 0, gap: 0, overflow: 'hidden' },
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
