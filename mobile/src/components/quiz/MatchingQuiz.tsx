import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { connectMatch } from '../../lib/quiz-state';
import type { QuizConfigs, QuizItem } from '../../types/quiz';
import { ItemContent, itemLabel, QuizButton, styles } from './shared';

export function MatchingQuiz({
  config,
  matches,
  onChange,
  disabled,
}: {
  config: QuizConfigs['MATCHING'];
  matches: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled: boolean;
}) {
  const [left, setLeft] = useState<string | null>(null);
  const selected = config.leftItems.find((i) => i.id === left);
  const choice = (item: QuizItem, side: 'left' | 'right') => {
    const blocked = disabled || (side === 'right' && left === null);
    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`${side === 'left' ? '왼쪽' : '오른쪽'} 항목: ${itemLabel(item)}`}
        aria-disabled={blocked}
        aria-selected={side === 'left' && left === item.id}
        disabled={blocked}
        style={[
          styles.button,
          side === 'left' && left === item.id && styles.selected,
          blocked && styles.disabled,
        ]}
        onPress={() => {
          if (side === 'left') setLeft(item.id);
          else if (left) {
            onChange(connectMatch(matches, left, item.id));
            setLeft(null);
          }
        }}
      >
        <ItemContent item={item} />
      </Pressable>
    );
  };
  return (
    <View style={styles.stack}>
      <Text style={styles.muted}>
        왼쪽 항목을 고른 뒤 오른쪽 항목을 누르세요. 이미 연결된 항목을 고르면 기존 연결이 바뀝니다.
      </Text>
      <Text accessibilityLiveRegion="polite">
        연결할 항목: {selected ? itemLabel(selected) : '왼쪽에서 선택'}
      </Text>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <View style={styles.column}>{config.leftItems.map((i) => choice(i, 'left'))}</View>
        <View style={styles.column}>{config.rightItems.map((i) => choice(i, 'right'))}</View>
      </View>
      {config.leftItems.map((item) => {
        const right = config.rightItems.find(
          (r) => Object.hasOwn(matches, item.id) && r.id === matches[item.id],
        );
        return (
          <View key={item.id} style={styles.stack}>
            <Text>
              {itemLabel(item)} → {right ? itemLabel(right) : '미연결'}
            </Text>
            {right ? (
              <QuizButton
                label={`${itemLabel(item)} 연결 해제`}
                disabled={disabled}
                onPress={() => {
                  onChange(
                    Object.fromEntries(Object.entries(matches).filter(([id]) => id !== item.id)),
                  );
                }}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
