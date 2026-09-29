import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getCatalogItemName,
  type CatalogResponse,
  type Layout,
  type ShopItem,
} from '../../../lib/housingApi';

type LoadStatus = 'loading' | 'success' | 'error';

type ShopPanelProps = {
  status: LoadStatus;
  items: ShopItem[];
  catalog: CatalogResponse | null;
  layout: Layout | null;
  onSelectItem: (item: ShopItem) => void;
};

export function ShopPanel({ status, items, catalog, layout, onSelectItem }: ShopPanelProps) {
  const categories = useMemo(() => [...new Set(items.map((item) => item.type))], [items]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCategory || !categories.includes(selectedCategory)) {
      setSelectedCategory(categories[0] ?? null);
    }
  }, [categories, selectedCategory]);

  if (status === 'loading') {
    return <PanelMessage text="상점 정보를 불러오는 중..." />;
  }

  if (status === 'error') {
    return <PanelMessage text="상점 정보를 불러오지 못했습니다." />;
  }

  if (items.length === 0) {
    return <PanelMessage text="등록된 하우징 아이템이 없습니다." />;
  }

  const visibleItems = items.filter((item) => item.type === selectedCategory);

  return (
    <View style={styles.panel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryContent}
      >
        {categories.map((category) => {
          const selected = category === selectedCategory;

          return (
            <Pressable
              key={category}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setSelectedCategory(category)}
              style={[styles.category, selected && styles.selectedCategory]}
            >
              <Text style={[styles.categoryLabel, selected && styles.selectedCategoryLabel]}>
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.itemContent}
      >
        {visibleItems.map((item) => {
          const selected = isItemApplied(item, layout);
          const name = catalog ? getCatalogItemName(catalog, item.targetId) : undefined;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !item.owned }}
              disabled={!item.owned}
              onPress={() => onSelectItem(item)}
              style={[
                styles.itemCard,
                selected && styles.selectedItemCard,
                !item.owned && styles.disabledItemCard,
              ]}
            >
              <View style={styles.itemPreview}>
                {selected ? <Ionicons name="checkmark-circle" size={22} color="#0f172a" /> : null}
                <Text style={styles.price}>{item.price.coin} coin</Text>
              </View>
              <Text numberOfLines={1} style={styles.itemName}>
                {name ?? item.targetId}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function isItemApplied(item: ShopItem, layout: Layout | null) {
  if (!layout) return false;

  return (
    layout.backgroundId === item.targetId ||
    layout.avatarId === item.targetId ||
    Object.values(layout.surfaceSkins).includes(item.targetId) ||
    layout.placements.some((placement) => placement.furnitureId === item.targetId)
  );
}

function PanelMessage({ text }: { text: string }) {
  return (
    <View style={[styles.panel, styles.messageContainer]}>
      <Text style={styles.message}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    maxHeight: '36%',
    minHeight: 205,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  messageContainer: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { color: '#475569', fontSize: 14, textAlign: 'center' },
  categoryContent: { paddingHorizontal: 12 },
  category: {
    justifyContent: 'center',
    minWidth: 72,
    height: 48,
    paddingHorizontal: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  selectedCategory: { borderBottomColor: '#0f172a' },
  categoryLabel: { textAlign: 'center', color: '#64748b', fontSize: 14 },
  selectedCategoryLabel: { color: '#0f172a', fontWeight: '700' },
  itemContent: { gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  itemCard: {
    width: 112,
    height: 120,
    padding: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  selectedItemCard: {
    borderWidth: 2,
    borderColor: '#0f172a',
    padding: 7,
    backgroundColor: '#f8fafc',
  },
  disabledItemCard: { opacity: 0.45 },
  itemPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  price: { marginTop: 4, color: '#475569', fontSize: 11 },
  itemName: { marginTop: 7, color: '#1e293b', fontSize: 12, textAlign: 'center' },
});
