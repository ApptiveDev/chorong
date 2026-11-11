import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  ControlSettingRow,
  ControlSettingsScreen,
  figma,
} from '../../src/components/settings/ControlSettingsUI';
import { useIntegration, useTask } from '../../src/integration/hooks';
import { mockVisibility } from '../../src/integration/mockVisibility';
import type { BlockedUser, Me } from '../../src/integration/models';
import { integrationApi as api, useMockApi } from '../../src/integration/runtime';

// Figma S03_1 · 우주선 관리 (497:454)
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
  const member = session.ready && session.user?.status === 'ACTIVE';

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
    if (member) void load();
  }, [member]);

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
    <ControlSettingsScreen title="우주선 관리하기" onBack={() => router.replace('/more')}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <ControlSettingRow
          label="우주선 공개"
          value={isPublic}
          disabled={!me || task.busy}
          onPress={() => {
            if (!isPublic) return changeVisibility(true);
            setUnblockUser(null);
            setConfirmPrivate(true);
            setDialogVisible(true);
          }}
        />

        {/* 차단한 사용자: 제목(왼쪽 8)과 목록 사이 12 */}
        <View style={s.blocked}>
          <Text style={s.blockedTitle}>차단한 사용자</Text>
          <View style={s.card}>
            {users.length === 0 && !task.busy && !task.error ? (
              <Text style={s.empty}>차단한 사용자가 없습니다.</Text>
            ) : null}
            {users.map((user) => (
              <View key={user.userId} style={s.item}>
                <View style={s.who}>
                  <View style={s.star}>
                    <BlockedStar />
                  </View>
                  <Text style={s.nickname} numberOfLines={1}>
                    {user.nickname}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${user.nickname} 차단 해제`}
                  disabled={task.busy}
                  hitSlop={10}
                  onPress={() => {
                    setConfirmPrivate(false);
                    setUnblockUser(user);
                    setDialogVisible(true);
                  }}
                >
                  {({ pressed }) => (
                    <View style={s.unblock}>
                      <UnblockLabel color={pressed ? '#424242' : figma.base} />
                    </View>
                  )}
                </Pressable>
              </View>
            ))}
            {cursor ? (
              <Pressable accessibilityRole="button" disabled={task.busy} onPress={loadMore}>
                <Text style={s.more}>더 보기</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {session.ready && !member ? (
          <Text style={s.notice}>로그인하면 우주선을 관리할 수 있습니다.</Text>
        ) : null}
        {task.error ? <Text style={s.error}>{task.error}</Text> : null}
      </ScrollView>

      <Modal
        visible={dialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDialogVisible(false)}
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
                onPress={() => setDialogVisible(false)}
                style={s.secondary}
              >
                <Text style={s.actionText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={task.busy}
                onPress={() => (confirmPrivate ? changeVisibility(false) : unblock())}
                style={s.primary}
              >
                <Text style={s.actionText}>{confirmPrivate ? '비공개로 변경' : '해제'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ControlSettingsScreen>
  );
}

// Figma 656:2901 'Star 5' 원본 경로 (8.66×10, #161616)
// Figma 656:2929 '해제' 글자(DungGeunMo Regular 14)를 윤곽선으로 내보낸 SVG. 기본 #161616, 눌림 #424242.
function UnblockLabel({ color }: { color: string }) {
  return (
    <Svg width={27} height={12} viewBox="0 0 27 12" fill="none">
      <Path
        d="M4.375 0V0.875H7V1.75H0V0.875H2.625V0H4.375ZM9.625 6.125V11.375H7.875V0H9.625V5.25H10.5V0H12.25V11.375H10.5V6.125H9.625ZM5.25 9.625V10.5H1.75V9.625H0.875V8.75H0V4.375H0.875V3.5H1.75V2.625H5.25V3.5H6.125V4.375H7V8.75H6.125V9.625H5.25ZM2.625 3.5V4.375H1.75V8.75H2.625V9.625H4.375V8.75H5.25V4.375H4.375V3.5H2.625ZM23.625 0V11.375H21.875V6.125H20.125V5.25H21.875V0H23.625ZM26.25 0V11.375H24.5V0H26.25ZM21 9.625V10.5H19.25V9.625H18.375V8.75H16.625V9.625H15.75V10.5H14V9.625H14.875V8.75H15.75V7.875H16.625V1.75H14V0.875H21V1.75H18.375V7.875H19.25V8.75H20.125V9.625H21Z"
        fill={color}
      />
    </Svg>
  );
}

function BlockedStar() {
  return (
    <Svg width={8.66026} height={10} viewBox="0 0 8.66026 10" fill="none">
      <Path
        d="M4.33013 0L5.28504 3.34604L8.66025 2.5L6.23996 5L8.66025 7.5L5.28504 6.65396L4.33013 10L3.37521 6.65396L0 7.5L2.4203 5L0 2.5L3.37521 3.34604L4.33013 0Z"
        fill={figma.base}
      />
    </Svg>
  );
}

const s = StyleSheet.create({
  content: { paddingBottom: 40 },
  blocked: { marginTop: 24, gap: 12 },
  blockedTitle: {
    paddingLeft: 8,
    color: figma.base,
    fontFamily: 'PretendardMedium',
    fontSize: 16,
  },
  // 목록 상자: 위 12 · 아래 24 · 왼쪽 20 · 오른쪽 28
  card: {
    backgroundColor: figma.fale,
    borderWidth: 1,
    borderColor: figma.lght,
    borderRadius: 4,
    paddingTop: 12,
    paddingBottom: 24,
    paddingLeft: 20,
    paddingRight: 28,
  },
  // 항목: 위아래 12 · 좌우 2, 아래 구분선 1 #000
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  star: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  nickname: { flexShrink: 1, color: figma.base, fontFamily: 'PretendardRegular', fontSize: 14 },
  // Figma 656:2929 해제 버튼 칸 28×14
  unblock: { width: 28, height: 14, justifyContent: 'center' },
  empty: { paddingVertical: 12, color: '#747474', fontFamily: 'PretendardRegular', fontSize: 14 },
  more: { paddingTop: 12, color: figma.base, fontFamily: 'PretendardMedium', fontSize: 14 },
  notice: { marginTop: 16, color: '#747474', fontFamily: 'PretendardRegular', fontSize: 14 },
  error: { marginTop: 16, color: '#b00030', fontFamily: 'PretendardRegular', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: '#16161666', justifyContent: 'center', padding: 32 },
  dialog: { backgroundColor: figma.fale, borderRadius: 8, padding: 24, gap: 16 },
  dialogTitle: { color: figma.base, fontFamily: 'PretendardBold', fontSize: 20 },
  dialogCopy: { color: figma.base, fontFamily: 'PretendardRegular', fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12 },
  secondary: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: figma.base,
  },
  primary: { flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#70e2f1' },
  actionText: { color: figma.base, fontFamily: 'PretendardMedium', fontSize: 14 },
});
