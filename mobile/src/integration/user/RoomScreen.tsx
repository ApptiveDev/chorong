import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FurnitureArt, RoomScene, type RoomSceneItem } from '../../components/house/RoomScene';
import { BackArrow } from '../../components/settings/ControlSettingsUI';
import { useIntegration, useTask } from '../hooks';
import type { HousingDetail, InventoryItem, PlacementInput, ShopItem } from '../models';
import { integrationApi as api, randomUuid } from '../runtime';
import { storage } from '../storage';
import { UserStatus } from './Screen';
import { IntegrationError } from '../client';
import {
  DiscardChangesModal,
  InsufficientStardustModal,
  PurchaseConfirmModal,
} from './HousingConfirmModals';
import {
  shipColor as color,
  StarIcon,
  StardustCount,
  useVisibilityControl,
  VisibilityBadge,
} from './ShipStatus';

// Figma D02_1 우주선 꾸미기 · 내 아이템 (547:2672) · D02_3 상점 · 목록 올림 (651:1070)
type CatalogTab = 'owned' | 'shop';
type Filter = 'ALL' | 'plant' | 'rug' | 'chair' | 'lamp' | 'desk' | 'shelf' | 'bed';
type ColorKey = (typeof colorChoices)[number]['key'];
type Wallet = { stardust: number };
type PendingItem = {
  key: string;
  itemId: number;
  optionId: number;
  name: string;
  itemType: ShopItem['itemType'];
  option: Record<string, unknown>;
  currency: 'STARDUST';
  price: number;
  transform: PlacementInput['transform'];
};
type OwnedGroup = {
  key: string;
  name: string;
  option: Record<string, unknown>;
  items: InventoryItem[];
  placed: number;
};

const optionColor = (value: Record<string, unknown>) =>
  typeof value.color === 'string' ? value.color : undefined;
// 카테고리는 API 필드가 없어 기존처럼 아이템 이름으로 구분한다(itemType 은 FURNITURE·OBJECT 뿐).
const furnitureKinds = [
  { key: 'plant', label: '화분', pattern: /화분|plant/i },
  { key: 'rug', label: '러그', pattern: /러그|rug/i },
  { key: 'chair', label: '의자', pattern: /의자|chair/i },
  { key: 'lamp', label: '조명', pattern: /조명|lamp/i },
  { key: 'desk', label: '책상', pattern: /책상|탁자|desk|table/i },
  { key: 'shelf', label: '책장', pattern: /책장|shelf/i },
  { key: 'bed', label: '침대', pattern: /침대|bed/i },
] as const;
const furnitureKind = (name: string) => furnitureKinds.find((kind) => kind.pattern.test(name))?.key;
// Figma 651:1079 색상 버튼 5개. 옵션 JSON 의 color 문자열(한글 목업 · 영문 서버 값)을 계열로 묶는다.
const colorChoices = [
  { key: 'pink', label: '분홍', hex: '#ff7289', pattern: /로즈|분홍|핑크|빨강|rose|pink|red/i },
  { key: 'yellow', label: '노랑', hex: '#fdf395', pattern: /노랑|크림|yellow|cream/i },
  { key: 'green', label: '초록', hex: '#95b781', pattern: /세이지|초록|green|sage/i },
  { key: 'blue', label: '파랑', hex: '#92a5e1', pattern: /블루|파랑|blue/i },
  { key: 'purple', label: '보라', hex: '#ccaed9', pattern: /라벤더|보라|purple|lavender/i },
] as const;
const colorMatches = (option: Record<string, unknown>, key: ColorKey) => {
  const value = optionColor(option);
  const choice = colorChoices.find((entry) => entry.key === key);
  return Boolean(value && choice?.pattern.test(value));
};
const nextTransform = (count: number): PlacementInput['transform'] => ({
  x: 0.36 + (count % 3) * 0.14,
  y: Math.min(0.86, 0.55 + Math.floor(count / 3) * 0.08),
  rotation: 0,
  layer: count + 1,
});

// 바텀시트 높이(Figma): 내 아이템 접힘 404 · 펼침 532, 상점은 색상 줄(28 + 간격 16)만큼 더 높다.
const SHEET_COLLAPSED = 404;
const SHEET_EXPANDED = 532;
const COLOR_ROW = 44;
const SHEET_PADDING_BOTTOM = 28;
const HEADER_BLOCK = 32 + 29; // 상단 32 + 헤더 29
const SHIP_TOP_GAP = 28;
const SHIP_BAR = 24 + 11;

export default function RoomScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const { generation } = useIntegration();
  return <Room key={`${mode}-${generation}`} initialTab={mode === 'shop' ? 'shop' : 'owned'} />;
}

function Room({ initialTab }: { initialTab: CatalogTab }) {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const visibility = useVisibilityControl();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [catalogTab, setCatalogTab] = useState<CatalogTab>(initialTab);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [colorFilter, setColorFilter] = useState<ColorKey | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [room, setRoom] = useState<HousingDetail | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [draft, setDraft] = useState<PlacementInput[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [layerMenu, setLayerMenu] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [shortfall, setShortfall] = useState(0);
  const [notice, setNotice] = useState('');
  const [showEditHint, setShowEditHint] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [purchaseRetryOnly, setPurchaseRetryOnly] = useState(false);
  const purchaseKey = useRef<string | null>(null);
  const leaveAllowed = useRef(false);
  const navigation = useNavigation();
  // 첫 배치 전에는 화면 높이로 추정해 상자 크기가 튀지 않게 한다.
  const [shipAreaHeight, setShipAreaHeight] = useState(screenHeight - insets.top - HEADER_BLOCK);

  // 화면이 짧으면 시트와 간격을 줄여 우주선이 가려지지 않게 한다.
  const shortScreen = screenHeight < 750;
  const sheetExtra = Math.max(SHEET_PADDING_BOTTOM, insets.bottom + 8) - SHEET_PADDING_BOTTOM;
  const sheetMax = Math.max(0, screenHeight - insets.top - HEADER_BLOCK - 8);
  const collapsedBase = Math.min(SHEET_COLLAPSED, Math.round(screenHeight * 0.47)) + sheetExtra;
  const colorExtra = catalogTab === 'shop' ? COLOR_ROW : 0;
  const collapsedHeight = Math.min(sheetMax, collapsedBase + colorExtra);
  const expandedHeight = Math.max(
    collapsedHeight,
    Math.min(sheetMax, SHEET_EXPANDED + sheetExtra + colorExtra),
  );
  const shipReserve = collapsedBase + (shortScreen ? 20 : 46);
  const shipAvailable = shipAreaHeight - SHIP_TOP_GAP - shipReserve - SHIP_BAR;
  const shipWidth = Math.max(
    160,
    Math.min(312, screenWidth - 90, Math.max(0, shipAvailable) * (312 / 300)),
  );

  const drawerHeight = useRef(new Animated.Value(collapsedHeight)).current;
  const dragStart = useRef(collapsedHeight);
  const sheetLimits = useRef({ collapsedHeight, expandedHeight });
  sheetLimits.current = { collapsedHeight, expandedHeight };
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const animateSheet = (toValue: number) =>
    Animated.spring(drawerHeight, {
      toValue,
      useNativeDriver: false,
      damping: 24,
      stiffness: 220,
      overshootClamping: true,
    }).start();
  const animateSheetRef = useRef(animateSheet);
  animateSheetRef.current = animateSheet;

  // 핸들·탭 줄에서만 세로 드래그를 받는다. 목록 스크롤과 우주선 아이템 드래그와 영역이 겹치지 않는다.
  const sheetPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        drawerHeight.stopAnimation((value) => {
          dragStart.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const { collapsedHeight: min, expandedHeight: max } = sheetLimits.current;
        drawerHeight.setValue(Math.min(max, Math.max(min, dragStart.current - gesture.dy)));
      },
      onPanResponderRelease: (_, gesture) => {
        const { collapsedHeight: min, expandedHeight: max } = sheetLimits.current;
        const height = Math.min(max, Math.max(min, dragStart.current - gesture.dy));
        const open = gesture.vy < -0.5 ? true : gesture.vy > 0.5 ? false : height > (min + max) / 2;
        setExpanded(open);
        animateSheetRef.current(open ? max : min);
      },
      onPanResponderTerminate: () => {
        const { collapsedHeight: min, expandedHeight: max } = sheetLimits.current;
        animateSheetRef.current(expandedRef.current ? max : min);
      },
    }),
  ).current;

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        if (await storage.get('room.editHintSeen')) return;
        await storage.set('room.editHintSeen', '1');
      } catch {
        // 안내 저장에 실패해도 편집 화면은 계속 사용한다.
      }
      if (!active) return;
      setShowEditHint(true);
      timeout = setTimeout(() => setShowEditHint(false), 2600);
    })();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    animateSheet(expanded ? expandedHeight : collapsedHeight);
  }, [expanded, expandedHeight, collapsedHeight]);

  const load = () =>
    task.run(async () => {
      const [housing, owned, balance, store] = await Promise.all([
        api.room.me(),
        api.room.inventory(),
        api.benefits.wallet(),
        api.room.shop(),
      ]);
      setRoom(housing);
      setInventory(owned.items);
      setWallet(balance);
      setShopItems(store.items);
      setDraft(
        housing.placements.map(({ inventoryId, area, transform }) => ({
          inventoryId,
          area,
          transform,
        })),
      );
      setLoaded(true);
      return housing;
    });
  useEffect(() => {
    if (session.ready) void load();
  }, [session.ready]);

  const placedIds = new Set(draft.map((item) => item.inventoryId));
  const selectedPending = pending.find((item) => item.key === selectedKey);
  const selectedShopItem = shopItems.find((item) => item.itemId === selectedPending?.itemId);
  const stardustOptions = (item: ShopItem) =>
    item.options.filter((option) => option.currency === 'STARDUST');
  // 색상 필터가 있으면 그 색 옵션을, 없으면 첫 별가루 옵션을 고른다.
  const shopChoice = (item: ShopItem) => {
    const options = stardustOptions(item);
    return (
      (colorFilter && options.find((option) => colorMatches(option.option, colorFilter))) ||
      options[0]
    );
  };
  const visibleOwned = inventory.filter(
    (item) => filter === 'ALL' || furnitureKind(item.name) === filter,
  );
  // 같은 아이템·옵션 사본을 한 칸으로 묶어 '배치 수/보유 수'로 보여준다.
  const ownedGroups = visibleOwned.reduce<OwnedGroup[]>((groups, item) => {
    const key = `${item.itemId}:${item.optionId}`;
    const group = groups.find((entry) => entry.key === key);
    const placed = placedIds.has(item.inventoryId) ? 1 : 0;
    if (group) {
      group.items.push(item);
      group.placed += placed;
    } else {
      groups.push({ key, name: item.name, option: item.option, items: [item], placed });
    }
    return groups;
  }, []);
  const visibleShop = shopItems.filter(
    (item) =>
      (filter === 'ALL' || furnitureKind(item.name) === filter) &&
      stardustOptions(item).some(
        (option) => !colorFilter || colorMatches(option.option, colorFilter),
      ),
  );
  const totalStardust = pending.reduce(
    (sum, item) => sum + (item.currency === 'STARDUST' ? item.price : 0),
    0,
  );
  const savedDraft =
    room?.placements.map(({ inventoryId, area, transform }) => ({
      inventoryId,
      area,
      transform,
    })) ?? [];
  const dirty = pending.length > 0 || JSON.stringify(draft) !== JSON.stringify(savedDraft);
  // 하드웨어·라우터 뒤로 가기도 같은 확인을 거친다. 저장 성공·변경 취소 뒤에는 그대로 보낸다.
  const guard = useRef({ dirty, busy: task.busy });
  guard.current = { dirty, busy: task.busy };
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (leaveAllowed.current) return;
        if (guard.current.busy) {
          event.preventDefault();
          return;
        }
        if (!guard.current.dirty) return;
        event.preventDefault();
        setExitOpen(true);
      }),
    [navigation],
  );
  const sceneItems: RoomSceneItem[] = [
    ...draft
      .filter((item) => item.area === 'INTERIOR')
      .map((item) => {
        const owned = inventory.find((candidate) => candidate.inventoryId === item.inventoryId);
        return {
          key: item.inventoryId,
          name: owned?.name ?? '배치 아이템',
          x: item.transform.x,
          y: item.transform.y,
          layer: item.transform.layer,
          color: optionColor((owned?.option ?? {}) as Record<string, unknown>),
        };
      }),
    ...pending.map((item) => ({
      key: item.key,
      name: item.name,
      x: item.transform.x,
      y: item.transform.y,
      layer: item.transform.layer,
      color: optionColor(item.option),
      pending: true,
    })),
  ];

  const addOwned = (item: InventoryItem) => {
    if (placedIds.has(item.inventoryId)) return;
    setDraft((items) => [
      ...items,
      {
        inventoryId: item.inventoryId,
        area: 'INTERIOR',
        transform: nextTransform(items.length + pending.length),
      },
    ]);
    setSelectedKey(item.inventoryId);
    setLayerMenu(false);
    setExpanded(false);
    setNotice('');
  };
  const addShop = (item: ShopItem) => {
    if (purchaseRetryOnly || task.busy) return;
    if (!item.unlocked || !item.options.length) return;
    const choice = shopChoice(item);
    if (!choice) return;
    const alreadyPending = pending.find((entry) => entry.optionId === choice.optionId);
    if (alreadyPending) {
      setSelectedKey(alreadyPending.key);
      setExpanded(false);
      return;
    }
    const available = inventory.find(
      (owned) =>
        owned.itemId === item.itemId &&
        owned.optionId === choice.optionId &&
        !placedIds.has(owned.inventoryId),
    );
    if (available) {
      addOwned(available);
      return;
    }
    // 서버는 이미 가진 옵션의 재구매를 ALREADY_OWNED 로 거절한다. 구매 예정에 넣지 않는다.
    if (choice.owned || inventory.some((owned) => owned.optionId === choice.optionId)) {
      setNotice('이미 보유한 아이템이에요. 내 아이템에서 배치하세요.');
      return;
    }
    const key = `pending-${randomUuid()}`;
    setPending((items) => [
      ...items,
      {
        key,
        itemId: item.itemId,
        optionId: choice.optionId,
        name: item.name,
        itemType: item.itemType,
        option: choice.option,
        currency: choice.currency,
        price: choice.price,
        transform: nextTransform(draft.length + items.length),
      },
    ]);
    setSelectedKey(key);
    setLayerMenu(false);
    setExpanded(false);
    setNotice('');
  };
  const moveItem = (key: string, x: number, y: number) => {
    setDraft((items) =>
      items.map((item) =>
        item.inventoryId === key ? { ...item, transform: { ...item.transform, x, y } } : item,
      ),
    );
    setPending((items) =>
      items.map((item) =>
        item.key === key ? { ...item, transform: { ...item.transform, x, y } } : item,
      ),
    );
  };
  const removeSelected = () => {
    if (purchaseRetryOnly && selectedPending) {
      setNotice('구매 결과를 확인하려면 저장을 다시 눌러주세요.');
      return;
    }
    setDraft((items) => items.filter((item) => item.inventoryId !== selectedKey));
    setPending((items) => items.filter((item) => item.key !== selectedKey));
    setSelectedKey(null);
    setLayerMenu(false);
  };
  const changeLayer = (front: boolean) => {
    if (!selectedKey) return;
    const ordered = [
      ...draft.map((item) => ({ key: item.inventoryId, layer: item.transform.layer })),
      ...pending.map((item) => ({ key: item.key, layer: item.transform.layer })),
    ]
      .sort((a, b) => a.layer - b.layer)
      .filter((item) => item.key !== selectedKey);
    if (front) ordered.push({ key: selectedKey, layer: 0 });
    else ordered.unshift({ key: selectedKey, layer: 0 });
    const layers = new Map(ordered.map((item, index) => [item.key, index]));
    setDraft((items) =>
      items.map((item) => ({
        ...item,
        transform: {
          ...item.transform,
          layer: layers.get(item.inventoryId) ?? item.transform.layer,
        },
      })),
    );
    setPending((items) =>
      items.map((item) => ({
        ...item,
        transform: { ...item.transform, layer: layers.get(item.key) ?? item.transform.layer },
      })),
    );
    setLayerMenu(false);
  };
  const changeOption = (optionId: number) => {
    if (purchaseRetryOnly) return;
    const choice = selectedShopItem?.options.find(
      (item) => item.optionId === optionId && item.currency === 'STARDUST',
    );
    if (!choice) return;
    const duplicate = pending.find(
      (item) => item.optionId === optionId && item.key !== selectedKey,
    );
    if (duplicate) {
      setNotice('이미 배치한 색상이에요.');
      return;
    }
    const owned = inventory.find((item) => item.optionId === optionId);
    if (owned) {
      if (placedIds.has(owned.inventoryId)) {
        setNotice('이미 배치한 색상이에요.');
        return;
      }
      setDraft((items) => [
        ...items,
        { inventoryId: owned.inventoryId, area: 'INTERIOR', transform: selectedPending!.transform },
      ]);
      setPending((items) => items.filter((item) => item.key !== selectedKey));
      setSelectedKey(owned.inventoryId);
      return;
    }
    setPending((items) =>
      items.map((item) =>
        item.key === selectedKey
          ? {
              ...item,
              optionId: choice.optionId,
              option: choice.option,
              currency: choice.currency,
              price: choice.price,
            }
          : item,
      ),
    );
  };
  // 색상 버튼: 상점 목록을 그 색으로 거른다. 구매 예정 아이템을 선택 중이면 기존처럼 그 색 옵션으로 바꾼다.
  const pressColor = (key: ColorKey) => {
    const next = colorFilter === key ? null : key;
    setColorFilter(next);
    if (!next || !selectedPending || purchaseRetryOnly) return;
    const choice = selectedShopItem?.options.find(
      (option) => option.currency === 'STARDUST' && colorMatches(option.option, next),
    );
    if (choice && choice.optionId !== selectedPending.optionId) changeOption(choice.optionId);
  };
  const toggleSheet = () => setExpanded((value) => !value);
  // 웹 새로고침·직접 진입처럼 뒤로 갈 기록이 없으면 내 우주선 탭으로 보낸다.
  const exit = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const leave = () => {
    if (task.busy) return;
    if (dirty) setExitOpen(true);
    else exit();
  };
  // 변경 취소: 마지막으로 저장된 배치로 되돌리고 구매 예정을 비운 뒤 나간다. 서버에는 요청하지 않는다.
  const discardAndLeave = () => {
    setExitOpen(false);
    setDraft(savedDraft);
    setPending([]);
    setSelectedKey(null);
    setLayerMenu(false);
    purchaseKey.current = null;
    setPurchaseRetryOnly(false);
    leaveAllowed.current = true;
    exit();
  };
  // 최신 별가루를 다시 읽는다. 실패하면 갖고 있던 값을 쓴다(사전 안내용, 최종 판단은 구매 응답).
  const latestStardust = async () => {
    try {
      const latest = await api.benefits.wallet();
      setWallet(latest);
      return latest.stardust;
    } catch {
      return wallet?.stardust ?? null;
    }
  };
  const showInsufficient = (stardust: number | null) => {
    const missing = stardust === null ? totalStardust : totalStardust - stardust;
    setShortfall(missing > 0 ? missing : totalStardust);
    setInsufficientOpen(true);
  };
  const openCheckout = () => {
    // 직전 구매 결과를 모르는 재시도는 잔액이 이미 차감됐을 수 있어 사전 검사를 건너뛴다.
    if (purchaseRetryOnly) {
      setCheckoutOpen(true);
      return;
    }
    void task.run(async () => {
      const stardust = await latestStardust();
      if (stardust !== null && totalStardust > stardust) showInsufficient(stardust);
      else setCheckoutOpen(true);
    });
  };
  const save = () => {
    setCheckoutOpen(false);
    void task.run(async () => {
      let placements = draft;
      if (pending.length) {
        setPurchaseRetryOnly(true);
        let result: Awaited<ReturnType<typeof api.room.purchase>>;
        try {
          result = await api.room.purchase(
            pending.map((item) => ({ itemId: item.itemId, optionId: item.optionId })),
            purchaseKey.current ?? (purchaseKey.current = randomUuid()),
          );
        } catch (error) {
          if (!(error instanceof IntegrationError && error.code === 'INSUFFICIENT_BALANCE'))
            throw error;
          // 서버가 구매 전체를 거절했다(결제 없음). 키를 버리고 배치·구매 예정은 그대로 둔다.
          purchaseKey.current = null;
          setPurchaseRetryOnly(false);
          showInsufficient(await latestStardust());
          return;
        }
        purchaseKey.current = null;
        setPurchaseRetryOnly(false);
        setWallet(result.wallet);
        setInventory((items) => [...items, ...result.inventoryItems]);
        const available = [...result.inventoryItems];
        const purchased = pending.flatMap((item) => {
          const index = available.findIndex(
            (owned) => owned.itemId === item.itemId && owned.optionId === item.optionId,
          );
          if (index < 0) return [];
          const [owned] = available.splice(index, 1);
          return [
            {
              inventoryId: owned.inventoryId,
              area: 'INTERIOR' as const,
              transform: item.transform,
            },
          ];
        });
        placements = [...draft, ...purchased];
        setDraft(placements);
        setPending([]);
        setSelectedKey(null);
        if (purchased.length !== pending.length) {
          setNotice('일부 아이템을 구매하지 못했습니다. 배치를 확인하세요.');
          return result;
        }
      }
      const saved = await api.room.save(placements);
      setRoom((current) => current && { ...current, placements: saved.placements });
      setNotice('배치를 저장했습니다.');
      leaveAllowed.current = true;
      exit();
      return saved;
    });
  };

  const saveDisabled = !dirty || task.busy || !loaded;
  const gridWidth = Math.min(352, screenWidth - 52);
  const cardWidth = Math.floor((gridWidth - 16) / 3);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          onPress={leave}
          hitSlop={12}
          style={s.back}
        >
          <BackArrow color={color.fale} />
        </Pressable>
        <Text style={s.headerTitle}>우주선 꾸미기</Text>
      </View>

      <View
        style={[s.shipArea, { paddingBottom: shipReserve }]}
        onLayout={(event) => setShipAreaHeight(event.nativeEvent.layout.height)}
      >
        <View style={[s.shipColumn, { width: shipWidth }]}>
          <View style={s.shipBar}>
            <StardustCount value={wallet?.stardust ?? null} />
            <VisibilityBadge
              isPublic={visibility.isPublic}
              disabled={visibility.badgeDisabled}
              onPress={visibility.pressBadge}
            />
          </View>
          <View style={s.roomBox}>
            <View style={s.sceneFit}>
              <RoomScene
                items={sceneItems}
                editable
                selectedKey={selectedKey}
                onSelect={(key) => {
                  setSelectedKey(key);
                  setLayerMenu(false);
                  setExpanded(false);
                }}
                onClearSelection={() => {
                  setSelectedKey(null);
                  setLayerMenu(false);
                }}
                onMove={moveItem}
                onInvalidDrop={() => setNotice('가구는 우주선 안에 놓아주세요.')}
                onRemove={removeSelected}
                onToggleLayer={() => setLayerMenu((value) => !value)}
                layerMenu={layerMenu}
                onChangeLayer={changeLayer}
              />
            </View>
          </View>
        </View>
      </View>

      <Animated.View
        style={[
          s.sheet,
          {
            height: drawerHeight,
            paddingBottom: SHEET_PADDING_BOTTOM + sheetExtra,
          },
        ]}
      >
        <View {...sheetPan.panHandlers} style={s.dragZone}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? '목록 접기' : '목록 펼치기'}
            accessibilityState={{ expanded }}
            onPress={toggleSheet}
            hitSlop={{ top: 16, bottom: 8, left: 40, right: 40 }}
            style={s.handleTouch}
          >
            <View style={expanded ? s.handleExpanded : s.handleCollapsed} />
          </Pressable>
          <View style={[s.content, s.tabs]} accessibilityRole="tablist">
            {(['owned', 'shop'] as const).map((tab) => (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: catalogTab === tab }}
                onPress={() => setCatalogTab(tab)}
                style={[s.tab, catalogTab === tab && s.tabActive]}
              >
                <Text style={[s.tabText, catalogTab === tab && s.tabTextActive]}>
                  {tab === 'owned' ? '내 아이템' : '상점'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.content}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.filtersScroll}
            contentContainerStyle={s.filters}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="전체 보기"
              accessibilityState={{ selected: filter === 'ALL' }}
              onPress={() => setFilter('ALL')}
              style={[s.filterAll, filter === 'ALL' && s.filterAllActive]}
            >
              <Text style={[s.filterAllText, filter === 'ALL' && s.filterAllTextActive]}>All</Text>
            </Pressable>
            <View style={s.filterKinds}>
              {furnitureKinds.map((entry) => (
                <Pressable
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.label}만 보기`}
                  accessibilityState={{ selected: filter === entry.key }}
                  onPress={() => setFilter(entry.key)}
                  style={[s.filterKind, filter === entry.key && s.filterKindActive]}
                >
                  <FurnitureArt name={entry.label} color="크림" size={26} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {catalogTab === 'shop' ? (
            <View style={s.colors}>
              {colorChoices.map((entry) => {
                const active = colorFilter === entry.key;
                return (
                  <Pressable
                    key={entry.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.label} 계열만 보기`}
                    accessibilityState={{ selected: active }}
                    onPress={() => pressColor(entry.key)}
                    style={[s.colorChip, { backgroundColor: entry.hex }, active && s.colorActive]}
                  />
                );
              })}
            </View>
          ) : null}
        </View>

        <ScrollView
          style={s.productsScroll}
          contentContainerStyle={[s.products, { width: gridWidth }]}
          showsVerticalScrollIndicator={false}
        >
          {catalogTab === 'owned'
            ? ownedGroups.map((group) => {
                const next = group.items.find((item) => !placedIds.has(item.inventoryId));
                return (
                  <Product
                    key={group.key}
                    width={cardWidth}
                    name={group.name}
                    color={optionColor(group.option)}
                    caption={`${group.placed}/${group.items.length}`}
                    accessibilityCaption={`보유 ${group.items.length}개 중 ${group.placed}개 배치`}
                    disabled={!next}
                    onPress={() => next && addOwned(next)}
                  />
                );
              })
            : visibleShop.map((item) => {
                const choice = shopChoice(item);
                return (
                  <Product
                    key={item.itemId}
                    width={cardWidth}
                    name={item.name}
                    color={optionColor(choice?.option ?? {})}
                    price={item.unlocked ? choice?.price : undefined}
                    caption={
                      item.unlocked ? (choice?.owned ? '보유' : '') : (item.unlockHint ?? '잠김')
                    }
                    accessibilityCaption={
                      item.unlocked
                        ? `별가루 ${choice?.price ?? 0}${choice?.owned ? ', 보유' : ''}`
                        : (item.unlockHint ?? '잠김')
                    }
                    disabled={
                      !item.unlocked || !item.options.length || purchaseRetryOnly || task.busy
                    }
                    onPress={() => addShop(item)}
                  />
                );
              })}
          {loaded && (catalogTab === 'owned' ? !ownedGroups.length : !visibleShop.length) ? (
            <Text style={s.empty}>
              {catalogTab === 'owned' ? '보유한 아이템이 없어요.' : '판매 중인 아이템이 없어요.'}
            </Text>
          ) : null}
          {!loaded && !task.error ? <Text style={s.empty}>아이템을 불러오는 중</Text> : null}
        </ScrollView>

        <View style={[s.content, s.footer]}>
          {notice ? <Text style={s.notice}>{notice}</Text> : null}
          <UserStatus task={task} />
          {task.error && !loaded ? (
            <Pressable accessibilityRole="button" onPress={() => void load()} hitSlop={8}>
              <Text style={s.retryText}>다시 불러오기</Text>
            </Pressable>
          ) : null}
          {/* Figma 651:1267 Frame 85: Default · pressed · disabled */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              pending.length ? `구매하고 배치 저장, 별가루 ${totalStardust}` : '배치 저장'
            }
            accessibilityState={{ disabled: saveDisabled }}
            disabled={saveDisabled}
            onPress={() => (pending.length ? openCheckout() : save())}
            style={({ pressed }) => [
              s.primary,
              pressed && s.primaryPressed,
              saveDisabled && s.primaryDisabled,
            ]}
          >
            {({ pressed }) => {
              const tone = saveDisabled ? color.tertiary : pressed ? color.lght : color.fale;
              return (
                <View style={s.primaryContent}>
                  <Text style={[s.primaryText, { color: tone }]}>
                    {pending.length ? '구매하고 배치 저장' : '배치 저장'}
                  </Text>
                  {pending.length ? (
                    <View style={s.primaryPrice}>
                      <StarIcon fill={tone} />
                      <Text style={[s.primaryText, { color: tone }]}>x {totalStardust}</Text>
                    </View>
                  ) : null}
                </View>
              );
            }}
          </Pressable>
        </View>
      </Animated.View>

      {showEditHint ? (
        <View pointerEvents="none" style={[s.editHint, { bottom: collapsedHeight + 12 }]}>
          <Text style={s.editHintText}>
            가구를 끌어 놓고, 같은 자리를 다시 눌러 겹친 가구를 선택해요.
          </Text>
        </View>
      ) : null}

      <PurchaseConfirmModal
        visible={checkoutOpen}
        total={totalStardust}
        busy={task.busy}
        onCancel={() => setCheckoutOpen(false)}
        onConfirm={save}
      />
      <InsufficientStardustModal
        visible={insufficientOpen}
        amount={shortfall}
        onClose={() => setInsufficientOpen(false)}
      />
      <DiscardChangesModal
        visible={exitOpen}
        onCancel={() => setExitOpen(false)}
        onConfirm={discardAndLeave}
      />
      {visibility.modals}
    </SafeAreaView>
  );
}

// Figma 546:7637 Frame 26/Frame 102: 112×120, 이미지 72, 아래 글자 12
function Product({
  width,
  name,
  color: itemColor,
  caption,
  price,
  accessibilityCaption,
  disabled,
  onPress,
}: {
  width: number;
  name: string;
  color?: string;
  caption: string;
  price?: number;
  accessibilityCaption: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name} ${accessibilityCaption}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.product, { width }, disabled && s.productDisabled]}
    >
      <View style={s.productImage}>
        <FurnitureArt name={name} color={itemColor} size={72} />
      </View>
      <View style={s.productCaption}>
        {price !== undefined ? (
          <Text style={s.productCaptionText} numberOfLines={1}>
            x {price}
            {caption ? ` · ${caption}` : ''}
          </Text>
        ) : (
          <Text style={s.productCaptionText} numberOfLines={1}>
            {caption}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.base },
  header: {
    height: 29,
    marginTop: 32,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  back: { width: 14, height: 29, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    color: color.fale,
    fontFamily: 'PretendardBold',
    fontSize: 24,
    includeFontPadding: false,
  },
  shipArea: { flex: 1, minHeight: 0, alignItems: 'center', paddingTop: SHIP_TOP_GAP },
  shipColumn: { gap: 11 },
  shipBar: {
    height: 24,
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
  sceneFit: { height: '100%', aspectRatio: 330 / 342 },
  // Figma 651:599 Frame 126: 배경 #E4E4E4, 테두리 2 #161616, 위 모서리 16, 위 20 · 아래 28 · 좌우 24
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: color.bg,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: color.base,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  content: { width: '100%', maxWidth: 352, alignSelf: 'center' },
  dragZone: { width: '100%' },
  // 핸들: 접힘 52×6(둥근 끝 포함 58), 펼침 72×4(76), #AAAAAA. 위 20 · 아래 12 는 선 중심 기준.
  handleTouch: { alignItems: 'center', justifyContent: 'center', height: 32 },
  handleCollapsed: { width: 58, height: 6, borderRadius: 3, backgroundColor: color.lght },
  handleExpanded: { width: 76, height: 4, borderRadius: 2, backgroundColor: color.lght },
  tabs: { flexDirection: 'row', height: 48 },
  tab: {
    width: 72,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: color.base,
  },
  tabActive: { borderBottomWidth: 4 },
  tabText: { color: color.base, fontFamily: 'PretendardMedium', fontSize: 16 },
  tabTextActive: { fontFamily: 'PretendardBold' },
  filtersScroll: { flexGrow: 0, flexShrink: 0, marginTop: 16 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Figma 651:991 Frame 128: Default 테두리 1.2 #AAAAAA · 글자 #AAAAAA, pressed 배경 #161616 · 글자 #F1F1F1
  filterAll: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: color.lght,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterAllActive: { backgroundColor: color.base, borderColor: color.base },
  filterAllText: { color: color.lght, fontFamily: 'PretendardSemiBold', fontSize: 14 },
  filterAllTextActive: { color: color.fale },
  filterKinds: { flexDirection: 'row', gap: 4 },
  // Figma 651:967 Rectangle 34: Default 테두리 #AAAAAA, pressed 테두리 #747474
  filterKind: {
    width: 40,
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: color.lght,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterKindActive: { borderColor: color.tertiary },
  // Figma 651:1079: 지름 28, 간격 4. 선택(pressed)은 #161616 1px 테두리.
  colors: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, marginTop: 16 },
  colorChip: { width: 28, height: 28, borderRadius: 14 },
  colorActive: { borderWidth: 1, borderColor: color.base },
  productsScroll: { flex: 1, minHeight: 0, marginTop: 16 },
  products: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'center' },
  product: {
    height: 120,
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.fale,
    borderWidth: 1,
    borderColor: color.lght,
    borderRadius: 4,
  },
  productDisabled: { opacity: 0.4 },
  productImage: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  productCaption: { width: '100%', paddingHorizontal: 8 },
  productCaptionText: { color: '#000000', fontFamily: 'PretendardRegular', fontSize: 12 },
  empty: {
    width: '100%',
    color: color.tertiary,
    fontFamily: 'PretendardRegular',
    fontSize: 13,
    textAlign: 'center',
    padding: 24,
  },
  footer: { marginTop: 16, gap: 8, alignItems: 'center' },
  notice: { color: color.secondary, fontFamily: 'PretendardRegular', fontSize: 12 },
  retryText: { color: color.base, fontFamily: 'PretendardMedium', fontSize: 12 },
  primary: {
    width: '100%',
    maxWidth: 350,
    height: 48,
    borderRadius: 4,
    backgroundColor: color.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: '#242424' },
  primaryDisabled: { backgroundColor: color.mist },
  primaryContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryPrice: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  primaryText: { fontFamily: 'PretendardMedium', fontSize: 16, textAlign: 'center' },
  editHint: { position: 'absolute', left: 24, right: 24, alignItems: 'center', zIndex: 20 },
  editHintText: {
    maxWidth: 400,
    overflow: 'hidden',
    backgroundColor: color.secondary,
    color: color.fale,
    fontFamily: 'PretendardRegular',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 4,
  },
});
