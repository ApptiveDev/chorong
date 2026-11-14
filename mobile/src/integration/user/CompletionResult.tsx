import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  type ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

const completionArcSource = require('../../../assets/completion-arc.png');
const completionDustSource = require('../../../assets/completion-dust.png');
// Figma 656:3634 Frame 70(164×164, 고리 없는 별). 기존 completion-star.png 는 고리가 있는 L06_1~3 용이다.
export const completionOrbSource = require('../../../assets/completion-orb.png');

// Figma 656:2109 에너지 아이콘(Group 25, 8×14). 학습 홈 칩(757:3122)은 몸통 #F1F1F1,
// 팝오버(669:1384)는 같은 모양을 9.14×16 으로 키우고 몸통 #161616 · 칸 #F1F1F1 로 쓴다.
export function EnergyIcon({
  width = 8,
  height = 14,
  body = '#E4E4E4',
  cell = '#161616',
}: {
  width?: number;
  height?: number;
  body?: string;
  cell?: string;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 8 14" fill="none">
      <Path
        d="M7 2C7.55228 2 8 2.44772 8 3V13C8 13.5523 7.55228 14 7 14H1C0.447715 14 1.61065e-08 13.5523 0 13V3C0 2.44772 0.447715 2 1 2H2V1C2 0.447715 2.44772 0 3 0H5C5.55228 0 6 0.447715 6 1V2H7Z"
        fill={body}
      />
      <Rect x={1} y={11} width={6} height={2} fill={cell} />
      <Rect x={1} y={8} width={6} height={2} fill={cell} />
    </Svg>
  );
}

// 완료 화면 별 이미지. 이미지가 로드되면 0.7초 동안 나타난다.
export function CompletionStar({ source, size }: { source: ImageSourcePropType; size: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  useEffect(() => {
    return () => progress.stopAnimation();
  }, [progress]);
  const reveal = () => {
    if (started.current) return;
    started.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: 700,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        opacity: progress,
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '0deg'] }) },
        ],
      }}
    >
      <Image
        source={source}
        onLoad={reveal}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

// Figma 402×874 좌표를 화면에 맞춘다. StudyScreen 기존 완료 화면(L06_1~3)과 같은 계산이다.
export function useCompletionLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = Math.min(Math.min(width, 480) / 402, height / 874, 1);
  return {
    scale,
    top: (value: number) => Math.max(0, value * scale - insets.top),
    bottom: Math.max(12, 89 * scale - insets.bottom),
  };
}

// Figma L06_4(656:3631)·L06_5(656:3655)·L06_6(740:1879)·L06_7(740:1903) 완료 화면.
// 표시할 값은 모두 호출하는 쪽이 서버 응답에서 읽어 넘긴다.
export function CompletionResult({
  title,
  lessonTitle,
  score,
  stardust = 0,
  energySpent = 0,
  notice,
  action,
}: {
  title: string;
  // 밑줄 친 레슨명(L06_4·L06_5)
  lessonTitle?: string;
  // 정답 수(L06_6·L06_7)
  score?: string;
  stardust?: number;
  energySpent?: number;
  notice?: string;
  // 화면 자체 버튼. StudyScreen 은 기존 하단 버튼을 그대로 쓰므로 넘기지 않는다.
  action?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  const { scale, top, bottom } = useCompletionLayout();
  return (
    <View style={s.root}>
      {/* Ellipse 6: 기존 완료 화면과 같은 호 */}
      <Image
        source={completionArcSource}
        resizeMode="stretch"
        style={[s.arc, { top: top(209), height: 463 * scale }]}
      />
      <View style={[s.orbWrap, { top: top(148) }]}>
        <CompletionStar source={completionOrbSource} size={164 * scale} />
      </View>
      <Text style={[s.title, { top: top(400) }]}>{title}</Text>
      {lessonTitle ? (
        <View style={[s.lessonUnderline, { top: top(457) }]}>
          <Text style={s.lessonTitle}>{lessonTitle}</Text>
        </View>
      ) : null}
      {score ? (
        // Frame 81: 높이 20, 아래 여백 4, Pretendard Medium 16 #d9d9d9
        <View style={[s.lineBox, { top: top(457) }]}>
          <Text style={s.score}>{score}</Text>
        </View>
      ) : null}
      {stardust > 0 ? (
        // Frame 58: Star 1(16, 그림자 포함 18×20) + 간격 8 + 별가루 문구. 그림자만큼 2 위에서 시작한다.
        <View style={[s.rewardRow, { top: top(527) }]}>
          <Image source={completionDustSource} style={s.rewardIcon} resizeMode="contain" />
          <Text style={s.rewardAmount}>별가루 +{stardust}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={[s.lineBox, { top: top(529) }]}>
          <Text style={s.notice}>{notice}</Text>
        </View>
      ) : null}
      {energySpent > 0 ? (
        // Frame 134: 별가루 줄 아래 12
        <View style={[s.energyRow, { top: top(560) }]}>
          <EnergyIcon />
          <Text style={s.energyText}>에너지 -{energySpent}</Text>
        </View>
      ) : null}
      {action ? (
        <View style={[s.footer, { bottom }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !!action.disabled }}
            disabled={action.disabled}
            onPress={action.onPress}
            style={[s.action, action.disabled && s.disabled]}
          >
            <Text style={s.actionText}>{action.label}</Text>
          </Pressable>
        </View>
      ) : null}
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

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', backgroundColor: '#161616' },
  arc: { position: 'absolute', left: 0, right: 0, width: '100%' },
  orbWrap: { position: 'absolute', alignSelf: 'center' },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: '#f1f1f1',
    fontSize: 24,
    fontFamily: 'PretendardBold',
    textAlign: 'center',
    ...glow(3),
  },
  lessonUnderline: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '80%',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#aaa',
  },
  lessonTitle: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 16,
    includeFontPadding: false,
    fontFamily: 'PretendardLight',
    textAlign: 'center',
  },
  lineBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
    paddingBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: { color: '#d9d9d9', fontSize: 16, fontFamily: 'PretendardMedium', textAlign: 'center' },
  notice: { color: '#d9d9d9', fontSize: 16, fontFamily: 'PretendardRegular', textAlign: 'center' },
  rewardRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rewardIcon: { width: 18, height: 20 },
  rewardAmount: {
    color: '#ffde23',
    fontSize: 16,
    fontFamily: 'PretendardLight',
    ...glow(2),
  },
  energyRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
  },
  energyText: {
    color: '#e4e4e4',
    fontSize: 14,
    fontFamily: 'PretendardLight',
    ...glow(1),
  },
  // StudyScreen completionFooter·completionAction 과 같은 값(Figma Frame 62: 322×48)
  footer: {
    position: 'absolute',
    alignSelf: 'center',
    width: '80%',
    maxWidth: 322,
    height: 48,
  },
  action: {
    width: '100%',
    minHeight: 48,
    borderRadius: 4,
    backgroundColor: '#f1f1f1',
    boxShadow: '0px 0px 4px 0px #f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: {
    color: '#161616',
    fontSize: 16,
    fontFamily: 'PretendardRegular',
    fontWeight: '400',
  },
  disabled: { opacity: 0.45 },
});
