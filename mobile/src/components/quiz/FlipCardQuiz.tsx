import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { QuizConfigs } from '../../types/quiz';
import { ItemContent, styles } from './shared';

export function FlipCardQuiz({
  config,
  flipped,
  onChange,
  disabled,
}: {
  config: QuizConfigs['FLIP_CARD'];
  flipped: boolean;
  onChange: (flipped: boolean) => void;
  disabled: boolean;
}) {
  const [back, setBack] = useState(false);
  return (
    <View style={styles.stack}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={back ? '카드 앞면 보기' : '카드 뒤집기'}
        disabled={disabled}
        aria-disabled={disabled}
        onPress={() => {
          setBack(!back);
          if (!back) onChange(true);
        }}
        style={[styles.button, disabled && styles.disabled]}
      >
        <Text style={styles.muted}>
          {back ? '뒷면 · 누르면 앞면 보기' : '앞면 · 누르면 뒤집기'}
        </Text>
        <ItemContent item={back ? config.back : config.front} />
      </Pressable>
      <Text accessibilityLiveRegion="polite">
        {flipped ? '뒷면 확인 완료' : '뒷면을 확인해 주세요.'}
      </Text>
    </View>
  );
}
