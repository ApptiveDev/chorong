import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TopDownRoom } from '../../components/house/TopDownRoom';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { HousingDetail } from '../models';
import { UserScreen, UserStatus } from './Screen';

export default function HomeScreen() {
  const { generation } = useIntegration();
  return <Home key={generation} />;
}
function Home() {
  const router = useRouter(),
    session = useIntegration(),
    task = useTask();
  const [open, setOpen] = useState(false),
    [room, setRoom] = useState<HousingDetail | null>(null),
    [itemNames, setItemNames] = useState<Record<string, string>>({});
  const load = () =>
    task.run(async () => {
      const value = await api.room.me();
      setRoom(value);
      try {
        const owned = await api.room.inventory();
        setItemNames(Object.fromEntries(owned.items.map((item) => [item.inventoryId, item.name])));
      } catch {
        setItemNames({});
      }
      return value;
    });
  useFocusEffect(
    useCallback(() => {
      if (session.ready && session.authenticated) void load();
    }, [session.ready, session.authenticated]),
  );
  const go = (path: string) => {
    setOpen(false);
    router.push(path as Href);
  };
  return (
    <UserScreen title="나의 우주선">
      {!session.authenticated ? (
        <View style={roomStyles.loginCard}>
          <View style={roomStyles.loginIcon}>
            <Ionicons name="lock-closed-outline" size={28} color="#607992" />
          </View>
          <Text style={roomStyles.loginTitle}>로그인하세요</Text>
          <Text style={roomStyles.loginCaption}>로그인하면 내 우주선을 볼 수 있습니다.</Text>
          <RoomAction title="로그인" onPress={() => go('/account')} primary />
        </View>
      ) : (
        <>
          <View style={roomStyles.card}>
            <View
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                zIndex: 2,
                gap: 7,
                alignItems: 'flex-end',
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={open ? '메뉴 닫기' : '메뉴 열기'}
                accessibilityState={{ expanded: open }}
                onPress={() => setOpen((value) => !value)}
                style={roomStyles.addButton}
              >
                <Ionicons name={open ? 'close' : 'add'} size={24} color="#fff" />
              </Pressable>
              {open ? (
                <View style={roomStyles.menu}>
                  <RoomAction title="꾸미기" onPress={() => go('/room/inventory')} />
                  <RoomAction title="상점" onPress={() => go('/room/shop')} />
                  <RoomAction title="우주 탐험" onPress={() => go('/social')} />
                </View>
              ) : null}
            </View>
            <View style={roomStyles.roomFrame}>
              <TopDownRoom placements={room?.placements ?? []} itemNames={itemNames} />
            </View>
            <Text style={roomStyles.roomName}>{room?.housing.name ?? '내 우주'}</Text>
            <Text style={roomStyles.roomMeta}>
              {room ? `좋아요 ${room.housing.likeCount}개` : '하우징 연동 대기'}
            </Text>
          </View>
          <UserStatus task={task} />
          <View style={roomStyles.actionCard}>
            <Text style={roomStyles.actionTitle}>시작하기</Text>
            <RoomAction title="학습하기" onPress={() => go('/quiz')} primary />
            <RoomAction title="복습하기" onPress={() => go('/review')} />
          </View>
        </>
      )}
    </UserScreen>
  );
}

function RoomAction({
  title,
  onPress,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[roomStyles.actionButton, primary && roomStyles.primaryAction]}
    >
      <Text style={[roomStyles.actionLabel, primary && roomStyles.primaryActionLabel]}>
        {title}
      </Text>
    </Pressable>
  );
}

const roomStyles = StyleSheet.create({
  loginCard: {
    borderWidth: 1,
    borderColor: '#d7dfe6',
    borderRadius: 8,
    backgroundColor: '#fff',
    padding: 20,
    gap: 10,
    alignItems: 'center',
  },
  loginIcon: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#eef2f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginTitle: { color: '#273a52', fontSize: 16, fontWeight: '700' },
  loginCaption: { color: '#7b8795', fontSize: 12, textAlign: 'center', marginBottom: 5 },
  card: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 6,
    padding: 12,
    gap: 7,
    backgroundColor: '#f8f9fb',
  },
  addButton: { backgroundColor: '#273a52', padding: 9, borderRadius: 24 },
  roomFrame: { paddingTop: 18, alignItems: 'center', justifyContent: 'center' },
  roomName: { color: '#273a52', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  roomMeta: { color: '#7b8795', fontSize: 12, textAlign: 'center' },
  menu: {
    backgroundColor: '#fff',
    borderColor: '#d7dfe6',
    borderWidth: 1,
    borderRadius: 8,
    padding: 5,
    gap: 5,
    minWidth: 100,
  },
  actionCard: {
    borderWidth: 1,
    borderColor: '#d7dfe6',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    backgroundColor: '#fff',
  },
  actionTitle: { color: '#273a52', fontSize: 14, fontWeight: '700' },
  actionButton: {
    alignSelf: 'stretch',
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d7dfe6',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: { backgroundColor: '#273a52', borderColor: '#273a52' },
  actionLabel: { color: '#536578', fontSize: 12, fontWeight: '600' },
  primaryActionLabel: { color: '#fff', fontWeight: '700' },
});
