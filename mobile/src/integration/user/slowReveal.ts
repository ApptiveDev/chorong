// 사진이 아주 천천히 드러나는 SINGLE 표시 방식(SHARPEN·ZOOM_OUT)의 진행 값(0 → 1).
// 사진이 뜬 뒤 durationMs 동안 일정한 속도로 오르고, 보기를 고르면 멈추고,
// 채점 결과가 나오면 finishMs 만에 1 까지 마저 오른다.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

export const SLOW_REVEAL_FINISH_MS = 800;

export function useSlowReveal({
  started,
  paused,
  finish,
  durationMs,
  finishMs = SLOW_REVEAL_FINISH_MS,
}: {
  // 사진이 떴는지. 그 전에는 시작하지 않는다.
  started: boolean;
  // 보기를 고른 뒤(채점 중)에는 멈춘다.
  paused: boolean;
  // 채점 결과가 나오면 끝까지 빠르게 마저 진행한다.
  finish: boolean;
  durationMs: number;
  finishMs?: number;
}): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const current = useRef(0);

  useEffect(() => {
    if (!started) return;
    let active = true;
    const run = (duration: number, easing: (value: number) => number) =>
      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then((reduceMotion) => {
          if (!active) return;
          // 동작 줄이기: 천천히 드러나는 것은 문제 자체라 유지하고, 마무리만 즉시 끝낸다.
          if (reduceMotion && finish) return progress.setValue(1);
          Animated.timing(progress, {
            toValue: 1,
            duration,
            easing,
            useNativeDriver: Platform.OS !== 'web',
          }).start();
        });
    if (finish) void run(finishMs, Easing.out(Easing.cubic));
    else if (!paused)
      // 멈췄다 다시 시작하면(제출 실패) 남은 만큼만 같은 속도로 이어 간다.
      void run(durationMs * (1 - current.current), Easing.linear);
    return () => {
      active = false;
      // 네이티브 드라이버 중에는 리스너가 값을 받지 못하므로 멈출 때 받은 값으로 위치를 기억한다.
      progress.stopAnimation((value) => {
        current.current = value;
      });
    };
  }, [started, paused, finish, durationMs, finishMs, progress]);

  return progress;
}
