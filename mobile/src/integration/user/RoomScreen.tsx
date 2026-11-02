import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TopDownRoom } from '../../components/house/TopDownRoom';
import { useIntegration, useTask } from '../hooks';
import type { HousingDetail, InventoryItem, Placement, PlacementInput, ShopItem } from '../models';
import { integrationApi as api, randomUuid } from '../runtime';
import { UserScreen, UserStatus } from './Screen';

type Category = 'FURNITURE' | 'OBJECT';
type Wallet = { star: number; stardust: number };
const categories: { value: Category; label: string }[] = [
  { value: 'FURNITURE', label: '가구' },
  { value: 'OBJECT', label: '소품' },
];
const currencyLabel = (currency: 'STAR' | 'STARDUST') =>
  currency === 'STAR' ? '별가루' : '별조각';

export default function RoomScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const { generation } = useIntegration();
  return <Room key={`${mode}-${generation}`} mode={mode === 'shop' ? 'shop' : 'inventory'} />;
}

function Room({ mode }: { mode: 'shop' | 'inventory' }) {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [category, setCategory] = useState<Category>('FURNITURE');
  const [room, setRoom] = useState<HousingDetail | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [draft, setDraft] = useState<PlacementInput[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = () =>
    task.run(async () => {
      const [housing, owned, balance, store] = await Promise.all([
        api.room.me(),
        api.room.inventory(),
        api.benefits.wallet(),
        mode === 'shop' ? api.room.shop() : Promise.resolve(null),
      ]);
      setRoom(housing);
      setInventory(owned.items);
      setWallet(balance);
      setShopItems(store?.items ?? []);
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

  const items = mode === 'shop' ? shopItems : inventory;
  const visibleItems = items.filter((item) => item.itemType === category);
  const selected = items.find((item) =>
    mode === 'shop'
      ? String((item as ShopItem).itemId) === selectedId
      : (item as InventoryItem).inventoryId === selectedId,
  );
  const selectedShop = mode === 'shop' ? (selected as ShopItem | undefined) : undefined;
  const selectedOwned = mode === 'inventory' ? (selected as InventoryItem | undefined) : undefined;
  const option =
    selectedShop?.options.find((entry) => entry.optionId === selectedOptionId) ??
    selectedShop?.options[0];
  const balance = option ? wallet?.[option.currency === 'STAR' ? 'star' : 'stardust'] : null;
  const insufficient =
    option && balance !== null && balance !== undefined && balance < option.price;
  const placedIds = new Set(draft.map((item) => item.inventoryId));
  const names = Object.fromEntries(inventory.map((item) => [item.inventoryId, item.name]));
  const previewPlacements: Placement[] = draft.flatMap((item, index) => {
    const owned = inventory.find((candidate) => candidate.inventoryId === item.inventoryId);
    if (!owned) return [];
    return [
      {
        placementId:
          room?.placements.find((placed) => placed.inventoryId === item.inventoryId)?.placementId ??
          -index - 1,
        inventoryId: item.inventoryId,
        area: item.area,
        transform: item.transform,
        itemId: owned.itemId,
        optionId: owned.optionId,
        option: owned.option,
      },
    ];
  });

  const togglePlacement = (item: InventoryItem) => {
    setNotice(null);
    setDraft((current) =>
      current.some((placed) => placed.inventoryId === item.inventoryId)
        ? current.filter((placed) => placed.inventoryId !== item.inventoryId)
        : [
            ...current,
            {
              inventoryId: item.inventoryId,
              area: 'INTERIOR',
              transform: {
                x: 0.36 + (current.length % 3) * 0.14,
                y: 0.55,
                rotation: 0,
                layer: current.length + 1,
              },
            },
          ],
    );
  };
  const save = () =>
    void task.run(async () => {
      const result = await api.room.save(draft);
      setRoom((current) => current && { ...current, placements: result.placements });
      setNotice('배치를 저장했습니다.');
      return result;
    });
  const purchase = () => {
    if (!selectedShop || !option) return;
    setConfirming(false);
    void task.run(async () => {
      const result = await api.room.purchase(
        [{ itemId: selectedShop.itemId, optionId: option.optionId }],
        randomUuid(),
      );
      setWallet(result.wallet);
      setInventory((current) => [...current, ...result.inventoryItems]);
      const store = await api.room.shop();
      setShopItems(store.items);
      setNotice(result.inventoryItems.length ? '구매했습니다.' : '구매하지 못했습니다.');
      return result;
    });
  };

  return (
    <UserScreen title={mode === 'shop' ? '상점' : '꾸미기'}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.backButton}>
          <Ionicons name="chevron-back" size={19} color="#273a52" />
          <Text style={s.backText}>나의 우주선</Text>
        </Pressable>
        <View style={s.walletPill}>
          <Text style={s.walletText}>
            ✦ {wallet?.star ?? '—'} · ✧ {wallet?.stardust ?? '—'}
          </Text>
        </View>
      </View>

      <View style={s.categories}>
        {categories.map((entry) => (
          <Pressable
            key={entry.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: category === entry.value }}
            onPress={() => {
              setCategory(entry.value);
              setSelectedId(null);
              setSelectedOptionId(null);
              setNotice(null);
            }}
            style={[s.category, category === entry.value && s.categoryActive]}
          >
            <Text style={[s.categoryText, category === entry.value && s.categoryTextActive]}>
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.eyebrow}>우주선 미리보기</Text>
      <View style={s.preview}>
        <TopDownRoom
          placements={mode === 'inventory' ? previewPlacements : (room?.placements ?? [])}
          itemNames={names}
        />
      </View>
      <Text style={s.previewCaption}>
        {mode === 'shop'
          ? '아이템을 골라 상세 정보를 확인하세요.'
          : '아이템을 눌러 방에 배치하거나 해제하세요.'}
      </Text>

      {task.busy && !loaded ? <ActivityIndicator accessibilityLabel="아이템 불러오는 중" /> : null}
      <UserStatus task={task} />
      {task.error && !loaded ? (
        <Pressable accessibilityRole="button" onPress={() => void load()} style={s.outlineButton}>
          <Text style={s.outlineText}>다시 불러오기</Text>
        </Pressable>
      ) : null}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      {loaded ? (
        <>
          <View style={s.detail}>
            {selected ? (
              <>
                <View style={s.detailIcon}>
                  <Ionicons
                    name={selected.itemType === 'FURNITURE' ? 'bed-outline' : 'sparkles-outline'}
                    size={31}
                    color="#607992"
                  />
                </View>
                <Text style={s.detailName}>{selected.name}</Text>
                <Text style={s.detailMeta}>
                  {mode === 'shop'
                    ? option
                      ? `${currencyLabel(option.currency)} ${option.price}`
                      : '구매 옵션 없음'
                    : placedIds.has(selectedOwned!.inventoryId)
                      ? '방에 배치됨'
                      : '보유 중'}
                </Text>
                {selectedShop && selectedShop.options.length > 1 ? (
                  <View style={s.optionRow}>
                    {selectedShop.options.map((entry, index) => (
                      <Pressable
                        key={entry.optionId}
                        accessibilityRole="button"
                        accessibilityState={{ selected: option?.optionId === entry.optionId }}
                        onPress={() => setSelectedOptionId(entry.optionId)}
                        style={[
                          s.optionChip,
                          option?.optionId === entry.optionId && s.optionChipActive,
                        ]}
                      >
                        <Text style={s.optionText}>
                          옵션 {index + 1} · {entry.price}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {mode === 'shop' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled:
                        !selectedShop?.unlocked ||
                        !option ||
                        !!option.owned ||
                        !!insufficient ||
                        task.busy,
                    }}
                    disabled={
                      !selectedShop?.unlocked ||
                      !option ||
                      !!option.owned ||
                      !!insufficient ||
                      task.busy
                    }
                    onPress={() => setConfirming(true)}
                    style={[
                      s.primaryButton,
                      (!selectedShop?.unlocked || !option || !!option.owned || !!insufficient) &&
                        s.disabled,
                    ]}
                  >
                    <Text style={s.primaryText}>
                      {!selectedShop?.unlocked
                        ? (selectedShop?.unlockHint ?? '잠김')
                        : option?.owned
                          ? '보유 중'
                          : insufficient
                            ? '잔액 부족'
                            : `구매하기 · ${option ? option.price : ''}`}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => togglePlacement(selectedOwned!)}
                    style={s.primaryButton}
                  >
                    <Text style={s.primaryText}>
                      {placedIds.has(selectedOwned!.inventoryId) ? '배치 해제' : '배치하기'}
                    </Text>
                  </Pressable>
                )}
              </>
            ) : (
              <Text style={s.placeholder}>아래에서 아이템을 선택하세요.</Text>
            )}
          </View>

          <View style={s.listHeading}>
            <Text style={s.listTitle}>{mode === 'shop' ? '아이템 선택' : '보유 아이템'}</Text>
            <Text style={s.listHint}>옆으로 넘겨보세요 →</Text>
          </View>
          {visibleItems.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={s.itemList}
            >
              {visibleItems.map((item) => {
                const id =
                  mode === 'shop'
                    ? String((item as ShopItem).itemId)
                    : (item as InventoryItem).inventoryId;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedId === id }}
                    onPress={() => {
                      setSelectedId(id);
                      setSelectedOptionId(null);
                      setNotice(null);
                    }}
                    style={[s.itemCard, selectedId === id && s.itemCardActive]}
                  >
                    <View style={s.itemIcon}>
                      <Ionicons
                        name={item.itemType === 'FURNITURE' ? 'bed-outline' : 'sparkles-outline'}
                        size={25}
                        color="#607992"
                      />
                    </View>
                    <Text style={s.itemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={s.itemMeta}>
                      {mode === 'shop'
                        ? `${currencyLabel((item as ShopItem).minPrice.currency)} ${(item as ShopItem).minPrice.amount}`
                        : placedIds.has(id)
                          ? '배치됨'
                          : '보유 중'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={s.empty}>
              {mode === 'shop' ? '판매 중인 아이템이 없습니다.' : '보유한 아이템이 없습니다.'}
            </Text>
          )}
          {mode === 'inventory' ? (
            <View style={s.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                style={s.outlineButton}
              >
                <Text style={s.outlineText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: task.busy }}
                disabled={task.busy}
                onPress={save}
                style={s.primaryButton}
              >
                <Text style={s.primaryText}>저장</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}

      <Modal
        transparent
        visible={confirming}
        animationType="fade"
        onRequestClose={() => setConfirming(false)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={() => setConfirming(false)}
              style={s.close}
            >
              <Ionicons name="close" size={20} color="#607992" />
            </Pressable>
            <Text style={s.dialogTitle}>{selectedShop?.name} 구매할까요?</Text>
            <View style={s.dialogIcon}>
              <Ionicons
                name={selectedShop?.itemType === 'FURNITURE' ? 'bed-outline' : 'sparkles-outline'}
                size={38}
                color="#607992"
              />
            </View>
            <View style={s.summary}>
              <Text style={s.summaryText}>
                사용할 {option ? currencyLabel(option.currency) : ''} {option?.price ?? 0}
              </Text>
              <Text style={s.summaryText}>현재 잔액 {balance ?? 0}</Text>
              <Text style={s.summaryText}>
                구매 후 잔액 {(balance ?? 0) - (option?.price ?? 0)}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={purchase} style={s.primaryButton}>
              <Text style={s.primaryText}>구매하기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirming(false)}
              style={s.outlineButton}
            >
              <Text style={s.outlineText}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </UserScreen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 35 },
  backText: { color: '#273a52', fontSize: 13, fontWeight: '600' },
  walletPill: {
    borderWidth: 1,
    borderColor: '#d7dfe6',
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  walletText: { color: '#273a52', fontSize: 12, fontWeight: '600' },
  categories: { flexDirection: 'row', gap: 8 },
  category: {
    borderWidth: 1,
    borderColor: '#d7dfe6',
    borderRadius: 20,
    paddingHorizontal: 17,
    paddingVertical: 9,
  },
  categoryActive: { backgroundColor: '#273a52', borderColor: '#273a52' },
  categoryText: { color: '#536578', fontSize: 12 },
  categoryTextActive: { color: '#fff', fontWeight: '600' },
  eyebrow: { color: '#8b98a6', fontSize: 11, textAlign: 'center' },
  preview: {
    backgroundColor: '#f1f4f7',
    borderWidth: 1,
    borderColor: '#d7dfe6',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
  },
  previewCaption: { color: '#8b98a6', fontSize: 11, textAlign: 'center' },
  detail: { alignItems: 'center', gap: 7, minHeight: 165, justifyContent: 'center' },
  detailIcon: {
    width: 56,
    height: 56,
    borderRadius: 11,
    backgroundColor: '#eef2f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailName: { color: '#273a52', fontSize: 16, fontWeight: '700' },
  detailMeta: { color: '#8b98a6', fontSize: 12 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  optionChip: {
    borderWidth: 1,
    borderColor: '#d7dfe6',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  optionChipActive: { borderColor: '#273a52', backgroundColor: '#eef2f5' },
  optionText: { color: '#536578', fontSize: 11 },
  placeholder: { color: '#8b98a6', fontSize: 12 },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  listTitle: { color: '#273a52', fontSize: 13, fontWeight: '700' },
  listHint: { color: '#8b98a6', fontSize: 11 },
  itemList: { gap: 8, paddingBottom: 4 },
  itemCard: {
    width: 105,
    borderWidth: 1,
    borderColor: '#d7dfe6',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
  },
  itemCardActive: { borderColor: '#273a52', borderWidth: 2, padding: 7 },
  itemIcon: {
    height: 52,
    width: '100%',
    backgroundColor: '#eef2f5',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: { color: '#273a52', fontSize: 11, fontWeight: '600' },
  itemMeta: { color: '#8b98a6', fontSize: 10 },
  empty: { color: '#8b98a6', fontSize: 12, textAlign: 'center', padding: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  primaryButton: {
    backgroundColor: '#273a52',
    borderRadius: 6,
    minHeight: 42,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    flexGrow: 1,
  },
  primaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#d7dfe6',
    borderRadius: 6,
    minHeight: 42,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    flexGrow: 1,
  },
  outlineText: { color: '#536578', fontSize: 12, fontWeight: '600' },
  disabled: { backgroundColor: '#9ca7b2' },
  notice: {
    color: '#273a52',
    backgroundColor: '#eef2f5',
    padding: 9,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(27,39,56,0.47)',
    justifyContent: 'center',
    padding: 25,
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 17,
    gap: 10,
    alignItems: 'stretch',
  },
  close: { alignSelf: 'flex-start' },
  dialogTitle: { color: '#273a52', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  dialogIcon: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#eef2f5',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { backgroundColor: '#f1f4f7', borderRadius: 7, padding: 11, gap: 7 },
  summaryText: { color: '#536578', fontSize: 12 },
});
