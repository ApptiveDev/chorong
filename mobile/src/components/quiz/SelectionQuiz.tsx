import { Pressable, Text, View } from 'react-native';
import { toggleSelection } from '../../lib/quiz-state';
import type { QuizItem, SelectionConfig } from '../../types/quiz';
import { ItemContent, itemLabel, styles } from './shared';

export function SelectionQuiz({
  config,
  items,
  selected,
  onChange,
  disabled,
}: {
  config: SelectionConfig;
  items: QuizItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const single = config.selectionType === 'SINGLE';
  const limit = single ? 1 : (config.maxSelections ?? items.length);
  return (
    <View style={styles.stack}>
      <Text style={styles.muted}>
        {single ? '하나 선택' : `여러 개 선택 (최대 ${limit}개)`} · {selected.length}개 선택됨
      </Text>
      {items.map((item) => {
        const checked = selected.includes(item.id);
        const blocked = disabled || (!single && !checked && selected.length >= limit);
        return (
          <Pressable
            key={item.id}
            accessibilityRole={single ? 'radio' : 'checkbox'}
            accessibilityLabel={itemLabel(item)}
            aria-checked={checked}
            aria-disabled={blocked}
            disabled={blocked}
            onPress={() => onChange(toggleSelection(selected, item.id, single, limit))}
            style={[styles.button, checked && styles.selected, blocked && styles.disabled]}
          >
            <Text style={styles.muted}>{checked ? '선택됨' : '선택'}</Text>
            <ItemContent item={item} />
          </Pressable>
        );
      })}
    </View>
  );
}
