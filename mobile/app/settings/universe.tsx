import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { integrationApi as api, useMockApi } from '../../src/integration/runtime';
import { mockVisibility } from '../../src/integration/mockVisibility';
import { useIntegration, useTask } from '../../src/integration/hooks';
import type { BlockedUser, Me } from '../../src/integration/models';
import { UserStatus } from '../../src/integration/user/Screen';
import { ControlSwitch } from '../../src/integration/user/ControlSwitch';

export default function UniverseSettings() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [confirmPrivate, setConfirmPrivate] = useState(false);
  const [unblockUser, setUnblockUser] = useState<BlockedUser | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const mockPublic = useSyncExternalStore(
    mockVisibility.subscribe,
    mockVisibility.get,
    mockVisibility.get,
  );
  const isPublic = useMockApi ? mockPublic : (me?.housing.isPublic ?? false);

  const load = () =>
    task.run(async () => {
      const [account, page] = await Promise.all([
        api.account.me(),
        api.social.blocks({ size: 20 }),
      ]);
      setMe(account);
      setUsers(page.data.users);
      setCursor(page.meta.nextCursor);
    });
  useEffect(() => {
    if (session.ready && session.user?.status === 'ACTIVE') void load();
  }, [session.ready, session.user?.status]);

  const changeVisibility = (value: boolean) =>
    void task.run(async () => {
      const housing = await api.room.update({ isPublic: value });
      setMe((current) =>
        current
          ? { ...current, housing: { ...current.housing, isPublic: housing.isPublic } }
          : current,
      );
      if (useMockApi) mockVisibility.set(housing.isPublic);
      setDialogVisible(false);
    });
  const loadMore = () =>
    void task.run(async () => {
      if (!cursor) return;
      const page = await api.social.blocks({ size: 20, cursor });
      setUsers((current) => [...current, ...page.data.users]);
      setCursor(page.meta.nextCursor);
    });
  const unblock = () =>
    void task.run(async () => {
      if (!unblockUser) return;
      await api.social.unblock(unblockUser.userId);
      const page = await api.social.blocks({ size: 20 });
      setUsers(page.data.users);
      setCursor(page.meta.nextCursor);
      setDialogVisible(false);
    });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="제어실로 돌아가기"
            onPress={() => router.back()}
            style={s.back}
          >
            <Ionicons name="chevron-back" size={24} color="#282636" />
          </Pressable>
          <Text style={s.title}>우주선 관리하기</Text>
        </View>
        <UserStatus task={task} />
        {session.user?.status === 'ACTIVE' ? (
          <>
            <View style={s.group}>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="우주선 공개"
                accessibilityState={{ checked: isPublic, disabled: !me || task.busy }}
                disabled={!me || task.busy}
                onPress={() => {
                  if (!isPublic) return changeVisibility(true);
                  setUnblockUser(null);
                  setConfirmPrivate(true);
                  setDialogVisible(true);
                }}
                style={s.settingRow}
              >
                <Text style={s.label}>우주선 공개</Text>
                <ControlSwitch value={isPublic} />
              </Pressable>
            </View>
            <View style={s.blockedSection}>
              <Text style={s.sectionTitle}>차단한 사용자</Text>
              {!task.busy && !task.error && users.length === 0 ? (
                <Text style={s.empty}>차단한 사용자가 없어요.</Text>
              ) : null}
              {users.map((user) => (
                <View key={user.userId} style={s.blockedRow}>
                  <Text style={s.label}>{user.nickname}</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={task.busy}
                    onPress={() => {
                      setConfirmPrivate(false);
                      setUnblockUser(user);
                      setDialogVisible(true);
                    }}
                    style={s.unblockButton}
                  >
                    <Text style={s.unblockText}>해제</Text>
                  </Pressable>
                </View>
              ))}
              {cursor ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={task.busy}
                  onPress={loadMore}
                  style={s.moreButton}
                >
                  <Text style={s.unblockText}>더 보기</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : (
          <Text style={s.empty}>로그인하면 우주선을 관리할 수 있어요.</Text>
        )}
      </ScrollView>
      <Modal
        visible={dialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDialogVisible(false);
        }}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>
              {confirmPrivate ? '우주선을 비공개로 바꿀까요?' : '차단을 해제할까요?'}
            </Text>
            <Text style={s.dialogCopy}>
              {confirmPrivate
                ? '다른 별지기에게 보이지 않고, 다른 우주선도 구경할 수 없어요.'
                : '이 사용자의 우주선이 다시 구경 목록에 나타날 수 있어요.'}
            </Text>
            <View style={s.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDialogVisible(false);
                }}
                style={s.secondary}
              >
                <Text style={s.secondaryText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={task.busy}
                onPress={() => (confirmPrivate ? changeVisibility(false) : unblock())}
                style={s.primary}
              >
                <Text style={s.primaryText}>{confirmPrivate ? '비공개로 변경' : '해제'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 40, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#282636', fontSize: 21, fontWeight: '700' },
  group: {
    borderWidth: 1,
    borderColor: '#eeeaf3',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 3,
  },
  settingRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { color: '#282636', fontSize: 14 },
  blockedSection: { marginTop: 65 },
  sectionTitle: { color: '#282636', fontSize: 15, fontWeight: '700', marginBottom: 14 },
  empty: { color: '#aaa3b1', fontSize: 13, paddingVertical: 16 },
  blockedRow: {
    borderWidth: 1,
    borderColor: '#e4deea',
    borderRadius: 12,
    padding: 13,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unblockButton: {
    paddingVertical: 9,
    paddingHorizontal: 17,
    borderRadius: 9,
    backgroundColor: '#f0edf4',
  },
  unblockText: { color: '#655b76', fontSize: 12 },
  moreButton: { alignSelf: 'center', padding: 12 },
  overlay: {
    flex: 1,
    backgroundColor: '#34273c63',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 23,
    padding: 25,
    gap: 16,
  },
  dialogTitle: { color: '#282636', fontSize: 20, fontWeight: '700' },
  dialogCopy: { color: '#807188', fontSize: 13, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 8 },
  primary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: '#373044',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: '#f3f1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#655b76', fontSize: 13, fontWeight: '600' },
});
