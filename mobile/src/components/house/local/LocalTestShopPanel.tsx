import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  localShopCategories,
  localShopItems,
  type LocalPlacedItems,
  type LocalShopCategory,
  type LocalShopItem,
} from '../../../data/localHousingTestData';

type LocalTestShopPanelProps = {
  selectedCategory: LocalShopCategory;
  placedItems: LocalPlacedItems;
  onSelectCategory: (category: LocalShopCategory) => void;
  onSelectItem: (item: LocalShopItem) => void;
};

export function LocalTestShopPanel({
  selectedCategory,
  placedItems,
  onSelectCategory,
  onSelectItem,
}: LocalTestShopPanelProps) {
  const visibleItems = localShopItems.filter((item) => item.category === selectedCategory);

  return (
    <View style={styles.panel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryContent}
      >
        {localShopCategories.map((category) => {
          const selected = category.id === selectedCategory;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onSelectCategory(category.id)}
              style={[styles.category, selected && styles.selectedCategory]}
            >
              <Text style={[styles.categoryLabel, selected && styles.selectedCategoryLabel]}>
                {category.label}
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
          const selected = placedItems[item.slot]?.id === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelectItem(item)}
              style={[styles.itemCard, selected && styles.selectedItemCard]}
            >
              <View
                style={[
                  styles.itemPreview,
                  { backgroundColor: item.color, borderColor: item.accentColor },
                ]}
              >
                {selected ? <Ionicons name="checkmark-circle" size={22} color="#0f172a" /> : null}
              </View>
              <Text numberOfLines={1} style={styles.itemName}>
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
  categoryContent: { paddingHorizontal: 12 },
  category: {
    justifyContent: 'center',
    minWidth: 62,
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
    width: 104,
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
  itemPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 3,
  },
  itemName: { marginTop: 7, color: '#1e293b', fontSize: 12, textAlign: 'center' },
});
