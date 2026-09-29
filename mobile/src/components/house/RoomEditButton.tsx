import { Pressable, StyleSheet, Text } from 'react-native';

type RoomEditButtonProps = {
  onPress: () => void;
};

export function RoomEditButton({ onPress }: RoomEditButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>방 편집</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  pressed: {
    backgroundColor: '#f1f5f9',
  },
  label: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '600',
  },
});
