import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HouseCanvas } from '../../src/components/house/HouseCanvas';
import { useHouseEditing } from '../../src/components/house/HouseEditingContext';
import { RoomEditButton } from '../../src/components/house/RoomEditButton';
import { ShopPanel } from '../../src/components/house/editor/ShopPanel';
import { LocalTestHouseCanvas } from '../../src/components/house/local/LocalTestHouseCanvas';
import { LocalTestShopPanel } from '../../src/components/house/local/LocalTestShopPanel';
import {
  type LocalPlacedItems,
  type LocalShopCategory,
  type LocalShopItem,
} from '../../src/data/localHousingTestData';
import {
  housingApi,
  type CatalogResponse,
  type Layout,
  type MeResponse,
  type ShopItem,
} from '../../src/lib/housingApi';

type LoadStatus = 'loading' | 'success' | 'error';

export default function Home() {
  const { isEditing, setIsEditing } = useHouseEditing();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>('loading');
  const [housing, setHousing] = useState<MeResponse | null>(null);
  const [housingStatus, setHousingStatus] = useState<LoadStatus>('loading');
  const [layout, setLayout] = useState<Layout | null>(null);
  const [isLocalTest, setIsLocalTest] = useState(false);
  const [localPlacedItems, setLocalPlacedItems] = useState<LocalPlacedItems>({});
  const [localCategory, setLocalCategory] = useState<LocalShopCategory>('wall');
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [shopStatus, setShopStatus] = useState<LoadStatus>('loading');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    let active = true;

    housingApi
      .getCatalog()
      .then((response) => {
        if (!active) return;
        setCatalog(response);
        setCatalogStatus('success');
      })
      .catch((error: unknown) => {
        console.error('하우징 카탈로그 조회 실패', error);
        if (active) setCatalogStatus('error');
      });

    housingApi
      .getMe()
      .then((response) => {
        if (!active) return;
        setHousing(response);
        setLayout(response.activeRoomId ? (response.layouts[response.activeRoomId] ?? null) : null);
        setHousingStatus('success');
      })
      .catch((error: unknown) => {
        console.error('내 방 조회 실패', error);
        if (active) setHousingStatus('error');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) return;

    if (isLocalTest) return;

    let active = true;
    setShopStatus('loading');

    housingApi
      .getShop()
      .then((response) => {
        if (!active) return;
        setShopItems(response.items);
        setShopStatus('success');
      })
      .catch((error: unknown) => {
        console.error('하우징 상점 조회 실패', error);
        if (active) setShopStatus('error');
      });

    return () => {
      active = false;
    };
  }, [isEditing, isLocalTest]);

  const handleSelectItem = (item: ShopItem) => {
    if (!item.owned || !catalog || !housing?.activeRoomId || !layout) return;

    const room = catalog.rooms.find((candidate) => candidate.id === housing.activeRoomId);
    const furniture = catalog.furniture.find((candidate) => candidate.id === item.targetId);

    if (room && furniture) {
      const currentPlacement = layout.placements.find(
        (placement) => placement.furnitureId === furniture.id,
      );

      if (currentPlacement) {
        setLayout({
          ...layout,
          placements: layout.placements.filter(
            (placement) => placement.slotId !== currentPlacement.slotId,
          ),
        });
        return;
      }

      const slot = room.slots.find((candidate) =>
        candidate.allowedCategories.includes(furniture.category),
      );
      if (!slot) return;

      setLayout({
        ...layout,
        placements: [
          ...layout.placements.filter((placement) => placement.slotId !== slot.id),
          { slotId: slot.id, furnitureId: furniture.id },
        ],
      });
      return;
    }

    const surfaceItem = [...catalog.walls, ...catalog.floors].find(
      (candidate) => candidate.id === item.targetId,
    );
    const surface = room?.surfaces.find(
      (candidate) => candidate.kind.toLowerCase() === item.type.toLowerCase(),
    );

    if (surfaceItem && surface) {
      const surfaceSkins = { ...layout.surfaceSkins };
      if (surfaceSkins[surface.id] === surfaceItem.id) delete surfaceSkins[surface.id];
      else surfaceSkins[surface.id] = surfaceItem.id;
      setLayout({ ...layout, surfaceSkins });
      return;
    }

    if (catalog.backgrounds.some((candidate) => candidate.id === item.targetId)) {
      setLayout({ ...layout, backgroundId: item.targetId });
    } else if (catalog.avatars.some((candidate) => candidate.id === item.targetId)) {
      setLayout({ ...layout, avatarId: item.targetId });
    }
  };

  const handleSelectLocalItem = (item: LocalShopItem) => {
    setLocalPlacedItems((currentItems) => {
      if (currentItems[item.slot]?.id === item.id) {
        const nextItems = { ...currentItems };
        delete nextItems[item.slot];
        return nextItems;
      }
      return { ...currentItems, [item.slot]: item };
    });
  };

  const handleSave = async () => {
    if (isLocalTest) {
      setIsEditing(false);
      return;
    }

    if (!housing?.activeRoomId || !layout) return;

    setSaveStatus('saving');
    try {
      const savedLayout = await housingApi.saveLayout(housing.activeRoomId, {
        backgroundId: layout.backgroundId,
        surfaceSkins: layout.surfaceSkins,
        avatarId: layout.avatarId,
        placements: layout.placements,
      });
      setLayout(savedLayout);
      setSaveStatus('idle');
      setIsEditing(false);
    } catch (error) {
      console.error('방 레이아웃 저장 실패', error);
      setSaveStatus('error');
    }
  };

  const canSave = Boolean(
    (isLocalTest || (housing?.activeRoomId && layout)) && saveStatus !== 'saving',
  );

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={isEditing ? ['top', 'right', 'bottom', 'left'] : ['top', 'right', 'left']}
    >
      <View style={styles.content}>
        <View style={styles.roomArea}>
          {isLocalTest ? (
            <LocalTestHouseCanvas placedItems={localPlacedItems} />
          ) : (
            <HouseCanvas layout={layout} catalog={catalog} roomId={housing?.activeRoomId} />
          )}
          {isEditing && isLocalTest ? (
            <Text style={styles.testModeLabel}>로컬 테스트 · 서버에 저장되지 않음</Text>
          ) : (
            !isLocalTest && (
              <RoomStatus catalogStatus={catalogStatus} housingStatus={housingStatus} />
            )
          )}
          {isEditing ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsEditing(false)}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressedButton]}
              >
                <Text style={styles.cancelButtonLabel}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave }}
                disabled={!canSave}
                onPress={handleSave}
                style={({ pressed }) => [
                  styles.saveButton,
                  !canSave && styles.disabledButton,
                  pressed && styles.pressedButton,
                ]}
              >
                <Text style={styles.saveButtonLabel}>
                  {saveStatus === 'saving' ? '저장 중...' : '저장'}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.editActions}>
              <RoomEditButton
                onPress={() => {
                  setIsLocalTest(false);
                  setIsEditing(true);
                }}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setIsLocalTest(true);
                  setIsEditing(true);
                }}
                style={({ pressed }) => [styles.testButton, pressed && styles.pressedButton]}
              >
                <Text style={styles.testButtonLabel}>로컬 꾸미기 테스트</Text>
              </Pressable>
            </View>
          )}
          {saveStatus === 'error' ? (
            <Text style={styles.saveError}>방 정보를 저장하지 못했습니다.</Text>
          ) : null}
        </View>
      </View>
      {isEditing && isLocalTest ? (
        <LocalTestShopPanel
          selectedCategory={localCategory}
          placedItems={localPlacedItems}
          onSelectCategory={setLocalCategory}
          onSelectItem={handleSelectLocalItem}
        />
      ) : isEditing ? (
        <ShopPanel
          status={shopStatus}
          items={shopItems}
          catalog={catalog}
          layout={layout}
          onSelectItem={handleSelectItem}
        />
      ) : null}
    </SafeAreaView>
  );
}

function RoomStatus({
  catalogStatus,
  housingStatus,
}: {
  catalogStatus: LoadStatus;
  housingStatus: LoadStatus;
}) {
  if (catalogStatus === 'loading' || housingStatus === 'loading') {
    return <Text style={styles.status}>하우징 정보를 불러오는 중...</Text>;
  }
  if (catalogStatus === 'error' || housingStatus === 'error') {
    return <Text style={styles.status}>하우징 정보를 불러오지 못했습니다.</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  roomArea: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center' },
  status: { position: 'absolute', top: '8%', color: '#475569', fontSize: 13 },
  testModeLabel: { position: 'absolute', top: '8%', color: '#9a3412', fontSize: 13 },
  editActions: {
    position: 'absolute',
    left: '8%',
    bottom: '10%',
    flexDirection: 'row',
    gap: 8,
  },
  testButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#9a3412',
    borderRadius: 4,
    backgroundColor: '#fff7ed',
  },
  testButtonLabel: { color: '#9a3412', fontSize: 13, fontWeight: '600' },
  cancelButton: {
    position: 'absolute',
    left: '8%',
    bottom: '8%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    minHeight: 40,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#64748b',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  cancelButtonLabel: { color: '#475569', fontSize: 14, fontWeight: '600' },
  saveButton: {
    position: 'absolute',
    right: '8%',
    bottom: '8%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
    minHeight: 40,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#0f172a',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  disabledButton: { opacity: 0.45 },
  pressedButton: { backgroundColor: '#e2e8f0' },
  saveButtonLabel: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  saveError: { position: 'absolute', right: '8%', bottom: '3%', color: '#b91c1c', fontSize: 12 },
});
