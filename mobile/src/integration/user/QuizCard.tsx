import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { useTask } from '../hooks';
import { styles } from '../ui';
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
  stage = false,
}: {
  quiz: Quiz;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  disabled?: boolean;
  stage?: boolean;
}) {
  const task = useTask();
  const [selected, setSelected] = useState<number | null>(null),
    [text, setText] = useState('');
  const [ox, setOx] = useState<'O' | 'X' | ''>(''),
    [ordered, setOrdered] = useState<number[]>([]);
  const choices = choicesFromServer(quiz.options?.choices);
  const isWireframeQuiz =
    quiz.type === 'MULTIPLE_CHOICE' || quiz.type === 'OX' || quiz.type === 'FILL_BLANK';
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
    <View style={[quizStyles.layout, stage && isWireframeQuiz && quizStyles.stage]}>
      <Text style={isWireframeQuiz ? quizStyles.question : styles.subtitle}>{quiz.question}</Text>
      {quiz.hint ? <Text style={styles.text}>힌트: {quiz.hint}</Text> : null}
      {quiz.type === 'MULTIPLE_CHOICE' &&
        choices?.map((c) => (
          <QuizAction
            key={c.index}
            label={c.label}
            selected={selected === c.index}
            graded={
              task.result
                ? (task.result as AnswerResult).isCorrect
                  ? selected === c.index
                    ? 'correct'
                    : undefined
                  : selected === c.index
                    ? 'wrong'
                    : undefined
                : undefined
            }
            wireframe
            secondary
            disabled={disabled || !!task.result || task.busy}
            onPress={() => setSelected(c.index)}
          />
        ))}
      {quiz.type === 'FILL_BLANK' ? (
        <TextInput
          accessibilityLabel="빈칸 답"
          placeholder="?"
          placeholderTextColor="#aaa1b3"
          value={text}
          onChangeText={setText}
          editable={!disabled && !task.busy && !task.result}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={quizStyles.blankInput}
        />
      ) : null}
      {quiz.type === 'OX' ? (
        <View style={quizStyles.row}>
          {(['O', 'X'] as const).map((value) => (
            <QuizAction
              key={value}
              label={value}
              secondary
              selected={ox === value}
              graded={
                task.result && ox === value
                  ? (task.result as AnswerResult).isCorrect
                    ? 'correct'
                    : 'wrong'
                  : undefined
              }
              ox
              wireframe
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
      {!(stage && isWireframeQuiz && task.result) ? (
        <View style={stage && isWireframeQuiz && quizStyles.checkArea}>
          <QuizAction
            label="정답 확인"
            primary={stage && isWireframeQuiz}
            disabled={
              disabled ||
              task.busy ||
              !!task.result ||
              contractMissing ||
              (quiz.type === 'MULTIPLE_CHOICE' && selected === null) ||
              (quiz.type === 'FILL_BLANK' && !text.trim()) ||
              (quiz.type === 'OX' && !ox)
            }
            onPress={() => void task.run(() => submit(answer()), onGraded)}
          />
        </View>
      ) : null}
      <UserStatus task={task} />
      {task.result ? (
        <AnimatedReveal
          style={
            isWireframeQuiz
              ? [
                  (task.result as AnswerResult).isCorrect
                    ? quizStyles.goodFeedback
                    : quizStyles.feedback,
                  stage && quizStyles.stageFeedback,
                ]
              : styles.card
          }
          duration={280}
          offsetY={8}
        >
          <Text style={isWireframeQuiz ? quizStyles.feedbackTitle : styles.subtitle}>
            {isWireframeQuiz
              ? (task.result as AnswerResult).isCorrect
                ? '맞았어요!'
                : '함께 확인해 볼까요?'
              : (task.result as AnswerResult).isCorrect
                ? '정답'
                : '오답'}
          </Text>
          <Text style={styles.text}>{(task.result as AnswerResult).explanation}</Text>
          {!isWireframeQuiz ? (
            <Text style={styles.text}>
              채점 결과를 확인했습니다. 다음 콘텐츠로 이동할 수 있습니다.
            </Text>
          ) : null}
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
  graded,
  ox = false,
  wireframe = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
  graded?: 'correct' | 'wrong';
  ox?: boolean;
  wireframe?: boolean;
  primary?: boolean;
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
        primary && quizStyles.primary,
        wireframe && quizStyles.option,
        ox && quizStyles.oxAction,
        secondary && quizStyles.secondary,
        secondary && {
          borderColor: selection.interpolate({
            inputRange: [0, 1],
            outputRange: [
              ox ? 'transparent' : wireframe ? '#e6e0ec' : '#dce2e8',
              ox ? '#8c779f' : wireframe ? '#746287' : '#273a52',
            ],
          }),
          backgroundColor: selection.interpolate({
            inputRange: [0, 1],
            outputRange: ['#fff', ox ? '#f3eef8' : wireframe ? '#f4f0f8' : '#eef2f5'],
          }),
        },
        graded === 'correct' && quizStyles.correct,
        graded === 'wrong' && quizStyles.wrong,
        disabled && !wireframe && quizStyles.disabled,
      ]}
    >
      <Text
        style={[
          quizStyles.actionText,
          secondary && quizStyles.secondaryText,
          wireframe && quizStyles.optionText,
          ox && !selected && quizStyles.oxIdleText,
          wireframe && selected && quizStyles.selectedText,
          graded === 'correct' && quizStyles.correctText,
          graded === 'wrong' && quizStyles.wrongText,
          ox && quizStyles.oxText,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const quizStyles = StyleSheet.create({
  layout: { gap: 12 },
  stage: { flexGrow: 1, paddingTop: 6 },
  checkArea: { marginTop: 'auto', paddingTop: 18 },
  row: { flexDirection: 'row', gap: 20, justifyContent: 'center', marginVertical: 10 },
  question: {
    color: '#282636',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: 15,
  },
  feedbackTitle: { color: '#477656', fontSize: 15, fontWeight: '700' },
  blankInput: {
    alignSelf: 'center',
    minWidth: 120,
    maxWidth: '100%',
    minHeight: 54,
    borderBottomWidth: 2,
    borderColor: '#746284',
    color: '#746284',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  action: {
    minHeight: 44,
    borderRadius: 5,
    padding: 12,
    backgroundColor: '#273a52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { minHeight: 52, borderRadius: 13, backgroundColor: '#373044' },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  option: { minHeight: 54, borderRadius: 13, padding: 14 },
  optionText: { color: '#282636', fontSize: 14, fontWeight: '400' },
  selectedText: { color: '#594567' },
  correctText: { color: '#477656' },
  wrongText: { color: '#ad6262' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce2e8' },
  secondaryText: { color: '#273a52' },
  oxAction: { flex: 1, maxWidth: 120, height: 120 },
  oxText: { fontSize: 70, fontWeight: '200' },
  oxIdleText: { color: '#a29ca8' },
  correct: { borderColor: '#83ac92', backgroundColor: '#eff7f1' },
  wrong: { borderColor: '#d3a4a4', backgroundColor: '#fdf1f1' },
  feedback: { backgroundColor: '#f5f3f8', borderRadius: 14, padding: 17, gap: 5 },
  goodFeedback: { backgroundColor: '#f0f6f1', borderRadius: 14, padding: 17, gap: 5 },
  stageFeedback: { marginTop: 'auto' },
  disabled: { opacity: 0.45 },
});
