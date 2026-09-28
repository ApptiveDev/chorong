import { useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { styles } from './shared';

type Point = { x: number; y: number };
export function windowPoint(event: GestureResponderEvent): Point {
  return {
    x: event.nativeEvent.pageX - (Platform.OS === 'web' ? window.scrollX : 0),
    y: event.nativeEvent.pageY - (Platform.OS === 'web' ? window.scrollY : 0),
  };
}
export function useDrag({
  disabled,
  start,
  move,
  end,
  cancel,
}: {
  disabled: boolean;
  start?: (event: GestureResponderEvent) => void;
  move?: (event: GestureResponderEvent, gesture: PanResponderGestureState) => void;
  end?: (event: GestureResponderEvent, gesture: PanResponderGestureState) => void;
  cancel?: () => void;
}) {
  const callbacks = useRef({ disabled, start, move, end, cancel });
  callbacks.current = { disabled, start, move, end, cancel };
  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !callbacks.current.disabled,
        onMoveShouldSetPanResponder: () => !callbacks.current.disabled,
        onPanResponderGrant: (e) => callbacks.current.start?.(e),
        onPanResponderMove: (e, g) => {
          if (!callbacks.current.disabled) callbacks.current.move?.(e, g);
        },
        onPanResponderRelease: (e, g) => {
          if (!callbacks.current.disabled) callbacks.current.end?.(e, g);
          else callbacks.current.cancel?.();
        },
        onPanResponderTerminate: () => callbacks.current.cancel?.(),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [],
  ).panHandlers;
}
export function DragHandle({
  label,
  disabled,
  onDrop,
}: {
  label: string;
  disabled: boolean;
  onDrop: (point: Point) => void;
}) {
  const offset = useRef(new Animated.ValueXY()).current;
  const reset = () => offset.setValue({ x: 0, y: 0 });
  const handlers = useDrag({
    disabled,
    start: reset,
    move: (_, g) => offset.setValue({ x: g.dx, y: g.dy }),
    end: (e, g) => {
      reset();
      if (Math.abs(g.dx) + Math.abs(g.dy) > 8) onDrop(windowPoint(e));
    },
    cancel: reset,
  });
  return (
    <Animated.View
      {...handlers}
      accessibilityLabel={`${label} 끌기`}
      style={[
        styles.gesture,
        disabled && styles.disabled,
        { transform: offset.getTranslateTransform(), zIndex: 1 },
      ]}
    >
      <Text>↕ {label} 끌기</Text>
    </Animated.View>
  );
}
export function dropOn(point: Point, targets: Map<string, View>, onHit: (id: string) => void) {
  targets.forEach((view, id) =>
    view.measureInWindow((x, y, width, height) => {
      if (point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height) onHit(id);
    }),
  );
}
