import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

// 기기의 '동작 줄이기' 설정. 켜져 있으면 장식용 애니메이션을 멈춘다.
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduceMotion;
}

// 먼지처럼 천천히 떠다니기. 제자리에서 출발해 가로 ±dx, 세로 ±dy 안을 오간다.
// 가로·세로 주기를 다르게 주면 같은 길을 되풀이하지 않고 둥둥 떠다니는 것처럼 보인다.
export function useDrift({
  dx,
  dy,
  durationX,
  durationY,
  reduceMotion,
}: {
  dx: number;
  dy: number;
  durationX: number;
  durationY: number;
  reduceMotion: boolean;
}) {
  const x = useRef(new Animated.Value(0.5)).current;
  const y = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduceMotion) {
      x.setValue(0.5);
      y.setValue(0.5);
      return;
    }
    const easing = Easing.inOut(Easing.sin);
    const useNativeDriver = Platform.OS !== 'web';
    // 0.5(제자리) → 1 → 0 → 0.5 를 반복한다.
    const swing = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: duration / 4, easing, useNativeDriver }),
          Animated.timing(value, { toValue: 0, duration: duration / 2, easing, useNativeDriver }),
          Animated.timing(value, { toValue: 0.5, duration: duration / 4, easing, useNativeDriver }),
        ]),
      );
    const loops = [swing(x, durationX), swing(y, durationY)];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [x, y, reduceMotion, durationX, durationY]);
  return {
    translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-dx, dx] }),
    translateY: y.interpolate({ inputRange: [0, 1], outputRange: [-dy, dy] }),
  };
}

// 별 반짝임. 1 → min → 1 을 duration 주기로 반복하는 opacity 값을 돌려준다.
// delay 로 시작 시점을 엇갈려 여러 별이 동시에 깜빡이지 않게 한다.
export function useTwinkle({
  duration,
  delay = 0,
  min = 0.35,
  reduceMotion,
}: {
  duration: number;
  delay?: number;
  min?: number;
  reduceMotion: boolean;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const half = duration / 2;
    const easing = Easing.inOut(Easing.sin);
    const useNativeDriver = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: min, duration: half, easing, useNativeDriver }),
        Animated.timing(opacity, { toValue: 1, duration: half, easing, useNativeDriver }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [opacity, reduceMotion, duration, delay, min]);
  return opacity;
}
