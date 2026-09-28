import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { QuizConfigs } from '../../types/quiz';
import { DragHandle, dropOn } from './gestures';
import { ItemContent, itemLabel, QuizButton, styles } from './shared';

export function DragDropQuiz({
  config,
  placements,
  onChange,
  disabled,
}: {
  config: QuizConfigs['DRAG_DROP'];
  placements: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const targets = useRef(new Map<string, View>()).current;
  const current = useRef({ placements, disabled, onChange });
  current.current = { placements, disabled, onChange };
  const place = (item: string, target: string) => {
    if (current.current.disabled) return;
    current.current.onChange({ ...current.current.placements, [item]: target });
    setSelected(null);
  };
  return (
    <View style={styles.stack}>
      <Text style={styles.muted}>
        카드를 영역으로 끌거나, 카드 선택 후 영역의 배치 버튼을 누르세요.
      </Text>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <View style={styles.column}>
          {config.items.map((item) => {
            const target = config.targets.find(
              (t) => Object.hasOwn(placements, item.id) && t.id === placements[item.id],
            );
            return (
              <View key={item.id} style={[styles.section, selected === item.id && styles.selected]}>
                <DragHandle
                  label={itemLabel(item)}
                  disabled={disabled}
                  onDrop={(point) => dropOn(point, targets, (targetId) => place(item.id, targetId))}
                />
                <ItemContent item={item} />
                <Text>배치: {target ? itemLabel(target) : '미배치'}</Text>
                <QuizButton
                  label={`${itemLabel(item)} 선택`}
                  selected={selected === item.id}
                  disabled={disabled}
                  onPress={() => setSelected(selected === item.id ? null : item.id)}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.column}>
          {config.targets.map((target) => (
            <View
              key={target.id}
              collapsable={false}
              ref={(view) => {
                if (view) targets.set(target.id, view);
                else targets.delete(target.id);
              }}
              accessibilityLabel={`${itemLabel(target)} 배치 영역`}
              style={styles.section}
            >
              <ItemContent item={target} />
              <Text>
                {config.items
                  .filter((i) => Object.hasOwn(placements, i.id) && placements[i.id] === target.id)
                  .map(itemLabel)
                  .join(', ') || '배치된 카드 없음'}
              </Text>
              <QuizButton
                label={`${itemLabel(target)}에 배치`}
                disabled={disabled || selected === null}
                onPress={() => {
                  if (selected) place(selected, target.id);
                }}
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
