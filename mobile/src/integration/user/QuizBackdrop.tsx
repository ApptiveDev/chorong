import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export function QuizBackIcon() {
  return (
    <Svg width={26.0001} height={21.9996} viewBox="0 0 26.0001 21.9996">
      <Path
        d="M9.58605 0.585786C10.3671 -0.195262 11.6331 -0.195262 12.4142 0.585786C13.1951 1.36685 13.1952 2.63291 12.4142 3.41391L6.82824 8.99985H24.0001C25.1046 8.99993 26.0001 9.89533 26.0001 10.9998C26 12.1043 25.1046 12.9998 24.0001 12.9998H6.82824L12.4142 18.5858C13.1951 19.3668 13.1952 20.6329 12.4142 21.4139C11.6332 22.1949 10.3671 22.1948 9.58605 21.4139L0.586053 12.4139C-0.146212 11.6816 -0.192433 10.5227 0.448358 9.73715L0.586053 9.58579L9.58605 0.585786Z"
        fill="#747474"
      />
    </Svg>
  );
}

export function QuizQuestionRule() {
  return (
    <Svg width={206.2} height={1.2} viewBox="0 0 206.2 1.2">
      <Path d="M0.6 0.6H205.6" stroke="#161616" strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

export function QuizBackdrop() {
  return (
    <View pointerEvents="none" style={s.backdrop}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="quizBackground" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#e4e4e4" />
            <Stop offset="0.52" stopColor="#f1f1f1" />
            <Stop offset="1" stopColor="#d1d1d1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#quizBackground)" />
      </Svg>
      <View style={[s.glow, s.glowTop]} />
      <View style={[s.glow, s.glowSmall, s.glowRight]} />
      <View style={[s.glow, s.glowSmall, s.glowLeft]} />
      <View style={[s.glow, s.glowSmall, s.glowBottom]} />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  glow: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f1f1f1',
    shadowColor: '#aaa',
    shadowOpacity: 1,
    shadowRadius: 28,
  },
  glowSmall: { width: 8, height: 8, borderRadius: 4 },
  glowTop: { left: '81%', top: '19%' },
  glowRight: { left: '87%', top: '24%' },
  glowLeft: { left: '14%', top: '73%' },
  glowBottom: { left: '64%', top: '89%' },
});
