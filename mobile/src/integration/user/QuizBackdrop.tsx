import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = Math.min(width / 402, height / 874, 1);
  const backgroundWidth = Math.min(width, 480);
  const directionX = Math.sin((196.2241314901484 * Math.PI) / 180);
  const directionY = -Math.cos((196.2241314901484 * Math.PI) / 180);
  const gradientLength = Math.abs(backgroundWidth * directionX) + Math.abs(height * directionY);
  const gradientStartX = (backgroundWidth - directionX * gradientLength) / 2;
  const gradientStartY = (height - directionY * gradientLength) / 2;
  const ellipse = (x: number, y: number, size: number) => ({
    left: x * scale,
    top: y * scale,
    width: size * scale,
    height: size * scale,
    borderRadius: (size * scale) / 2,
  });

  return (
    <View pointerEvents="none" style={[s.backdrop, { top: -insets.top, bottom: -insets.bottom }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient
            id="quizBackground"
            gradientUnits="userSpaceOnUse"
            x1={gradientStartX}
            y1={gradientStartY}
            x2={gradientStartX + directionX * gradientLength * 1.074}
            y2={gradientStartY + directionY * gradientLength * 1.074}
          >
            <Stop offset="0" stopColor="#f1f1f1" />
            <Stop offset={0.65356 / 1.074} stopColor="#f1f1f1" />
            <Stop offset="1" stopColor="#161616" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="#e4e4e4" />
        <Rect width="100%" height="100%" fill="url(#quizBackground)" opacity={0.2} />
      </Svg>
      <View style={[s.ellipse, ellipse(324, 164, 12)]} />
      <View style={[s.ellipse, ellipse(346, 212, 8)]} />
      <View style={[s.ellipse, ellipse(56, 640, 8)]} />
      <View style={[s.ellipse, ellipse(256, 780, 8)]} />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  // Figma Ellipse: box-shadow 0 0 28px 0 Primary/Lght(#AAAAAA), backdrop-filter blur(12px).
  // 배경 블러는 웹에서만 적용된다. 네이티브에는 블러 라이브러리가 없다.
  ellipse: {
    position: 'absolute',
    backgroundColor: '#f1f1f1',
    boxShadow: '0px 0px 28px 0px #aaaaaa',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(12px)' } as object) : null),
  },
});
