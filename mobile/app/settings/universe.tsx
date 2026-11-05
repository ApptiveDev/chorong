import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { integrationApi as api, useMockApi } from '../../src/integration/runtime';
import { mockVisibility } from '../../src/integration/mockVisibility';
import { useIntegration, useTask } from '../../src/integration/hooks';
import type { Me } from '../../src/integration/models';
import { UserStatus } from '../../src/integration/user/Screen';

export default function UniverseSettings() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [me, setMe] = useState<Me | null>(null);
  const [confirmPublic, setConfirmPublic] = useState<boolean | null>(null);
  const mockPublic = useSyncExternalStore(
    mockVisibility.subscribe,
    mockVisibility.get,
    mockVisibility.get,
  );
  const isPublic = useMockApi ? mockPublic : (me?.housing.isPublic ?? false);
  const load = () =>
    task.run(async () => {
      const data = await api.account.me();
      setMe(data);
    });
  useEffect(() => {
    if (session.ready && session.authenticated) void load();
  }, [session.ready, session.authenticated]);
  const togglePush = () =>
    void task.run(async () => {
      if (!me) return;
      setMe(await api.account.update({ pushEnabled: !me.pushEnabled }));
    });
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#273a52" />
          <Text style={s.text}>제어실</Text>
        </Pressable>
        <Text style={s.title}>우주선 관리하기</Text>
        <UserStatus task={task} />
        {!session.authenticated ? (
          <Text style={s.text}>로그인하면 설정을 볼 수 있습니다.</Text>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: session.user?.status !== 'ACTIVE' }}
              disabled={session.user?.status !== 'ACTIVE'}
              style={s.row}
              onPress={() => router.push('/settings/blocked')}
            >
              <Text style={s.text}>차단한 사용자</Text>
              <Ionicons name="chevron-forward" size={17} color="#7b8795" />
            </Pressable>
            <View style={s.row}>
              <View>
                <Text style={s.text}>우주선 공개</Text>
                <Text style={s.caption}>
                  {useMockApi
                    ? '공개하면 다른 우주선을 구경할 수 있어요.'
                    : '공개 설정 API 확정 대기'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="우주선 공개"
                value={isPublic}
                disabled={!useMockApi || !me}
                onValueChange={setConfirmPublic}
              />
            </View>
            <View style={s.row}>
              <Text style={s.text}>학습 알림</Text>
              <Switch
                accessibilityLabel="학습 알림"
                value={me?.pushEnabled ?? false}
                disabled={!me || task.busy}
                onValueChange={togglePush}
              />
            </View>
          </>
        )}
      </ScrollView>
      <Modal
        visible={confirmPublic !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmPublic(null)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>
              {confirmPublic ? '공개하고 구경할까요?' : '비공개로 전환할까요?'}
            </Text>
            <Text style={s.text}>
              {confirmPublic
                ? '닉네임과 저장된 우주선이 공개돼요.'
                : '비공개하면 다른 우주선을 구경할 수 없어요!'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                mockVisibility.set(Boolean(confirmPublic));
                setConfirmPublic(null);
              }}
              style={s.primary}
            >
              <Text style={s.primaryText}>{confirmPublic ? '공개하기' : '비공개로 전환하기'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmPublic(null)}
              style={s.cancel}
            >
              <Text style={s.text}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 18, gap: 8 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
  title: {
    textAlign: 'center',
    color: '#273a52',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  row: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  text: { color: '#273a52', fontSize: 12 },
  caption: { color: '#7b8795', fontSize: 10, marginTop: 3 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(27,39,56,0.47)',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { backgroundColor: '#fff', borderRadius: 8, padding: 17, gap: 12 },
  dialogTitle: { color: '#273a52', fontSize: 16, fontWeight: '700' },
  primary: {
    minHeight: 42,
    backgroundColor: '#273a52',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cancel: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
