import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function LegalScreen({ title, message }: { title: string; message?: string }) {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#273a52" />
          <Text style={s.backText}>제어실</Text>
        </Pressable>
        <Text style={s.title}>{title}</Text>
        <View style={s.document}>
          <Text style={s.message}>{message ?? `${title} 본문 준비 중`}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 18, flexGrow: 1, gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { color: '#273a52', fontSize: 12 },
  title: {
    textAlign: 'center',
    color: '#273a52',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 5,
  },
  document: {
    flex: 1,
    minHeight: 480,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 5,
    padding: 14,
  },
  message: { color: '#7b8795', fontSize: 12 },
});
