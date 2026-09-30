import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { quizErrorMessage } from '../../lib/quiz';
import type {
  CardPair,
  FlipCardUserResponse,
  QuizConfigs,
  QuizPreviewResult,
} from '../../types/quiz';
import { ItemContent, itemLabel, QuizButton, styles } from './shared';

export function FlipCardQuiz({
  config,
  pairs,
  onChange,
  checkPairs,
  onComplete,
  disabled,
}: {
  config: QuizConfigs['FLIP_CARD'];
  pairs: CardPair[];
  onChange: (pairs: CardPair[]) => void;
  checkPairs: (response: FlipCardUserResponse) => Promise<QuizPreviewResult>;
  onComplete: (result: QuizPreviewResult) => void;
  disabled: boolean;
}) {
  const [opened, setOpened] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('카드 두 장을 뒤집어 짝을 찾아보세요.');
  const [error, setError] = useState<string | null>(null);
  const selected = useRef<string[]>([]);
  const locked = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matched = new Set(pairs.flatMap((pair) => [pair.firstCardId, pair.secondCardId]));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);
  const close = () => {
    selected.current = [];
    setOpened([]);
    locked.current = false;
    setChecking(false);
  };
  const flip = async (id: string) => {
    if (disabled || locked.current || matched.has(id) || selected.current.includes(id)) return;
    setError(null);
    const nextOpened = [...selected.current, id];
    selected.current = nextOpened;
    setOpened(nextOpened);
    if (nextOpened.length === 1) {
      setMessage('한 장을 더 뒤집어 주세요.');
      return;
    }
    locked.current = true;
    setChecking(true);
    setMessage('짝을 확인하고 있습니다.');
    const next = [...pairs, { firstCardId: nextOpened[0], secondCardId: nextOpened[1] }];
    try {
      const result = await checkPairs({ pairs: next });
      if (!mounted.current) return;
      if (
        !result.graded ||
        typeof result.correct !== 'boolean' ||
        result.completed !== (result.correct && next.length * 2 === config.cards.length)
      ) {
        throw new Error('짝 확인 결과를 읽지 못했습니다. 다시 시도해 주세요.');
      }
      if (result.correct) {
        onChange(next);
        close();
        setMessage(
          result.completed ? '모든 짝을 맞췄습니다!' : '맞는 짝입니다. 다음 짝을 찾아보세요.',
        );
        if (result.completed) onComplete(result);
      } else {
        setMessage('맞지 않는 짝입니다. 다시 찾아보세요.');
        timer.current = setTimeout(() => {
          timer.current = null;
          if (mounted.current) close();
        }, 900);
      }
    } catch (e) {
      if (mounted.current) {
        close();
        setMessage('카드 두 장을 다시 선택해 주세요.');
        setError(quizErrorMessage(e));
      }
    }
  };
  return (
    <View style={styles.stack}>
      <Text style={styles.muted}>
        맞춘 짝 {pairs.length} / {config.cards.length / 2}
      </Text>
      <View style={styles.row}>
        {config.cards.map((card, index) => {
          const done = matched.has(card.id);
          const visible = done || opened.includes(card.id);
          const blocked = disabled || checking || done || opened.includes(card.id);
          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={
                visible
                  ? `카드 ${index + 1}: ${itemLabel(card)}${done ? ', 짝 맞춤' : ''}`
                  : `카드 ${index + 1} 뒤집기`
              }
              accessibilityState={{ disabled: blocked, selected: visible }}
              disabled={blocked}
              onPress={() => void flip(card.id)}
              style={[
                styles.button,
                cardStyles.card,
                visible && styles.selected,
                done && cardStyles.matched,
              ]}
            >
              {visible ? (
                <ItemContent item={card} />
              ) : (
                <Text style={styles.buttonText}>카드 {index + 1}</Text>
              )}
              {done ? <Text style={styles.muted}>짝 맞춤</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite">{message}</Text>
      {checking ? <ActivityIndicator accessibilityLabel="짝 확인 중" /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <QuizButton
        label="다시 시작"
        disabled={disabled || checking}
        onPress={() => {
          close();
          setError(null);
          setMessage('카드 두 장을 뒤집어 짝을 찾아보세요.');
          onChange([]);
        }}
      />
    </View>
  );
}
const cardStyles = StyleSheet.create({
  card: { width: '47%', minHeight: 110, justifyContent: 'center' },
  matched: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
});
