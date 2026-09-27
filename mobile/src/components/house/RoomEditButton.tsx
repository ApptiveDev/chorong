import { Alert, Pressable, StyleSheet, Text } from 'react-native';

export function RoomEditButton() {
  const handlePress = () => {
    Alert.alert('방 편집', '방 편집 기능은 준비 중입니다.');
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
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
