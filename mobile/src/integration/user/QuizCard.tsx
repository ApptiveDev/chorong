import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { useTask } from '../hooks';
import { Field, styles } from '../ui';
import { UserStatus } from './Screen';
import { AnimatedReveal } from './AnimatedReveal';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Choice = { index: number; label: string };
function choicesFromServer(raw: unknown): Choice[] | null {
  if (!Array.isArray(raw)) return null;
  const result: Choice[] = [];
  for (const value of raw) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!Number.isSafeInteger(record.index) || typeof record.label !== 'string') return null;
    result.push({ index: record.index as number, label: record.label });
  }
  return result;
}
export function QuizCard({
  quiz,
  submit,
  onGraded,
  disabled = false,
}: {
  quiz: Quiz;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  disabled?: boolean;
}) {
  const task = useTask();
  const [selected, setSelected] = useState<number | null>(null),
    [text, setText] = useState('');
  const [ox, setOx] = useState<'O' | 'X' | ''>(''),
    [ordered, setOrdered] = useState<number[]>([]);
  const choices = choicesFromServer(quiz.options?.choices);
  const items = choicesFromServer(quiz.options?.items);
  const order = ordered.length ? ordered : (items?.map((x) => x.index) ?? []);
  const move = (from: number, by: number) => {
    const target = from + by;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[from], next[target]] = [next[target], next[from]];
    setOrdered(next);
  };
  const answer = (): QuizAnswer => {
    if (quiz.type === 'MULTIPLE_CHOICE') {
      if (selected === null) throw new Error('답을 선택하세요.');
      return { index: selected };
    }
    if (quiz.type === 'FILL_BLANK') {
      if (!text.trim()) throw new Error('답을 입력하세요.');
      return { texts: text.split('\n') };
    }
    if (quiz.type === 'OX') {
      if (!ox) throw new Error('O 또는 X를 선택하세요.');
      return { value: ox === 'O' };
    }
    if (!items?.length) throw new Error('순서 문제의 선택지 형식을 확인할 수 없습니다.');
    return { order };
  };
  const contractMissing =
    (quiz.type === 'MULTIPLE_CHOICE' && !choices?.length) ||
    (quiz.type === 'ORDERING' && !items?.length);
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.subtitle}>{quiz.question}</Text>
      {quiz.hint ? <Text style={styles.text}>힌트: {quiz.hint}</Text> : null}
      {quiz.type === 'MULTIPLE_CHOICE' &&
        choices?.map((c) => (
          <QuizAction
            key={c.index}
            label={c.label}
            selected={selected === c.index}
            secondary
            disabled={disabled || !!task.result || task.busy}
            onPress={() => setSelected(c.index)}
          />
        ))}
      {quiz.type === 'FILL_BLANK' ? (
        <Field label="빈칸 답 (한 줄에 하나씩)" value={text} onChange={setText} multiline />
      ) : null}
      {quiz.type === 'OX' ? (
        <View style={quizStyles.row}>
          {(['O', 'X'] as const).map((value) => (
            <QuizAction
              key={value}
              label={value}
              secondary
              selected={ox === value}
              disabled={disabled || !!task.result || task.busy}
              onPress={() => setOx(value)}
            />
          ))}
        </View>
      ) : null}
      {quiz.type === 'ORDERING' && items
        ? order.map((index, position) => (
            <View key={index} style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={{ flex: 1 }}>{items.find((item) => item.index === index)?.label}</Text>
              <QuizAction
                label="위로"
                secondary
                disabled={position === 0 || disabled}
                onPress={() => move(position, -1)}
              />
              <QuizAction
                label="아래로"
                secondary
                disabled={position === order.length - 1 || disabled}
                onPress={() => move(position, 1)}
              />
            </View>
          ))
        : null}
      {contractMissing ? (
        <Text style={styles.error}>
          선택지 형식 확인 대기. 개발자 진단 화면에서 서버 응답을 확인하세요.
        </Text>
      ) : null}
      <QuizAction
        label="정답 확인"
        disabled={disabled || task.busy || !!task.result || contractMissing}
        onPress={() => void task.run(() => submit(answer()), onGraded)}
      />
      <UserStatus task={task} />
      {task.result ? (
        <AnimatedReveal style={styles.card} duration={280} offsetY={8}>
          <Text style={styles.subtitle}>
            {(task.result as AnswerResult).isCorrect ? '정답' : '오답'}
          </Text>
          <Text style={styles.text}>{(task.result as AnswerResult).explanation}</Text>
          <Text style={styles.text}>
            채점 결과를 확인했습니다. 다음 콘텐츠로 이동할 수 있습니다.
          </Text>
        </AnimatedReveal>
      ) : null}
    </View>
  );
}

function QuizAction({
  label,
  onPress,
  disabled = false,
  secondary = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
}) {
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (!active) return;
        if (reduceMotion) {
          selection.setValue(selected ? 1 : 0);
          return;
        }
        Animated.timing(selection, {
          toValue: selected ? 1 : 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      });
    return () => {
      active = false;
      selection.stopAnimation();
    };
  }, [selected, selection]);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        quizStyles.action,
        secondary && quizStyles.secondary,
        secondary && {
          borderColor: selection.interpolate({
            inputRange: [0, 1],
            outputRange: ['#dce2e8', '#273a52'],
          }),
          backgroundColor: selection.interpolate({
            inputRange: [0, 1],
            outputRange: ['#fff', '#eef2f5'],
          }),
        },
        disabled && quizStyles.disabled,
      ]}
    >
      <Text style={[quizStyles.actionText, secondary && quizStyles.secondaryText]}>{label}</Text>
    </AnimatedPressable>
  );
}

const quizStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  action: {
    minHeight: 44,
    borderRadius: 5,
    padding: 12,
    backgroundColor: '#273a52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce2e8' },
  secondaryText: { color: '#273a52' },
  disabled: { opacity: 0.45 },
});
