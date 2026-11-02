import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { integrationApi as api } from '../../src/integration/runtime';
import { useIntegration, useTask } from '../../src/integration/hooks';
import type { BlockedUser } from '../../src/integration/models';
import { UserStatus } from '../../src/integration/user/Screen';

export default function BlockedUsers() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const load = (append = false) =>
    task.run(async () => {
      const result = await api.social.blocks({ size: 20, ...(append && cursor ? { cursor } : {}) });
      setUsers((old) => (append ? [...old, ...result.data.users] : result.data.users));
      setCursor(result.meta.nextCursor);
    });
  useEffect(() => {
    if (session.ready && session.user?.status === 'ACTIVE') void load();
  }, [session.ready, session.user?.status]);
  const unblock = (userId: number) =>
    void task.run(async () => {
      await api.social.unblock(userId);
      const result = await api.social.blocks({ size: 20 });
      setUsers(result.data.users);
      setCursor(result.meta.nextCursor);
    });
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#273a52" />
          <Text style={s.text}>우주선 관리</Text>
        </Pressable>
        <Text style={s.title}>차단한 사용자</Text>
        <UserStatus task={task} />
        {session.user?.status !== 'ACTIVE' ? (
          <Text style={s.caption}>회원 로그인 후 확인할 수 있습니다.</Text>
        ) : (
          <>
            {!task.busy && !task.error && !users.length ? (
              <View style={s.empty}>
                <Text style={s.caption}>차단한 사용자가 없어요</Text>
              </View>
            ) : null}
            {users.map((user) => (
              <View key={user.userId} style={s.row}>
                <Text style={s.text}>{user.nickname}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={task.busy}
                  onPress={() => unblock(user.userId)}
                  style={s.release}
                >
                  <Text style={s.text}>해제</Text>
                </Pressable>
              </View>
            ))}
            {cursor ? (
              <Pressable
                accessibilityRole="button"
                disabled={task.busy}
                onPress={() => void load(true)}
                style={s.row}
              >
                <Text style={s.text}>더 보기</Text>
              </Pressable>
            ) : null}
            {task.error ? (
              <Pressable accessibilityRole="button" onPress={() => void load()} style={s.row}>
                <Text style={s.text}>다시 불러오기</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 18, gap: 8, flexGrow: 1 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
  title: {
    textAlign: 'center',
    color: '#273a52',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  row: {
    minHeight: 45,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 4,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: { color: '#273a52', fontSize: 12 },
  release: {
    backgroundColor: '#eef1f4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
  },
  caption: { color: '#7b8795', fontSize: 12 },
  empty: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center' },
});
