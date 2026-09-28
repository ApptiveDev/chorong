import { useRef } from 'react';
import { Text, View } from 'react-native';
import { moveItem } from '../../lib/quiz-state';
import type { QuizConfigs } from '../../types/quiz';
import { DragHandle, dropOn } from './gestures';
import { ItemContent, itemLabel, QuizButton, styles } from './shared';

export function SortQuiz({
  config,
  order,
  onChange,
  disabled,
}: {
  config: QuizConfigs['SORT'];
  order: string[];
  onChange: (order: string[]) => void;
  disabled: boolean;
}) {
  const targets = useRef(new Map<string, View>()).current;
  const current = useRef({ order, disabled, onChange });
  current.current = { order, disabled, onChange };
  const move = (item: string, target: string) => {
    const state = current.current;
    if (!state.disabled)
      state.onChange(moveItem(state.order, state.order.indexOf(item), state.order.indexOf(target)));
  };
  return (
    <View style={styles.stack}>
      <Text style={styles.muted}>끌어서 순서를 바꾸거나 위·아래 이동 버튼을 누르세요.</Text>
      {order.map((id, index) => {
        const item = config.items.find((i) => i.id === id)!;
        const label = itemLabel(item);
        return (
          <View
            key={id}
            collapsable={false}
            ref={(view) => {
              if (view) targets.set(id, view);
              else targets.delete(id);
            }}
            accessibilityLabel={`${index + 1}번째: ${label}`}
            style={styles.section}
          >
            <Text>{index + 1}번째</Text>
            <DragHandle
              label={label}
              disabled={disabled}
              onDrop={(point) => dropOn(point, targets, (target) => move(id, target))}
            />
            <ItemContent item={item} />
            <View style={styles.row}>
              <QuizButton
                label={`${label} 위로 이동`}
                disabled={disabled || index === 0}
                onPress={() => onChange(moveItem(order, index, index - 1))}
              />
              <QuizButton
                label={`${label} 아래로 이동`}
                disabled={disabled || index === order.length - 1}
                onPress={() => onChange(moveItem(order, index, index + 1))}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
