import { Ionicons } from '@expo/vector-icons';
import { Image, Platform, Pressable, StyleSheet, Text, type TextStyle, View } from 'react-native';
import { artColor as color, ConstellationFigure } from './constellationArt';
import type { ConstellationImage, StarPoint } from './constellationLayouts';
import { useCompletionLayout } from './CompletionResult';

const completionArcSource = require('../../../assets/completion-arc.png');

// Figma L04_1 별자리 완성(342:650). 별자리 소속 레슨을 모두 마친 순간 학습 완료 화면 다음에 보여 준다.
// 이름·날짜·보너스·별 배치는 모두 호출하는 쪽이 서버 응답과 설정에서 읽어 넘긴다.
export function ConstellationComplete({
  name,
  completedOn,
  bonus,
  points,
  image,
  onRecord,
  onHome,
}: {
  name: string;
  // 'YYYY. MM. DD'
  completedOn: string;
  // 완성 보너스 별가루. 0 이면 보너스 줄을 그리지 않는다.
  bonus: number;
  points: StarPoint[];
  image: ConstellationImage | null;
  onRecord: () => void;
  onHome: () => void;
}) {
  const { scale, top, bottom } = useCompletionLayout();
  return (
    <View style={s.root}>
      {/* Ellipse 6(342:677): 다른 완료 화면과 같은 호. Figma 위치 214 - 그림자 24 */}
      <Image
        source={completionArcSource}
        resizeMode="stretch"
        style={[s.arc, { top: top(190), height: 463 * scale }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="학습 홈으로"
        onPress={onHome}
        hitSlop={8}
        style={[s.header, { top: top(32) }]}
      >
        <Ionicons name="chevron-back" size={24} color={color.fale} style={s.headerIcon} />
        <Text style={s.headerText}>별자리 완성</Text>
      </Pressable>
      {/* Group 34(754:2950): 별 칸 44, 별 반지름 6, 흰 그림자 12 + 4 */}
      <View style={[s.figure, { top: top(173) }]}>
        <ConstellationFigure
          points={points}
          image={image}
          width={169 * scale}
          height={177 * scale}
          starRadius={6 * scale}
          glow={12 * scale}
          innerGlow={4 * scale}
          padding={22 * scale}
        />
      </View>
      <Text style={[s.name, { top: top(422) }]} numberOfLines={1}>
        {name}
      </Text>
      <View style={[s.dateLine, { top: top(479) }]}>
        <Text style={s.date}>{completedOn} 완성</Text>
      </View>
      {bonus > 0 ? (
        <>
          <Text style={[s.bonusLabel, { top: top(529) }]}>완성 보너스</Text>
          <Text style={[s.bonusAmount, { top: top(555) }]}>별가루 +{bonus}</Text>
        </>
      ) : null}
      <View style={[s.actions, { bottom }]}>
        <Pressable accessibilityRole="button" onPress={onRecord} style={[s.button, s.buttonLight]}>
          <Text style={s.buttonLightText}>완성 기록 보기</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onHome} style={[s.button, s.buttonDark]}>
          <Text style={s.buttonDarkText}>학습 홈으로</Text>
        </Pressable>
      </View>
    </View>
  );
}

const glow = (radius: number): TextStyle =>
  Platform.OS === 'web'
    ? ({ textShadow: `0px 0px ${radius}px #f1f1f1` } as TextStyle)
    : {
        textShadowColor: '#f1f1f1',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: radius,
      };

const centered = { position: 'absolute', left: 0, right: 0, textAlign: 'center' } as const;

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', backgroundColor: color.base },
  arc: { position: 'absolute', left: 0, right: 0, width: '100%' },
  // 342:654: 왼쪽 32, '<' 와 제목 간격 12, Pretendard Bold 24
  header: {
    position: 'absolute',
    left: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 29,
  },
  headerIcon: glow(2),
  headerText: {
    color: color.fale,
    fontFamily: 'PretendardBold',
    fontSize: 24,
    includeFontPadding: false,
  },
  figure: { position: 'absolute', alignSelf: 'center' },
  name: {
    ...centered,
    color: color.fale,
    fontFamily: 'PretendardBold',
    fontSize: 24,
    includeFontPadding: false,
    paddingHorizontal: 24,
  },
  // 342:666: 아래 테두리 1 #aaa, 아래 여백 4
  dateLine: {
    position: 'absolute',
    alignSelf: 'center',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#aaaaaa',
  },
  date: {
    color: '#aaaaaa',
    fontFamily: 'PretendardLight',
    fontSize: 14,
    textAlign: 'center',
    includeFontPadding: false,
  },
  bonusLabel: {
    ...centered,
    color: color.yellow,
    fontFamily: 'PretendardRegular',
    fontSize: 12,
    includeFontPadding: false,
    ...glow(2),
  },
  bonusAmount: {
    ...centered,
    color: color.yellow,
    fontFamily: 'PretendardLight',
    fontSize: 16,
    includeFontPadding: false,
    ...glow(2),
  },
  // 342:674: 폭 322, 간격 12, 버튼 높이 48
  actions: { position: 'absolute', alignSelf: 'center', width: '80%', maxWidth: 322, gap: 12 },
  button: {
    height: 48,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 0px 4px 0px #f1f1f1',
  },
  buttonLight: { backgroundColor: color.fale },
  buttonDark: { backgroundColor: color.base, borderWidth: 1, borderColor: color.fale },
  buttonLightText: { color: color.base, fontFamily: 'PretendardRegular', fontSize: 16 },
  buttonDarkText: { color: color.fale, fontFamily: 'PretendardRegular', fontSize: 16 },
});
