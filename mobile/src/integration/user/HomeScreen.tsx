import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { RoomScene, type RoomSceneItem } from '../../components/house/RoomScene';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { HousingDetail, InventoryItem } from '../models';
import { UserScreen, UserStatus } from './Screen';

export default function HomeScreen() {
  const { generation } = useIntegration();
  return <Home key={generation} />;
}

function Home() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const { height: screenHeight } = useWindowDimensions();
  const [room, setRoom] = useState<HousingDetail | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [starBalance, setStarBalance] = useState<number | null>(null);
  const load = () =>
    task.run(async () => {
      const [housing, owned, wallet] = await Promise.all([
        api.room.me(),
        api.room.inventory(),
        api.benefits.wallet(),
      ]);
      setRoom(housing);
      setInventory(owned.items);
      setStarBalance(wallet.stardust);
      return housing;
    });
  useFocusEffect(
    useCallback(() => {
      if (session.ready && session.authenticated) void load();
    }, [session.ready, session.authenticated]),
  );
  const go = (path: string) => router.push(path as Href);
  const sceneItems: RoomSceneItem[] =
    room?.placements.map((placement) => {
      const owned = inventory.find((item) => item.inventoryId === placement.inventoryId);
      const option = (owned?.option ?? placement.option) as Record<string, unknown>;
      return {
        key: placement.inventoryId,
        name: owned?.name ?? '배치 아이템',
        x: placement.transform.x,
        y: placement.transform.y,
        layer: placement.transform.layer,
        color: typeof option.color === 'string' ? option.color : undefined,
      };
    }) ?? [];

  return (
    <UserScreen title="나의 우주선" scroll={false} showTitle={false}>
      <View style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>나의 우주선</Text>
          <View style={s.wallet}>
            <Text style={s.walletText}>✦ {starBalance ?? '—'}</Text>
          </View>
        </View>
        {!session.authenticated ? (
          <View style={s.login}>
            <Text style={s.loginTitle}>로그인하세요</Text>
            <Text style={s.loginText}>로그인하면 내 우주선을 볼 수 있습니다.</Text>
            <HomeAction title="로그인" onPress={() => go('/account')} primary />
          </View>
        ) : (
          <View style={s.middle}>
            <Pressable accessibilityRole="button" style={s.visit} onPress={() => go('/social')}>
              <Text style={s.visitText}>우주선 구경 ↗</Text>
            </Pressable>
            <View style={[s.sceneWrap, screenHeight < 750 && s.sceneWrapShort]}>
              <RoomScene items={sceneItems} />
            </View>
            <Text style={s.tip}>작은 취향을 모아 나만의 방으로</Text>
            <UserStatus task={task} />
            {task.error && !room ? (
              <Pressable accessibilityRole="button" onPress={() => void load()} style={s.retry}>
                <Text style={s.retryText}>다시 불러오기</Text>
              </Pressable>
            ) : null}
            <View style={s.actions}>
              <HomeAction title="상점" onPress={() => go('/room/shop')} />
              <HomeAction title="꾸미기" onPress={() => go('/room/inventory')} primary />
            </View>
          </View>
        )}
      </View>
    </UserScreen>
  );
}

function HomeAction({
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
      style={[s.action, primary ? s.primaryAction : s.secondaryAction]}
    >
      <Text style={[s.actionText, primary && s.primaryText]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: -18,
    marginTop: -12,
    backgroundColor: '#f8f6fc',
  },
  header: {
    paddingHorizontal: 21,
    paddingTop: 23,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#282636', fontSize: 23, fontWeight: '700' },
  wallet: {
    backgroundColor: '#f6f1e6',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  walletText: { color: '#8a7047', fontSize: 12, fontWeight: '600' },
  middle: { flex: 1, minHeight: 0 },
  visit: {
    alignSelf: 'flex-end',
    marginRight: 22,
    minHeight: 38,
    justifyContent: 'center',
    zIndex: 2,
  },
  visitText: { color: '#817790', fontSize: 13 },
  sceneWrap: { marginTop: 4, paddingHorizontal: 20 },
  sceneWrapShort: { width: 330, maxWidth: '100%', alignSelf: 'center' },
  tip: { color: '#aa9eb7', fontSize: 12, textAlign: 'center', marginTop: 20 },
  actions: { position: 'absolute', bottom: 25, left: 24, right: 24, flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryAction: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e0ee' },
  primaryAction: { backgroundColor: '#7d6d91' },
  actionText: { color: '#655b76', fontSize: 13, fontWeight: '600' },
  primaryText: { color: '#fff' },
  login: {
    margin: 24,
    padding: 22,
    borderRadius: 20,
    backgroundColor: '#fff',
    gap: 12,
    alignItems: 'center',
  },
  loginTitle: { color: '#282636', fontSize: 18, fontWeight: '700' },
  loginText: { color: '#888591', fontSize: 13 },
  retry: { alignSelf: 'center', padding: 10 },
  retryText: { color: '#655b76', fontSize: 12 },
});
