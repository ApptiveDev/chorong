import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { FurnitureArt, RoomScene, type RoomSceneItem } from '../../components/house/RoomScene';
import { useIntegration, useTask } from '../hooks';
import type { HousingDetail, InventoryItem, PlacementInput, ShopItem } from '../models';
import { integrationApi as api, randomUuid } from '../runtime';
import { storage } from '../storage';
import { UserScreen, UserStatus } from './Screen';

type CatalogTab = 'owned' | 'shop';
type Filter = 'ALL' | 'plant' | 'rug' | 'chair' | 'lamp' | 'desk' | 'shelf' | 'bed';
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

const optionColor = (value: Record<string, unknown>) =>
  typeof value.color === 'string' ? value.color : undefined;
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
const colorChoices = [
  { name: '크림', hex: '#d9bf99' },
  { name: '세이지', hex: '#a9b9ac' },
  { name: '라벤더', hex: '#b9afd0' },
  { name: '로즈', hex: '#d1a29d' },
  { name: '블루', hex: '#929db2' },
] as const;
const nextTransform = (count: number): PlacementInput['transform'] => ({
  x: 0.36 + (count % 3) * 0.14,
  y: Math.min(0.86, 0.55 + Math.floor(count / 3) * 0.08),
  rotation: 0,
  layer: count + 1,
});

export default function RoomScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const { generation } = useIntegration();
  return <Room key={`${mode}-${generation}`} initialTab={mode === 'shop' ? 'shop' : 'owned'} />;
}

function Room({ initialTab }: { initialTab: CatalogTab }) {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const { height: screenHeight } = useWindowDimensions();
  const [catalogTab, setCatalogTab] = useState<CatalogTab>(initialTab);
  const [filter, setFilter] = useState<Filter>('ALL');
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
  const [notice, setNotice] = useState('');
  const [showEditHint, setShowEditHint] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [purchaseRetryOnly, setPurchaseRetryOnly] = useState(false);
  const purchaseKey = useRef<string | null>(null);
  const drawerHeight = useRef(new Animated.Value(232)).current;
  const expandedHeight = Math.min(530, screenHeight * 0.72);

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
    Animated.timing(drawerHeight, {
      toValue: expanded ? expandedHeight : 232,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [drawerHeight, expanded, expandedHeight]);

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
  const visibleOwned = inventory.filter(
    (item) => filter === 'ALL' || furnitureKind(item.name) === filter,
  );
  const visibleShop = shopItems.filter(
    (item) =>
      (filter === 'ALL' || furnitureKind(item.name) === filter) &&
      item.options.some((option) => option.currency === 'STARDUST'),
  );
  const totalStardust = pending.reduce(
    (sum, item) => sum + (item.currency === 'STARDUST' ? item.price : 0),
    0,
  );
  const insufficient = totalStardust > (wallet?.stardust ?? 0);
  const savedDraft =
    room?.placements.map(({ inventoryId, area, transform }) => ({
      inventoryId,
      area,
      transform,
    })) ?? [];
  const dirty = pending.length > 0 || JSON.stringify(draft) !== JSON.stringify(savedDraft);
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
    setExpanded(false);
    setNotice('');
  };
  const addShop = (item: ShopItem) => {
    if (purchaseRetryOnly || task.busy) return;
    if (!item.unlocked || !item.options.length) return;
    const choice = item.options.find((option) => option.currency === 'STARDUST');
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
  const leave = () => {
    if (dirty) setExitOpen(true);
    else router.back();
  };
  const save = () => {
    setCheckoutOpen(false);
    void task.run(async () => {
      let placements = draft;
      if (pending.length) {
        setPurchaseRetryOnly(true);
        const result = await api.room.purchase(
          pending.map((item) => ({ itemId: item.itemId, optionId: item.optionId })),
          purchaseKey.current ?? (purchaseKey.current = randomUuid()),
        );
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
      router.back();
      return saved;
    });
  };

  return (
    <UserScreen title="꾸미기" scroll={false} showTitle={false}>
      <View style={s.page}>
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            onPress={leave}
            style={s.back}
          >
            <Ionicons name="chevron-back" size={24} color="#282636" />
          </Pressable>
          <Text style={s.headerTitle}>꾸미기</Text>
          <View style={s.wallet}>
            <Text style={s.walletText}>✦ {wallet?.stardust ?? '—'}</Text>
          </View>
        </View>
        <View style={s.middle}>
          <View style={[s.sceneWrap, screenHeight < 750 && s.sceneWrapShort]}>
            <RoomScene
              items={sceneItems}
              editable
              selectedKey={selectedKey}
              onSelect={(key) => {
                setSelectedKey(key);
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
          <Animated.View style={[s.drawer, { height: drawerHeight }]}>
            <View style={s.handle} />
            <View style={s.drawerHeader}>
              <View style={s.drawerTabs}>
                {(['owned', 'shop'] as const).map((tab) => (
                  <Pressable
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: catalogTab === tab }}
                    onPress={() => setCatalogTab(tab)}
                    style={[s.drawerTab, catalogTab === tab && s.drawerTabActive]}
                  >
                    <Text style={[s.drawerTabText, catalogTab === tab && s.drawerTabTextActive]}>
                      {tab === 'owned' ? '내 아이템' : '상점'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)}>
                <Text style={s.expandText}>{expanded ? '목록 접기 ⌄' : '목록 펼치기 ⌃'}</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.filtersScroll}
              contentContainerStyle={s.filters}
            >
              {([{ key: 'ALL', label: '전체' }, ...furnitureKinds] as const).map((entry) => (
                <Pressable
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.label}만 보기`}
                  accessibilityState={{ selected: filter === entry.key }}
                  onPress={() => setFilter(entry.key as Filter)}
                  style={[s.filter, filter === entry.key && s.filterActive]}
                >
                  {entry.key === 'ALL' ? (
                    <Text style={s.filterText}>{entry.label}</Text>
                  ) : (
                    <FurnitureArt name={entry.label} color="크림" size={26} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            {catalogTab === 'shop' ? (
              <View style={s.colors}>
                <View style={s.colorRow}>
                  {colorChoices.map((color) => {
                    const choice = selectedShopItem?.options.find(
                      (option) =>
                        optionColor(option.option) === color.name && option.currency === 'STARDUST',
                    );
                    const active = selectedPending?.optionId === choice?.optionId;
                    return (
                      <Pressable
                        key={color.name}
                        accessibilityRole="button"
                        accessibilityLabel={color.name}
                        accessibilityState={{ selected: active, disabled: !choice }}
                        disabled={!choice || purchaseRetryOnly}
                        onPress={() => choice && changeOption(choice.optionId)}
                        style={[
                          s.colorChip,
                          active && s.colorChipActive,
                          !choice && s.colorUnavailable,
                        ]}
                      >
                        <View style={[s.colorSwatch, { backgroundColor: color.hex }]} />
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={s.colorText}>
                  {optionColor(selectedPending?.option ?? {}) ?? '색상'}
                </Text>
              </View>
            ) : null}
            <ScrollView style={s.productsScroll} contentContainerStyle={s.products}>
              {catalogTab === 'owned'
                ? visibleOwned.map((item) => (
                    <Product
                      key={item.inventoryId}
                      name={item.name}
                      color={optionColor(item.option)}
                      caption={placedIds.has(item.inventoryId) ? '배치됨' : `보유 1 · 가능 1`}
                      disabled={placedIds.has(item.inventoryId)}
                      onPress={() => addOwned(item)}
                    />
                  ))
                : visibleShop.map((item) => (
                    <Product
                      key={item.itemId}
                      name={item.name}
                      color={optionColor(
                        item.options.find((option) => option.currency === 'STARDUST')?.option ?? {},
                      )}
                      caption={
                        item.unlocked
                          ? `✦ ${Math.min(...item.options.filter((option) => option.currency === 'STARDUST').map((option) => option.price))}`
                          : (item.unlockHint ?? '잠김')
                      }
                      disabled={
                        !item.unlocked || !item.options.length || purchaseRetryOnly || task.busy
                      }
                      onPress={() => addShop(item)}
                    />
                  ))}
              {loaded && (catalogTab === 'owned' ? !visibleOwned.length : !visibleShop.length) ? (
                <Text style={s.empty}>
                  {catalogTab === 'owned'
                    ? '보유한 아이템이 없어요.'
                    : '판매 중인 아이템이 없어요.'}
                </Text>
              ) : null}
              {!loaded ? <Text style={s.empty}>아이템을 불러오는 중</Text> : null}
            </ScrollView>
          </Animated.View>
        </View>
        <View style={s.checkout}>
          {notice ? <Text style={s.notice}>{notice}</Text> : null}
          <UserStatus task={task} />
          {task.error && !loaded ? (
            <Pressable accessibilityRole="button" onPress={() => void load()} style={s.secondary}>
              <Text style={s.secondaryText}>다시 불러오기</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !dirty || task.busy || !loaded }}
            disabled={!dirty || task.busy || !loaded}
            onPress={() => (pending.length ? setCheckoutOpen(true) : save())}
            style={[s.primary, (!dirty || task.busy || !loaded) && s.disabled]}
          >
            <Text style={s.primaryText}>
              {pending.length ? `구매하고 배치 저장 · ✦ ${totalStardust}` : '배치 저장'}
            </Text>
          </Pressable>
        </View>
        {showEditHint ? (
          <View pointerEvents="none" style={s.editHint}>
            <Text style={s.editHintText}>
              가구를 끌어 놓고, 같은 자리를 다시 눌러 겹친 가구를 선택해요.
            </Text>
          </View>
        ) : null}
      </View>
      <Modal
        transparent
        visible={checkoutOpen}
        animationType="fade"
        onRequestClose={() => setCheckoutOpen(false)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>
              {insufficient ? '잔액이 부족해요.' : '구매하고 배치를 저장할까요?'}
            </Text>
            <Text style={s.dialogDescription}>필요한 아이템을 구매하고 지금 배치를 저장해요.</Text>
            <ScrollView style={s.bill}>
              {pending.map((item) => (
                <View key={item.key} style={s.billLine}>
                  <Text style={s.billText}>
                    {item.name} · {optionColor(item.option) ?? '기본'}
                  </Text>
                  <Text style={s.billText}>✦ {item.price}</Text>
                </View>
              ))}
              <View style={s.billLine}>
                <Text style={s.billTotal}>구매 후 잔액</Text>
                <Text style={s.billTotal}>✦ {(wallet?.stardust ?? 0) - totalStardust}</Text>
              </View>
            </ScrollView>
            <View style={s.dialogActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setCheckoutOpen(false)}
                style={s.secondary}
              >
                <Text style={s.secondaryText}>계속 꾸미기</Text>
              </Pressable>
              {!insufficient ? (
                <Pressable accessibilityRole="button" onPress={save} style={s.primary}>
                  <Text style={s.primaryText}>구매하고 저장</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        visible={exitOpen}
        animationType="fade"
        onRequestClose={() => setExitOpen(false)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>변경한 배치를 나갈까요?</Text>
            <Text style={s.dialogDescription}>
              저장하지 않은 배치와 구매 예정 아이템은 사라져요.
            </Text>
            <View style={s.dialogActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setExitOpen(false)}
                style={s.secondary}
              >
                <Text style={s.secondaryText}>계속 꾸미기</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setExitOpen(false);
                  router.back();
                }}
                style={s.primary}
              >
                <Text style={s.primaryText}>저장하지 않고 나가기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </UserScreen>
  );
}

function Product({
  name,
  color,
  caption,
  disabled,
  onPress,
}: {
  name: string;
  color?: string;
  caption: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name} ${caption}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.product, disabled && s.productDisabled]}
    >
      <FurnitureArt name={name} color={color} />
      <Text style={s.productName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={s.productCaption} numberOfLines={1}>
        {caption}
      </Text>
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
    alignItems: 'center',
    gap: 8,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#282636', fontSize: 18, fontWeight: '700', flex: 1 },
  wallet: {
    backgroundColor: '#f6f1e6',
    borderRadius: 30,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  walletText: { color: '#8a7047', fontSize: 11, fontWeight: '600' },
  middle: { flex: 1, minHeight: 0, position: 'relative' },
  sceneWrap: { marginTop: 24, paddingHorizontal: 20 },
  sceneWrapShort: { width: 330, maxWidth: '100%', alignSelf: 'center' },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    paddingHorizontal: 16,
    paddingTop: 8,
    overflow: 'hidden',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 10,
    backgroundColor: '#ded7e6',
    alignSelf: 'center',
    marginBottom: 5,
  },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drawerTabs: { flexDirection: 'row', gap: 18 },
  drawerTab: { paddingVertical: 9 },
  drawerTabActive: { borderBottomWidth: 2, borderBottomColor: '#7b658e' },
  drawerTabText: { color: '#b0a5b9', fontSize: 15 },
  drawerTabTextActive: { color: '#5d4a70', fontWeight: '700' },
  expandText: { color: '#9e8eac', fontSize: 11, paddingVertical: 10 },
  filtersScroll: { flexGrow: 0, flexShrink: 0, height: 51 },
  filters: { flexDirection: 'row', gap: 6, paddingVertical: 8, paddingRight: 16 },
  filter: {
    height: 35,
    minWidth: 35,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#f6f3f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActive: { borderColor: '#ab98ba', backgroundColor: '#eee7f4' },
  filterText: { color: '#655174', fontSize: 11 },
  colors: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 7, flexShrink: 0 },
  colorRow: { flexDirection: 'row', gap: 8 },
  colorChip: {
    width: 27,
    height: 27,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorChipActive: { borderColor: '#736187' },
  colorUnavailable: { opacity: 0.35 },
  colorSwatch: { width: 19, height: 19, borderRadius: 10 },
  colorText: { color: '#655174', fontSize: 11 },
  productsScroll: { flex: 1, minHeight: 0 },
  products: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 10 },
  product: {
    width: '31%',
    minHeight: 102,
    backgroundColor: '#f8f6fb',
    borderWidth: 1,
    borderColor: '#efebf3',
    borderRadius: 13,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productDisabled: { opacity: 0.35 },
  productName: { color: '#655174', fontSize: 10, marginTop: 2 },
  productCaption: { color: '#9e8eac', fontSize: 10, marginTop: 2 },
  empty: { width: '100%', color: '#aa9ab5', fontSize: 13, textAlign: 'center', padding: 25 },
  checkout: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1ebf5',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 13,
  },
  notice: { color: '#655174', fontSize: 12, textAlign: 'center', marginBottom: 5 },
  editHint: {
    position: 'absolute',
    bottom: 92,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  editHintText: {
    maxWidth: 400,
    overflow: 'hidden',
    backgroundColor: '#373044',
    color: '#fff',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  primary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: '#302b38',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.38 },
  secondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: '#f3f1f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryText: { color: '#655b76', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: '#34273c63',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 23,
    padding: 25,
    gap: 12,
  },
  dialogTitle: { color: '#282636', fontSize: 20, fontWeight: '700' },
  dialogDescription: { color: '#9a8aa4', fontSize: 13, lineHeight: 21 },
  bill: { maxHeight: 190, backgroundColor: '#f7f4fa', borderRadius: 12, padding: 12 },
  billLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6 },
  billText: { color: '#655174', fontSize: 12 },
  billTotal: { color: '#4e3f5b', fontSize: 12, fontWeight: '700' },
  dialogActions: { flexDirection: 'row', gap: 9, marginTop: 10 },
});
