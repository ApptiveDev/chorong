import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIntegration, useTask } from '../../src/integration/hooks';
import type { Me } from '../../src/integration/models';
import { integrationApi as api } from '../../src/integration/runtime';
import { UserStatus } from '../../src/integration/user/Screen';
import { ControlSwitch } from '../../src/integration/user/ControlSwitch';

export default function NotificationsSettings() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (session.ready && session.user?.status === 'ACTIVE')
      void task.run(async () => setMe(await api.account.me()));
  }, [session.ready, session.user?.status]);
  const toggle = () => {
    if (!me) return;
    void task.run(async () => setMe(await api.account.update({ pushEnabled: !me.pushEnabled })));
  };
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
          <Text style={s.title}>알림</Text>
        </View>
        <UserStatus task={task} />
        {session.user?.status === 'ACTIVE' ? (
          <View style={s.group}>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="알림 받기"
              accessibilityState={{ checked: me?.pushEnabled ?? false, disabled: !me || task.busy }}
              disabled={!me || task.busy}
              onPress={toggle}
              style={s.row}
            >
              <View style={s.copy}>
                <Text style={s.label}>알림 받기</Text>
                <Text style={s.caption}>잠시 쉬었던 탐험을 다시 떠올려 드려요.</Text>
              </View>
              <ControlSwitch value={me?.pushEnabled ?? false} />
            </Pressable>
          </View>
        ) : (
          <Text style={s.caption}>로그인하면 알림을 설정할 수 있습니다.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  back: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#282636', fontSize: 21, fontWeight: '700' },
  group: {
    borderWidth: 1,
    borderColor: '#eeeaf3',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 3,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: { flex: 1, gap: 5 },
  label: { color: '#282636', fontSize: 14 },
  caption: { color: '#aaa3b1', fontSize: 12, lineHeight: 19 },
});
