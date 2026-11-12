import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { RoomScene, type RoomSceneItem } from '../../components/house/RoomScene';
import { housingVisibility } from '../housingVisibility';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { HousingDetail, InventoryItem } from '../models';
import { UserStatus } from './Screen';
import {
  shipColor as color,
  StardustCount,
  useVisibilityControl,
  VisibilityBadge,
} from './ShipStatus';

// Figma D01_1 내 우주선 (547:2756)
export default function HomeScreen() {
  const { generation } = useIntegration();
  return <Home key={generation} />;
}

function Home() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [room, setRoom] = useState<HousingDetail | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [starBalance, setStarBalance] = useState<number | null>(null);
  const openBrowse = () => router.push({ pathname: '/social', params: { view: 'browse' } });
  const visibility = useVisibilityControl(openBrowse);

  const load = () =>
    task.run(async () => {
      const [housing, owned, wallet] = await Promise.all([
        api.room.me(),
        api.room.inventory(),
        api.benefits.wallet(),
      ]);
      setRoom(housing);
      housingVisibility.set(housing.housing.isPublic);
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

  const pressBrowse = () => {
    // 비회원은 구경하기 화면의 기존 로그인 안내를 그대로 따른다.
    if (!visibility.member) go('/social');
    else visibility.requestBrowse();
  };

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
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.page}>
        <View style={s.top}>
          <View style={s.header} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: true }}
              style={s.headerTab}
            >
              <Text style={s.headerSelected}>내 우주선</Text>
            </Pressable>
            <HeaderStar />
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: false }}
              onPress={pressBrowse}
              style={s.headerTab}
            >
              <Text style={s.headerDefault}>구경하기</Text>
            </Pressable>
          </View>

          <View style={s.headerGap} />

          {!session.authenticated ? (
            <View style={s.login}>
              <Text style={s.loginText}>로그인하면 내 우주선을 볼 수 있습니다.</Text>
              <HomeAction title="로그인" onPress={() => go('/account')} />
            </View>
          ) : (
            <View style={s.ship}>
              <View style={s.shipColumn}>
                <View style={s.shipBar}>
                  <StardustCount value={starBalance} />
                  <VisibilityBadge
                    isPublic={visibility.isPublic}
                    disabled={visibility.badgeDisabled}
                    onPress={visibility.pressBadge}
                  />
                </View>
                <View style={s.roomBox}>
                  <View style={s.sceneFit}>
                    <RoomScene items={sceneItems} />
                  </View>
                </View>
                <View style={s.status}>
                  <UserStatus task={task} />
                  {task.error && !room ? (
                    <Pressable accessibilityRole="button" onPress={() => void load()} hitSlop={8}>
                      <Text style={s.retryText}>다시 불러오기</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          )}
        </View>

        {session.authenticated ? (
          <View style={s.actions}>
            <HomeAction title="상점" onPress={() => go('/room/shop')} />
            <HomeAction title="꾸미기" onPress={() => go('/room/inventory')} dark />
          </View>
        ) : null}
      </View>
      {visibility.modals}
    </SafeAreaView>
  );
}

function HomeAction({
  title,
  onPress,
  dark = false,
}: {
  title: string;
  onPress: () => void;
  dark?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.action, dark ? s.actionDark : s.actionLight]}
    >
      <Text style={[s.actionText, dark && s.actionTextDark]}>{title}</Text>
    </Pressable>
  );
}

// Figma 656:1705 'Star 1' (8×8 칸, 원본 6.9282×8, #F1F1F1)
function HeaderStar() {
  return (
    <View style={s.headerStar}>
      <Svg width={6.9282} height={8} viewBox="0 0 6.9282 8" fill="none">
        <Path
          d="M3.4641 0L4.22803 2.67683L6.9282 2L4.99197 4L6.9282 6L4.22803 5.32317L3.4641 8L2.70017 5.32317L0 6L1.93624 4L0 2L2.70017 2.67683L3.4641 0Z"
          fill={color.fale}
        />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.base },
  // 위 묶음(헤더·우주선)과 아래 버튼을 양 끝에 붙인다. 버튼과 하단 내비게이션 사이 32.
  page: { flex: 1, minHeight: 0, paddingTop: 32, justifyContent: 'space-between' },
  top: { flexShrink: 1, minHeight: 0 },
  header: {
    height: 32,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTab: { height: 32, justifyContent: 'center' },
  // Figma는 Pretendard ExtraBold. 앱에 ExtraBold 폰트 파일이 없어 Bold로 대체한다.
  headerSelected: {
    color: color.fale,
    fontFamily: 'PretendardBold',
    fontSize: 24,
    includeFontPadding: false,
  },
  headerDefault: {
    color: color.lght,
    fontFamily: 'PretendardBold',
    fontSize: 23,
    includeFontPadding: false,
  },
  headerStar: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  // Figma 헤더와 우주선 묶음 사이 120. 화면이 짧으면 줄어든다.
  headerGap: { height: 120, flexShrink: 1, minHeight: 16 },
  ship: { paddingHorizontal: 40, alignItems: 'center' },
  shipColumn: { width: '100%', maxWidth: 312, gap: 12 },
  shipBar: {
    height: 24,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomBox: {
    width: '100%',
    aspectRatio: 312 / 300,
    backgroundColor: color.mist,
    borderWidth: 1,
    borderColor: color.lght,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // RoomScene 고유 비율(330:342)을 유지한 채 상자 높이에 맞춘다.
  sceneFit: { height: '100%', aspectRatio: 330 / 342 },
  status: { position: 'absolute', top: '100%', left: 0, right: 0, alignItems: 'center', gap: 4 },
  retryText: { color: color.fale, fontFamily: 'PretendardRegular', fontSize: 12, marginTop: 8 },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 40,
    marginTop: 16,
    marginBottom: 32,
  },
  action: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLight: { backgroundColor: color.fale, borderColor: color.base },
  actionDark: { backgroundColor: color.base, borderColor: color.fale },
  actionText: { color: color.base, fontFamily: 'PretendardRegular', fontSize: 16 },
  actionTextDark: { color: color.fale },
  login: { paddingHorizontal: 40, gap: 16, alignItems: 'center' },
  loginText: { color: color.fale, fontFamily: 'PretendardRegular', fontSize: 14 },
});
