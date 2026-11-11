import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import {
  ControlSettingRow,
  ControlSettingsScreen,
} from '../../src/components/settings/ControlSettingsUI';
import { useIntegration, useTask } from '../../src/integration/hooks';
import type { Me } from '../../src/integration/models';
import { integrationApi as api } from '../../src/integration/runtime';

// Figma S06_1 · 알림 (656:2945)
export default function NotificationsSettings() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [me, setMe] = useState<Me | null>(null);
  const member = session.ready && session.user?.status === 'ACTIVE';

  useEffect(() => {
    if (member) void task.run(async () => setMe(await api.account.me()));
  }, [member]);

  const toggle = () => {
    if (!me || task.busy) return;
    void task.run(async () => setMe(await api.account.update({ pushEnabled: !me.pushEnabled })));
  };

  return (
    <ControlSettingsScreen title="알림" onBack={() => router.back()}>
      <ControlSettingRow
        label="학습 알림 받기"
        value={me?.pushEnabled ?? false}
        disabled={!me || task.busy}
        onPress={toggle}
      />
      {session.ready && !member ? (
        <Text style={s.notice}>로그인하면 학습 알림을 설정할 수 있습니다.</Text>
      ) : null}
      {task.error ? <Text style={s.error}>{task.error}</Text> : null}
    </ControlSettingsScreen>
  );
}

const s = StyleSheet.create({
  notice: { marginTop: 16, color: '#747474', fontFamily: 'PretendardRegular', fontSize: 14 },
  error: { marginTop: 16, color: '#b00030', fontFamily: 'PretendardRegular', fontSize: 14 },
});
