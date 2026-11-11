// 제어실 설정 화면 공용 UI. Figma S03_1 우주선 관리(497:454) · S06_1 알림(656:2945) 값을 그대로 옮겼다.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

export const figma = {
  base: '#161616', // Primary/Base
  fale: '#f1f1f1', // Primary/Fale
  mist: '#d9d9d9', // Primary/Mist
  lght: '#aaaaaa', // Primary/Lght
  bg: '#e4e4e4', // BG/Base - Present
};

// 화면 틀: 배경 #e4e4e4, 상단 32, 헤더와 본문 사이 60, 본문 좌우 32.
export function ControlSettingsScreen({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          onPress={onBack}
          hitSlop={12}
          style={s.back}
        >
          <BackArrow />
        </Pressable>
        <Text style={s.title}>{title}</Text>
      </View>
      <View style={s.body}>{children}</View>
    </SafeAreaView>
  );
}

// Figma '<' 글자(학교안심 별빛하늘 B 24px)를 윤곽선으로 내보낸 SVG. 설정·약관 화면 헤더 공용.
// 원본의 #f1f1f1 2px 그림자 필터는 배경과 거의 구분되지 않고 플랫폼별 지원이 달라 생략했다.
export function BackArrow() {
  return (
    <Svg width={14} height={25} viewBox="0 0 14 25" fill="none">
      <Path
        d="M12.008 4.61603L5.192 12.056L12.008 19.496L9.584 22.112L2 14.024V10.088L9.584 2.00003L12.008 4.61603Z"
        fill={figma.base}
      />
    </Svg>
  );
}

// 설정 상자: 높이 48, 좌우 20, 배경 #f1f1f1, 테두리 1 #aaaaaa, 모서리 4, 양 끝 정렬.
export function ControlSettingRow({
  label,
  value,
  disabled,
  onPress,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={s.row}
    >
      <Text style={s.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <ControlToggle value={value} />
    </Pressable>
  );
}

// Figma 656:2874 Frame 142. Default(꺼짐): 트랙 #D9D9D9 · 손잡이 왼쪽,
// Variant2(켜짐): 트랙 #161616 · 손잡이 오른쪽. 52×28, 손잡이 지름 20.
export function ControlToggle({ value }: { value: boolean }) {
  return (
    <Svg width={52} height={28} viewBox="0 0 52 28" fill="none">
      <Rect width={52} height={28} rx={14} fill={value ? figma.base : figma.mist} />
      <Path
        d={
          value
            ? 'M38 24C43.5228 24 48 19.5228 48 14C48 8.47715 43.5228 4 38 4C32.4772 4 28 8.47715 28 14C28 19.5228 32.4772 24 38 24Z'
            : 'M14 24C19.5228 24 24 19.5228 24 14C24 8.47715 19.5228 4 14 4C8.47715 4 4 8.47715 4 14C4 19.5228 8.47715 24 14 24Z'
        }
        fill={figma.fale}
      />
    </Svg>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: figma.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 32,
    paddingHorizontal: 32,
  },
  back: { width: 14, height: 29, alignItems: 'center', justifyContent: 'center' },
  title: { color: figma.base, fontFamily: 'PretendardBold', fontSize: 24 },
  body: { flex: 1, marginTop: 60, paddingHorizontal: 32 },
  row: {
    // Figma 는 332 고정(본문 폭 338 과 거의 같음). 아래 목록 상자와 폭이 어긋나지 않게 본문 폭을 채운다.
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: figma.fale,
    borderWidth: 1,
    borderColor: figma.lght,
    borderRadius: 4,
  },
  rowLabel: { flexShrink: 1, color: figma.base, fontFamily: 'PretendardRegular', fontSize: 16 },
});
