import { useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useIntegration } from '../hooks';
import { notificationBadge, useUnreadNotifications } from '../notificationBadge';

// 알림 아이콘 닷 색. 어두운 배경에서 보이도록 별가루와 같은 노랑을 쓴다(shipColor.yellow).
export const NOTIFICATION_DOT = '#ebc60f';

// 학습 탭·내 우주선·구경하기 헤더 오른쪽 알림 아이콘. 회원(ACTIVE)에게만 보인다.
// 화면에 들어올 때마다 API-201 로 닷 상태를 다시 읽는다. 숫자 배지는 쓰지 않는다.
export function NotificationBell() {
  const router = useRouter();
  const session = useIntegration();
  const hasUnread = useUnreadNotifications();
  const member = session.user?.status === 'ACTIVE';
  // 빠르게 두 번 눌러 알림함이 두 겹 열리지 않게 한다. 화면에 다시 들어오면 푼다.
  const opening = useRef(false);

  useFocusEffect(
    useCallback(() => {
      opening.current = false;
      if (member) void notificationBadge.refresh();
    }, [member]),
  );

  if (!member) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasUnread ? '알림함, 읽지 않은 알림 있음' : '알림함'}
      hitSlop={8}
      onPress={() => {
        if (opening.current) return;
        opening.current = true;
        router.push('/notifications');
      }}
      style={s.bell}
    >
      <Ionicons name="notifications-outline" size={24} color="#f1f1f1" />
      {hasUnread ? <View style={s.dot} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  // 헤더(높이 32)와 같은 높이로 맞춘다.
  bell: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: NOTIFICATION_DOT,
  },
});
