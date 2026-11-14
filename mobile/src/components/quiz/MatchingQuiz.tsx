import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { connectMatch } from '../../lib/quiz-state';
import type { QuizConfigs, QuizItem } from '../../types/quiz';
import { ItemContent, itemLabel, styles } from './shared';

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
  const linked = (item: QuizItem, side: 'left' | 'right') =>
    side === 'left' ? Object.hasOwn(matches, item.id) : Object.values(matches).includes(item.id);
  const pairLabel = (item: QuizItem, side: 'left' | 'right') => {
    const index = config.leftItems.findIndex((leftItem) =>
      side === 'left' ? leftItem.id === item.id : matches[leftItem.id] === item.id,
    );
    return index < 0 ? '' : ` ${String.fromCharCode(65 + index)}`;
  };
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
          matchStyles.option,
          linked(item, side) && matchStyles.linked,
          side === 'left' && left === item.id && matchStyles.selected,
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
        <ItemContent
          item={item}
          textColor={left === item.id ? '#594567' : linked(item, side) ? '#477656' : '#282636'}
        />
        {linked(item, side) ? <Text style={matchStyles.pair}>{pairLabel(item, side)}</Text> : null}
      </Pressable>
    );
  };
  return (
    <View style={styles.stack}>
      <Text style={styles.muted}>왼쪽 항목을 고른 뒤 오른쪽 항목을 누르세요.</Text>
      <Text accessibilityLiveRegion="polite">
        {selected ? `${itemLabel(selected)} 선택됨` : '연결할 항목 선택'}
      </Text>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <View style={styles.column}>{config.leftItems.map((i) => choice(i, 'left'))}</View>
        <View style={styles.column}>{config.rightItems.map((i) => choice(i, 'right'))}</View>
      </View>
      {selected && Object.hasOwn(matches, selected.id) ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => {
            onChange(
              Object.fromEntries(Object.entries(matches).filter(([id]) => id !== selected.id)),
            );
            setLeft(null);
          }}
          style={matchStyles.unlink}
        >
          <Text style={matchStyles.unlinkText}>{itemLabel(selected)} 연결 해제</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const matchStyles = StyleSheet.create({
  option: {
    minHeight: 57,
    borderWidth: 1,
    borderColor: '#e6e0ec',
    borderRadius: 13,
    backgroundColor: '#fff',
    padding: 12,
    justifyContent: 'center',
  },
  selected: { borderColor: '#746287', backgroundColor: '#f4f0f8' },
  linked: { borderColor: '#acc1b0', backgroundColor: '#eef6f0', opacity: 0.65 },
  pair: { color: '#477656', fontWeight: '700' },
  unlink: { alignSelf: 'flex-start', paddingVertical: 8 },
  unlinkText: { color: '#746287', fontSize: 12 },
});
