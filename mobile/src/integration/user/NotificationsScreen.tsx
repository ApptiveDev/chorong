import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlSettingsScreen, figma } from '../../components/settings/ControlSettingsUI';
import { IntegrationError } from '../client';
import { useIntegration } from '../hooks';
import type { Notification } from '../models';
import { notificationBadge } from '../notificationBadge';
import { integrationApi as api } from '../runtime';
import { NOTIFICATION_DOT } from './NotificationBell';
import {
  formatNotificationTime,
  notificationMessage,
  notificationTarget,
} from './notificationTarget';

// 다른 커서 목록(차단 목록·구경하기)과 같은 한 페이지 크기.
const PAGE_SIZE = 20;

// 알림함(API-303). 학습 탭·내 우주선·구경하기의 알림 아이콘이 모두 이 화면을 연다.
export default function NotificationsScreen() {
  const { generation } = useIntegration();
  return <Inbox key={generation} />;
}

// 불러온 목록으로 알 수 있는 닷 상태. 읽지 않은 항목이 있으면 true, 끝까지 불러왔는데 없으면 false.
// 아직 안 불러온 페이지가 있으면 알 수 없다(undefined).
function knownUnread(items: Notification[], cursor: string | null): boolean | undefined {
  if (items.some((item) => !item.read)) return true;
  return cursor === null ? false : undefined;
}

function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : '요청 실패';
  return text.replace(/^[A-Z_]+:\s*/, '').replace(/\s*\(HTTP \d+\)$/, '');
}

function Inbox() {
  const router = useRouter();
  const session = useIntegration();
  const member = session.ready && session.user?.status === 'ACTIVE';
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 비동기 결과가 최신 목록을 기준으로 계산되도록 상태와 같은 값을 ref 에도 둔다.
  const list = useRef<{ items: Notification[]; cursor: string | null }>({
    items: [],
    cursor: null,
  });
  const loading = useRef(false);
  // 같은(또는 다른) 알림을 빠르게 여러 번 눌러 읽음 요청·화면 이동이 겹치지 않게 한다.
  const opening = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = (nextItems: Notification[], nextCursor: string | null) => {
    list.current = { items: nextItems, cursor: nextCursor };
    setItems(nextItems);
    setCursor(nextCursor);
    const known = knownUnread(nextItems, nextCursor);
    if (known !== undefined) notificationBadge.set(known);
  };

  // 서버가 회원 전용(403 MEMBER_ONLY)으로 거절하면 사용자 상태를 다시 읽어 아이콘·화면을 맞춘다.
  const followMemberOnly = (error: unknown) => {
    if (error instanceof IntegrationError && error.code === 'MEMBER_ONLY' && error.status === 403)
      void api.account.me().catch(() => {});
  };

  const loadFirst = async () => {
    if (loading.current) return;
    loading.current = true;
    setStatus('loading');
    setLoadError(null);
    setMore('idle');
    try {
      const page = await api.notifications.list({ size: PAGE_SIZE });
      if (!mounted.current) return;
      apply(page.data.notifications, page.meta.nextCursor);
      setStatus('ready');
    } catch (error) {
      if (!mounted.current) return;
      setLoadError(errorMessage(error));
      setStatus('error');
      followMemberOnly(error);
    } finally {
      loading.current = false;
    }
  };

  const loadMore = async () => {
    const { items: current, cursor: next } = list.current;
    if (!next || loading.current || status !== 'ready') return;
    loading.current = true;
    setMore('loading');
    try {
      const page = await api.notifications.list({ size: PAGE_SIZE, cursor: next });
      if (!mounted.current) return;
      const seen = new Set(current.map((item) => item.notificationId));
      apply(
        [...current, ...page.data.notifications.filter((item) => !seen.has(item.notificationId))],
        page.meta.nextCursor,
      );
      setMore('idle');
    } catch (error) {
      if (!mounted.current) return;
      setMore('error');
      followMemberOnly(error);
    } finally {
      loading.current = false;
    }
  };

  useEffect(() => {
    if (member) void loadFirst();
  }, [member]);

  // 목적지로 간 뒤 이 화면이 남아 있다가 다시 보이면 누름 잠금을 푼다.
  useFocusEffect(
    useCallback(() => {
      opening.current = false;
      setPendingId(null);
    }, []),
  );

  // 항목을 누를 때만 읽음 처리한다(API-304). 성공해야 닷을 지우고 목적지로 간다.
  // 이미 읽은 항목은 서버 상태가 확정돼 있어 요청 없이 바로 이동한다.
  const press = async (item: Notification) => {
    if (opening.current) return;
    opening.current = true;
    setPendingId(item.notificationId);
    setNotice(null);
    try {
      if (!item.read) {
        await api.notifications.read(item.notificationId);
        if (!mounted.current) return;
        const { items: current, cursor: next } = list.current;
        apply(
          current.map((entry) =>
            entry.notificationId === item.notificationId ? { ...entry, read: true } : entry,
          ),
          next,
        );
        // 아직 안 불러온 페이지의 읽지 않은 알림까지 서버(API-201) 기준으로 다시 맞춘다.
        void notificationBadge.refresh();
      }
      router.dismissTo(notificationTarget(item));
    } catch (error) {
      if (!mounted.current) return;
      opening.current = false;
      setPendingId(null);
      followMemberOnly(error);
      if (error instanceof IntegrationError && error.code === 'NOT_FOUND') {
        // 30일이 지났거나 보낸 사람을 차단해 목록에서 빠진 알림이다.
        const { items: current, cursor: next } = list.current;
        apply(
          current.filter((entry) => entry.notificationId !== item.notificationId),
          next,
        );
        void notificationBadge.refresh();
        setNotice('볼 수 없는 알림입니다.');
      } else setNotice(`읽음 처리 실패: ${errorMessage(error)}`);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  let body;
  if (!session.ready) body = null;
  else if (!member) body = <Text style={s.muted}>회원만 알림함을 볼 수 있습니다.</Text>;
  else if (status === 'loading' && !items.length)
    body = (
      <View style={s.state}>
        <ActivityIndicator color={figma.fale} accessibilityLabel="알림을 불러오는 중" />
      </View>
    );
  else if (status === 'error')
    body = (
      <View style={s.state}>
        <Text style={s.muted}>{loadError ?? '알림을 불러오지 못했습니다.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => void loadFirst()} hitSlop={8}>
          <Text style={s.retry}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  else if (!items.length)
    body = (
      <View style={s.state}>
        <Text style={s.muted}>아직 받은 알림이 없어요.</Text>
      </View>
    );
  else
    body = (
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.notificationId)}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            pending={pendingId === item.notificationId}
            onPress={() => void press(item)}
          />
        )}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
        ListFooterComponent={
          more === 'loading' ? (
            <ActivityIndicator
              style={s.footer}
              color={figma.fale}
              accessibilityLabel="알림을 더 불러오는 중"
            />
          ) : more === 'error' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMore()}
              hitSlop={8}
              style={s.footer}
            >
              <Text style={s.retry}>다시 불러오기</Text>
            </Pressable>
          ) : undefined
        }
      />
    );

  return (
    <ControlSettingsScreen title="알림함" onBack={back}>
      {notice ? (
        <Text accessibilityRole="alert" style={s.notice}>
          {notice}
        </Text>
      ) : null}
      {body}
    </ControlSettingsScreen>
  );
}

function NotificationRow({
  item,
  pending,
  onPress,
}: {
  item: Notification;
  pending: boolean;
  onPress: () => void;
}) {
  const message = notificationMessage(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.read ? message : `읽지 않음. ${message}`}
      accessibilityState={{ busy: pending }}
      onPress={onPress}
      style={({ pressed }) => [s.row, (pressed || pending) && s.rowPressed]}
    >
      <View style={s.dotSlot}>{item.read ? null : <View style={s.dot} />}</View>
      <View style={s.texts}>
        <Text style={s.message}>{message}</Text>
        <Text style={s.time}>{formatNotificationTime(item.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  list: { paddingBottom: 40 },
  state: { paddingTop: 40, alignItems: 'center', gap: 12 },
  muted: { color: figma.lght, fontFamily: 'PretendardRegular', fontSize: 14, textAlign: 'center' },
  retry: { color: figma.fale, fontFamily: 'PretendardMedium', fontSize: 14 },
  notice: {
    marginBottom: 12,
    color: '#f92669',
    fontFamily: 'PretendardRegular',
    fontSize: 14,
  },
  footer: { paddingVertical: 16, alignItems: 'center' },
  // 항목: 위아래 16, 아래 구분선. 닷 칸은 읽음 여부와 상관없이 자리를 잡아 글자 위치가 바뀌지 않게 한다.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#424242',
  },
  rowPressed: { opacity: 0.6 },
  dotSlot: { width: 6, height: 20, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: NOTIFICATION_DOT },
  texts: { flex: 1, gap: 6 },
  message: { color: figma.fale, fontFamily: 'PretendardRegular', fontSize: 14, lineHeight: 20 },
  time: { color: figma.lght, fontFamily: 'PretendardRegular', fontSize: 12 },
});
