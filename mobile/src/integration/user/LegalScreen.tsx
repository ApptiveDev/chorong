import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingsHeader } from '../../components/SettingsScreenUI';

export function LegalScreen({ title, message }: { title: string; message?: string }) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <SettingsHeader title={title} />
      <View style={[s.body, { paddingBottom: Math.max(52, insets.bottom + 20) }]}>
        <ScrollView
          style={s.document}
          contentContainerStyle={s.documentContent}
          nestedScrollEnabled
        >
          <Text style={s.message}>{message ?? `${title} 본문 영역`}</Text>
          <Text style={s.message}>확정된 실제 정책 내용을 넣습니다.</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#e4e4e4' },
  body: { flex: 1, minHeight: 0, paddingHorizontal: 27 },
  document: {
    flex: 1,
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#c4c4c4',
    borderRadius: 8,
  },
  documentContent: { padding: 20, flexGrow: 1 },
  message: {
    color: '#747474',
    fontFamily: 'PretendardRegular',
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
  },
});
