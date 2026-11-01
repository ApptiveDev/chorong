import { useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { HouseCanvas } from '../../components/house/HouseCanvas';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { HousingDetail } from '../models';
import { Button, Card, styles } from '../ui';
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
    [room, setRoom] = useState<HousingDetail | null>(null);
  const load = () =>
    task.run(async () => {
      const value = await api.room.me();
      setRoom(value);
      return value;
    });
  useEffect(() => {
    if (session.ready && session.authenticated) void load();
  }, [session.ready, session.authenticated]);
  const go = (path: string) => {
    setOpen(false);
    router.push(path as Href);
  };
  return (
    <UserScreen title="내 우주">
      <View style={[styles.card, { minHeight: 340, justifyContent: 'center' }]}>
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
            style={{ backgroundColor: '#1e40af', padding: 9, borderRadius: 24 }}
          >
            <Ionicons name={open ? 'close' : 'add'} size={24} color="#fff" />
          </Pressable>
          {open ? (
            <>
              <Button title="인벤토리" onPress={() => go('/room/inventory')} />
              <Button title="상점" onPress={() => go('/room/shop')} />
              <Button title="우주 탐험" onPress={() => go('/social')} />
            </>
          ) : null}
        </View>
        <View style={{ minHeight: 240, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '72%', maxWidth: 420 }}>
            <HouseCanvas layout={null} catalog={null} style={{ width: '100%' }} />
            <View style={{ position: 'absolute', inset: 8, pointerEvents: 'none' }}>
              {room?.placements.map((placement) => (
                <Text
                  key={placement.placementId}
                  style={{
                    position: 'absolute',
                    left: `${Math.min(95, placement.transform.x * 100)}%`,
                    top: `${Math.min(90, placement.transform.y * 100)}%`,
                    backgroundColor: '#dbeafe',
                    color: '#111827',
                    padding: 3,
                  }}
                  numberOfLines={1}
                >
                  아이템 {placement.itemId}
                </Text>
              ))}
            </View>
          </View>
        </View>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>
          {room?.housing.name ?? '내 우주'}
        </Text>
        <Text style={[styles.text, { textAlign: 'center' }]}>
          {room ? `좋아요 ${room.housing.likeCount}개` : '하우징 연동 대기'}
        </Text>
      </View>
      <UserStatus task={task} />
      {session.authenticated ? (
        <Button title="내 우주 새로고침" disabled={task.busy} onPress={() => void load()} />
      ) : (
        <>
          <Button title="로그인하기" onPress={() => go('/account')} />
          <Button title="로그인 없이 UI 미리보기" onPress={() => go('/preview')} />
        </>
      )}
      <Card title="시작하기">
        <Button title="학습하기" onPress={() => go('/quiz')} />
        <Button title="복습하기" onPress={() => go('/review')} />
        <Button title="온보딩" onPress={() => go('/onboarding')} />
      </Card>
    </UserScreen>
  );
}
