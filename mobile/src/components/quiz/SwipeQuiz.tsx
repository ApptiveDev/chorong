import { useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import type { QuizConfigs } from '../../types/quiz';
import { useDrag } from './gestures';
import { QuizButton, styles } from './shared';

export function SwipeQuiz({
  config,
  value,
  onChange,
  disabled,
}: {
  config: QuizConfigs['SWIPE'];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const reset = () => offset.setValue(0);
  const handlers = useDrag({
    disabled,
    start: reset,
    move: (_, g) => offset.setValue(g.dx),
    end: (_, g) => {
      reset();
      if (Math.abs(g.dx) >= 45 && Math.abs(g.dx) > Math.abs(g.dy))
        onChange(g.dx > 0 ? config.right.value : config.left.value);
    },
    cancel: reset,
  });
  const chosen = [config.left, config.right].find((choice) => choice.value === value);
  return (
    <View style={styles.stack}>
      <Animated.View
        {...handlers}
        accessibilityLabel="좌우로 밀어 답 선택"
        style={[styles.gesture, { paddingVertical: 28, transform: [{ translateX: offset }] }]}
      >
        <Text>
          ← {config.left.label} · 좌우로 밀기 · {config.right.label} →
        </Text>
      </Animated.View>
      <View style={styles.row}>
        <QuizButton
          label={`왼쪽 선택: ${config.left.label}`}
          selected={value === config.left.value}
          disabled={disabled}
          onPress={() => onChange(config.left.value)}
        />
        <QuizButton
          label={`오른쪽 선택: ${config.right.label}`}
          selected={value === config.right.value}
          disabled={disabled}
          onPress={() => onChange(config.right.value)}
        />
      </View>
      <Text accessibilityLiveRegion="polite">선택한 답: {chosen?.label ?? '없음'}</Text>
    </View>
  );
}
