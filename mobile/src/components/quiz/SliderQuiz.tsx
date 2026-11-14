import { useRef } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { sliderIndex, sliderSteps, sliderValue } from '../../lib/quiz-state';
import type { SliderConfig } from '../../types/quiz';
import { useDrag, windowPoint } from './gestures';
import { styles } from './shared';

export function SliderQuiz({
  config,
  value,
  onChange,
  disabled,
}: {
  config: SliderConfig;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const track = useRef<View>(null);
  const geometry = useRef({ x: 0, width: 0 });
  const steps = sliderSteps(config);
  const index = sliderIndex(config, value);
  const latest = useRef({ disabled, onChange, config });
  latest.current = { disabled, onChange, config };
  const changeAt = (x: number) => {
    if (latest.current.disabled || geometry.current.width <= 0) return;
    latest.current.onChange(
      sliderValue(
        latest.current.config,
        ((x - geometry.current.x) / geometry.current.width) * sliderSteps(latest.current.config),
      ),
    );
  };
  const start = (event: GestureResponderEvent) => {
    const { x } = windowPoint(event);
    track.current?.measureInWindow((left, _, width) => {
      geometry.current = { x: left, width };
      changeAt(x);
    });
  };
  const handlers = useDrag({
    disabled,
    start,
    move: (e) => changeAt(windowPoint(e).x),
    end: (e) => changeAt(windowPoint(e).x),
  });
  const change = (next: number) => onChange(sliderValue(config, next));
  return (
    <View style={styles.stack}>
      {config.showValue !== false ? (
        <Text style={rangeStyles.value} accessibilityLiveRegion="polite">
          {value}
          {config.unit ?? ''}
        </Text>
      ) : null}
      <View
        ref={track}
        {...handlers}
        accessibilityRole="adjustable"
        role="slider"
        accessibilityLabel="퀴즈 값 조절"
        aria-disabled={disabled}
        aria-valuemin={config.min}
        aria-valuemax={config.max}
        aria-valuenow={value}
        accessibilityActions={[
          { name: 'increment', label: '값 증가' },
          { name: 'decrement', label: '값 감소' },
        ]}
        onAccessibilityAction={(e) => {
          if (!disabled) change(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1));
        }}
        style={[styles.gesture, rangeStyles.track]}
      >
        <View pointerEvents="none" style={rangeStyles.rail} />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${steps ? (index / steps) * 100 : 0}%`,
            marginLeft: -11,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#746284',
          }}
        />
      </View>
      <View style={rangeStyles.ticks}>
        {[0, Math.round(steps / 3), Math.round((steps * 2) / 3), steps]
          .filter((tick, position, all) => all.indexOf(tick) === position)
          .map((tick) => (
            <Text key={tick} style={rangeStyles.tick}>
              {sliderValue(config, tick)}
              {config.unit ?? ''}
            </Text>
          ))}
      </View>
    </View>
  );
}

const rangeStyles = StyleSheet.create({
  value: { color: '#746284', fontSize: 31, fontWeight: '600', textAlign: 'center' },
  track: { padding: 0, height: 54, justifyContent: 'center', backgroundColor: 'transparent' },
  rail: { height: 6, backgroundColor: '#e6e0ec', borderRadius: 3 },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { color: '#aaa1b3', fontSize: 11 },
});
