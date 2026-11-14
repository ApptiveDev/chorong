import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BackArrow } from './settings/ControlSettingsUI';

export function SettingsHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const router = useRouter();

  return (
    <View style={s.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="뒤로가기"
        onPress={onBack ?? (() => router.back())}
        style={s.back}
        hitSlop={8}
      >
        <BackArrow />
      </Pressable>
      <Text style={s.title}>{title}</Text>
    </View>
  );
}

export function SettingsSwitch({ value }: { value: boolean }) {
  return (
    <View style={[s.switchTrack, value && s.switchTrackOn]}>
      <View style={[s.switchThumb, value && s.switchThumbOn]} />
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Safe Area 아래 32. 우주선 관리하기·알림(ControlSettingsUI)과 같은 값.
    paddingTop: 32,
    paddingHorizontal: 32,
    marginBottom: 60,
  },
  back: { width: 14, height: 29, justifyContent: 'center', alignItems: 'center' },
  title: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    fontSize: 24,
    lineHeight: 29,
    includeFontPadding: false,
  },
  switchTrack: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d9d9d9',
    justifyContent: 'center',
  },
  // Figma 656:2874 Variant2(켜짐): 트랙 #161616, 손잡이 오른쪽(x 28).
  switchTrackOn: { backgroundColor: '#161616' },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: 4,
    backgroundColor: '#f1f1f1',
  },
  switchThumbOn: { marginLeft: 28 },
});
