import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { quizImageUri } from '../../lib/quiz';
import type { CardFace, QuizItem } from '../../types/quiz';

export function QuizButton({
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      aria-selected={selected}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, selected && styles.selected, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
function QuizImage({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const uri = quizImageUri(url);
  return !uri || failed ? (
    <Text style={styles.muted}>이미지를 불러오지 못했습니다. ({label})</Text>
  ) : (
    <Image
      accessibilityLabel={label}
      source={{ uri }}
      style={styles.image}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}
export function ItemContent({ item }: { item: QuizItem | CardFace }) {
  return (
    <View style={styles.stack}>
      {'title' in item && item.title ? <Text style={styles.heading}>{item.title}</Text> : null}
      {item.imageUrl ? (
        <QuizImage
          key={item.imageUrl}
          url={item.imageUrl}
          label={item.text || ('id' in item ? item.id : item.title) || '퀴즈 이미지'}
        />
      ) : null}
      {item.text ? <Text>{item.text}</Text> : null}
    </View>
  );
}
export const itemLabel = (item: QuizItem) => item.text || item.id;
// 웹에서는 제스처 영역의 터치를 페이지 스크롤로 넘기지 않는다.
const webGestureStyle = Platform.OS === 'web' ? { touchAction: 'none' as const } : {};
export const styles = StyleSheet.create({
  stack: { gap: 8 },
  section: { gap: 12, padding: 12, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  column: { flex: 1, minWidth: 110, gap: 8 },
  heading: { fontSize: 18, fontWeight: '600', color: '#111827' },
  muted: { fontSize: 13, color: '#4b5563' },
  error: { color: '#b91c1c' },
  input: { borderWidth: 1, borderColor: '#9ca3af', borderRadius: 8, padding: 10, fontSize: 15 },
  button: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    minHeight: 44,
  },
  buttonText: { color: '#111827', fontWeight: '600' },
  selected: { borderColor: '#2563eb', backgroundColor: '#dbeafe' },
  disabled: { opacity: 0.45 },
  image: { width: '100%', height: 140 },
  gesture: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    minHeight: 44,
    ...webGestureStyle,
    userSelect: 'none',
  },
  result: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, gap: 6 },
});
