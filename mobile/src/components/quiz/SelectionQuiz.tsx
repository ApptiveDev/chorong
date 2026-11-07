import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toggleSelection } from '../../lib/quiz-state';
import type { QuizItem, SelectionConfig } from '../../types/quiz';
import { ItemContent, itemLabel, styles } from './shared';

export function SelectionQuiz({
  config,
  items,
  selected,
  onChange,
  disabled,
  wireframe = false,
  graded,
}: {
  config: SelectionConfig;
  items: QuizItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  wireframe?: boolean;
  graded?: boolean;
}) {
  const single = config.selectionType === 'SINGLE';
  const limit = single ? 1 : (config.maxSelections ?? items.length);
  return (
    <View style={wireframe ? choiceStyles.stack : styles.stack}>
      {wireframe ? (
        !single ? (
          <Text style={styles.muted}>여러 개 선택 · 최대 {limit}개</Text>
        ) : null
      ) : (
        <Text style={styles.muted}>
          {single ? '하나 선택' : `여러 개 선택 (최대 ${limit}개)`} · {selected.length}개 선택됨
        </Text>
      )}
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
            style={[
              wireframe ? choiceStyles.option : styles.button,
              checked && (wireframe ? choiceStyles.selected : styles.selected),
              wireframe && checked && graded === true && choiceStyles.correct,
              wireframe && checked && graded === false && choiceStyles.wrong,
              blocked && (!disabled || graded === undefined) && styles.disabled,
            ]}
          >
            {wireframe ? (
              !single ? (
                <Text style={choiceStyles.marker}>{checked ? '●' : '○'}</Text>
              ) : null
            ) : (
              <Text style={styles.muted}>{checked ? '선택됨' : '선택'}</Text>
            )}
            <ItemContent
              item={item}
              textColor={
                wireframe
                  ? checked
                    ? graded === true
                      ? '#477656'
                      : graded === false
                        ? '#ad6262'
                        : '#594567'
                    : '#282636'
                  : undefined
              }
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const choiceStyles = StyleSheet.create({
  stack: { gap: 10 },
  option: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#e6e0ec',
    backgroundColor: '#fff',
    borderRadius: 13,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selected: { borderColor: '#746287', backgroundColor: '#f4f0f8' },
  correct: { borderColor: '#83ac92', backgroundColor: '#eff7f1' },
  wrong: { borderColor: '#d3a4a4', backgroundColor: '#fdf1f1' },
  marker: { color: '#746287', fontSize: 18 },
});
