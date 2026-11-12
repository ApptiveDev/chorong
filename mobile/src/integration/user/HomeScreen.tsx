import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { RoomScene, type RoomSceneItem } from '../../components/house/RoomScene';
import { housingVisibility, useHousingVisibility } from '../housingVisibility';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { HousingDetail, InventoryItem } from '../models';
import { UserStatus } from './Screen';
import { PrivateConfirmModal, PublicConfirmModal } from './VisibilityConfirmModals';

// Figma D01_1 내 우주선 (547:2756)
const color = {
  base: '#161616',
  fale: '#f1f1f1',
  lght: '#aaaaaa',
  yellow: '#ebc60f',
  room: '#d9d9d9',
  pressedText: '#8c8c8c',
  offBackground: '#424242',
};

type VisibilityDialog = {
  kind: 'public' | 'private';
  // 헤더 '구경하기'에서 열었으면 공개 성공 뒤 구경하기 화면으로 이동한다.
  thenBrowse: boolean;
  requested: boolean;
};

export default function HomeScreen() {
  const { generation } = useIntegration();
  return <Home key={generation} />;
}

function Home() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const visibilityTask = useTask();
  const isPublic = useHousingVisibility();
  const [room, setRoom] = useState<HousingDetail | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [starBalance, setStarBalance] = useState<number | null>(null);
  const [dialog, setDialog] = useState<VisibilityDialog | null>(null);
  const member = session.user?.status === 'ACTIVE';

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
  const openBrowse = () => router.push({ pathname: '/social', params: { view: 'browse' } });

  const pressBrowse = () => {
    // 비회원은 구경하기 화면의 기존 로그인 안내를 그대로 따른다.
    if (!member) {
      go('/social');
      return;
    }
    if (isPublic === null || visibilityTask.busy) return;
    if (isPublic) openBrowse();
    else setDialog({ kind: 'public', thenBrowse: true, requested: false });
  };

  const pressVisibility = () => {
    if (!member || isPublic === null || visibilityTask.busy) return;
    setDialog({ kind: isPublic ? 'private' : 'public', thenBrowse: false, requested: false });
  };

  const closeDialog = () => {
    if (visibilityTask.busy) return;
    setDialog(null);
  };

  const confirmDialog = () => {
    if (!dialog || visibilityTask.busy) return;
    const { kind, thenBrowse } = dialog;
    setDialog({ ...dialog, requested: true });
    void visibilityTask.run(
      () => housingVisibility.update(kind === 'public'),
      () => {
        setDialog(null);
        if (thenBrowse && kind === 'public') openBrowse();
      },
    );
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

  const visibilityKnown = isPublic !== null;
  const visibilityDisabled = !member || !visibilityKnown || visibilityTask.busy;
  const dialogError = dialog?.requested ? visibilityTask.error : null;

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
                  <View
                    style={s.stardust}
                    accessible
                    accessibilityLabel={`별가루 ${starBalance ?? '정보 없음'}`}
                  >
                    <StardustStar />
                    <Text style={s.stardustText}>x {starBalance ?? '—'}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`내 우주선 공개 상태: ${
                      visibilityKnown ? (isPublic ? '공개' : '비공개') : '확인 중'
                    }`}
                    accessibilityState={{ disabled: visibilityDisabled }}
                    disabled={visibilityDisabled}
                    onPress={pressVisibility}
                    style={({ pressed }) => [
                      s.visibility,
                      isPublic ? s.visibilityOn : s.visibilityOff,
                      pressed && isPublic && s.visibilityPressed,
                    ]}
                  >
                    {({ pressed }) => (
                      <Text
                        style={[
                          s.visibilityText,
                          !isPublic && s.visibilityTextOff,
                          pressed && isPublic && s.visibilityTextPressed,
                        ]}
                      >
                        내 우주선 공개 상태
                      </Text>
                    )}
                  </Pressable>
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

      <PublicConfirmModal
        visible={dialog?.kind === 'public'}
        error={dialogError}
        busy={visibilityTask.busy}
        onCancel={closeDialog}
        onConfirm={confirmDialog}
      />
      <PrivateConfirmModal
        visible={dialog?.kind === 'private'}
        error={dialogError}
        busy={visibilityTask.busy}
        onCancel={closeDialog}
        onConfirm={confirmDialog}
      />
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

// Figma 547:2766 'Star 1' (16×16 칸, 원본 13.8564×16, #EBC60F)
function StardustStar() {
  return (
    <View style={s.stardustStar}>
      <Svg width={13.8564} height={16} viewBox="0 0 13.8564 16" fill="none">
        <Path
          d="M6.9282 0L8.45607 5.35366L13.8564 4L9.98393 8L13.8564 12L8.45607 10.6463L6.9282 16L5.40034 10.6463L0 12L3.87248 8L0 4L5.40034 5.35366L6.9282 0Z"
          fill={color.yellow}
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
  stardust: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stardustStar: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  stardustText: {
    color: color.yellow,
    fontFamily: 'PretendardMedium',
    fontSize: 16,
    includeFontPadding: false,
  },
  // Figma 656:3852 Frame 162: Default(공개) · pressed(누름) · diasbled(비공개)
  visibility: {
    height: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityOn: { backgroundColor: color.base, boxShadow: '0px 0px 4px 0px #f1f1f1' },
  visibilityPressed: { boxShadow: '0px 0px 2px 0px #f1f1f1' },
  visibilityOff: {
    backgroundColor: color.offBackground,
    borderWidth: 1,
    borderColor: color.lght,
  },
  visibilityText: {
    color: color.fale,
    fontFamily: 'PretendardSemiBold',
    fontSize: 10,
    includeFontPadding: false,
  },
  visibilityTextPressed: { color: color.pressedText },
  visibilityTextOff: { color: color.lght },
  roomBox: {
    width: '100%',
    aspectRatio: 312 / 300,
    backgroundColor: color.room,
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
