import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HouseCanvas } from '../../src/components/house/HouseCanvas';
import { useHouseEditing } from '../../src/components/house/HouseEditingContext';
import { RoomEditButton } from '../../src/components/house/RoomEditButton';
import { ShopPanel } from '../../src/components/house/editor/ShopPanel';
import type { PlacedItems, ShopCategory, ShopItem } from '../../src/data/mockShopItems';

export default function Home() {
  const { isEditing, setIsEditing } = useHouseEditing();
  const [selectedCategory, setSelectedCategory] = useState<ShopCategory>('wall');
  const [placedItems, setPlacedItems] = useState<PlacedItems>({});

  const handleSelectItem = (item: ShopItem) => {
    setPlacedItems((currentItems) => {
      if (currentItems[item.slot]?.id === item.id) {
        const nextItems = { ...currentItems };
        delete nextItems[item.slot];
        return nextItems;
      }

      return { ...currentItems, [item.slot]: item };
    });
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={isEditing ? ['top', 'right', 'bottom', 'left'] : ['top', 'right', 'left']}
    >
      <View style={styles.content}>
        <View style={styles.roomArea}>
          <HouseCanvas placedItems={placedItems} />
          {isEditing ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsEditing(false)}
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressedButton]}
            >
              <Text style={styles.saveButtonLabel}>저장</Text>
            </Pressable>
          ) : (
            <View style={styles.editButton}>
              <RoomEditButton onPress={() => setIsEditing(true)} />
            </View>
          )}
        </View>
      </View>
      {isEditing ? (
        <ShopPanel
          selectedCategory={selectedCategory}
          placedItems={placedItems}
          onSelectCategory={setSelectedCategory}
          onSelectItem={handleSelectItem}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  roomArea: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    position: 'absolute',
    left: '8%',
    bottom: '10%',
  },
  saveButton: {
    position: 'absolute',
    right: '8%',
    bottom: '8%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    minHeight: 40,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#0f172a',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  pressedButton: { backgroundColor: '#e2e8f0' },
  saveButtonLabel: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
});
