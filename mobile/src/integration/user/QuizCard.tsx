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
import { QuizQuestionRule } from './QuizBackdrop';
import { useQuizFooter, type RegisterQuizFooter } from './quizFooter';
import { QUIZ_FEEDBACK_COLORS, quizFeedbackSurface } from './quizFeedbackColors';

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
  registerFooter,
}: {
  quiz: Quiz;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  disabled?: boolean;
  stage?: boolean;
  registerFooter?: RegisterQuizFooter;
}) {
  const task = useTask();
  const submitted = useRef(false);
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
  const canCheck =
    !disabled &&
    !task.busy &&
    !task.result &&
    !contractMissing &&
    (quiz.type !== 'MULTIPLE_CHOICE' || selected !== null) &&
    (quiz.type !== 'FILL_BLANK' || !!text.trim()) &&
    (quiz.type !== 'OX' || !!ox);
  const chooseOx = async (value: 'O' | 'X') => {
    if (disabled || task.busy || task.result || submitted.current) return;
    submitted.current = true;
    setOx(value);
    const result = await task.run(() => submit({ value: value === 'O' }), onGraded);
    if (!result) submitted.current = false;
  };
  const chooseOption = async (index: number) => {
    if (disabled || task.busy || task.result || submitted.current) return;
    submitted.current = true;
    setSelected(index);
    const result = await task.run(() => submit({ index }), onGraded);
    if (!result) submitted.current = false;
  };
  useQuizFooter(
    quiz.quizId,
    quiz.type !== 'OX' && quiz.type !== 'MULTIPLE_CHOICE' && canCheck,
    () => void task.run(() => submit(answer()), onGraded),
    registerFooter,
  );
  return (
    <View
      style={[
        quizStyles.layout,
        stage && isWireframeQuiz && quizStyles.stage,
        quiz.type === 'OX' && quizStyles.oxLayout,
      ]}
    >
      {quiz.type === 'OX' ? (
        <View style={quizStyles.oxPrompt}>
          <Text style={quizStyles.oxQuestion}>{quiz.question}</Text>
          <View style={quizStyles.questionRule}>
            <QuizQuestionRule />
          </View>
        </View>
      ) : (
        <Text style={isWireframeQuiz ? quizStyles.question : styles.subtitle}>{quiz.question}</Text>
      )}
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
            onPress={() => void chooseOption(c.index)}
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
              // 고른 버튼만 정답·오답으로 칠한다. 오답을 골랐을 때만 남은 버튼(실제 정답)을 연하게 표시한다.
              graded={
                task.result
                  ? ox === value
                    ? (task.result as AnswerResult).isCorrect
                      ? 'correct'
                      : 'wrong'
                    : (task.result as AnswerResult).isCorrect
                      ? undefined
                      : 'answer'
                  : undefined
              }
              ox
              wireframe
              disabled={disabled || !!task.result || task.busy}
              onPress={() => void chooseOx(value)}
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
      {!registerFooter &&
      quiz.type !== 'OX' &&
      quiz.type !== 'MULTIPLE_CHOICE' &&
      !(stage && isWireframeQuiz && task.result) ? (
        <View style={stage && isWireframeQuiz && quizStyles.checkArea}>
          <QuizAction
            label="정답 확인"
            primary={stage && isWireframeQuiz}
            disabled={
              disabled ||
              task.busy ||
              !!task.result ||
              contractMissing ||
              (quiz.type === 'FILL_BLANK' && !text.trim())
            }
            onPress={() => void task.run(() => submit(answer()), onGraded)}
          />
        </View>
      ) : null}
      <UserStatus task={task} />
      {task.result ? (
        <AnimatedReveal
          style={
            quiz.type === 'OX'
              ? quizStyles.oxFeedback
              : isWireframeQuiz
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
          {quiz.type !== 'OX' ? (
            <Text
              style={
                isWireframeQuiz
                  ? [
                      quizStyles.feedbackTitle,
                      !(task.result as AnswerResult).isCorrect && quizStyles.wrongText,
                    ]
                  : styles.subtitle
              }
            >
              {isWireframeQuiz
                ? (task.result as AnswerResult).isCorrect
                  ? '맞았어요!'
                  : '함께 확인해 볼까요?'
                : (task.result as AnswerResult).isCorrect
                  ? '정답'
                  : '오답'}
            </Text>
          ) : null}
          <Text style={quiz.type === 'OX' ? quizStyles.oxExplanation : styles.text}>
            {(task.result as AnswerResult).explanation}
          </Text>
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
  // answer: 오답을 골랐을 때 고르지 않은 실제 정답(OX 전용).
  graded?: 'correct' | 'wrong' | 'answer';
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
              ox ? '#c6c6c6' : wireframe ? '#e6e0ec' : '#dce2e8',
              ox ? '#d9d9d9' : wireframe ? '#746287' : '#273a52',
            ],
          }),
          backgroundColor: selection.interpolate({
            inputRange: [0, 1],
            outputRange: ox
              ? ['rgba(228,228,228,0)', 'rgba(228,228,228,0.6)']
              : ['#fff', wireframe ? '#f4f0f8' : '#eef2f5'],
          }),
        },
        ox && selected && quizStyles.oxPressed,
        graded === 'correct' && (ox ? quizStyles.oxCorrect : quizStyles.correct),
        graded === 'wrong' && (ox ? quizStyles.oxWrong : quizStyles.wrong),
        graded === 'answer' && ox && quizStyles.oxAnswer,
        disabled && !wireframe && quizStyles.disabled,
      ]}
    >
      <Text
        style={[
          quizStyles.actionText,
          secondary && quizStyles.secondaryText,
          wireframe && quizStyles.optionText,
          ox && !selected && quizStyles.oxIdleText,
          wireframe && selected && (ox ? quizStyles.oxSelectedText : quizStyles.selectedText),
          graded === 'correct' && (ox ? quizStyles.oxCorrectText : quizStyles.correctText),
          graded === 'wrong' && (ox ? quizStyles.oxWrongText : quizStyles.wrongText),
          graded === 'answer' && ox && quizStyles.oxAnswerText,
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
  oxLayout: { flexGrow: 0, paddingTop: 0, paddingBottom: 0, gap: 0 },
  oxPrompt: { alignSelf: 'center', alignItems: 'center', maxWidth: '100%' },
  questionRule: { marginTop: 10 },
  checkArea: { marginTop: 'auto', paddingTop: 18 },
  row: { flexDirection: 'row', gap: 18, justifyContent: 'center', marginTop: 40 },
  question: {
    color: '#282636',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: 15,
  },
  oxQuestion: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
  },
  feedbackTitle: { color: QUIZ_FEEDBACK_COLORS.correct.text, fontSize: 15, fontWeight: '700' },
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
  correctText: { color: QUIZ_FEEDBACK_COLORS.correct.text },
  wrongText: { color: QUIZ_FEEDBACK_COLORS.incorrect.text },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce2e8' },
  secondaryText: { color: '#273a52' },
  oxAction: {
    flex: 1,
    maxWidth: 140,
    height: 140,
    padding: 0,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  oxText: { fontSize: 96, fontFamily: 'PretendardRegular', fontWeight: '400', lineHeight: 116 },
  oxIdleText: { color: '#aaa' },
  oxSelectedText: { color: '#c6c6c6' },
  oxPressed: { shadowColor: '#f1f1f1', shadowOpacity: 1, shadowRadius: 6.4 },
  oxCorrect: quizFeedbackSurface.correct,
  oxWrong: quizFeedbackSurface.incorrect,
  oxCorrectText: { color: QUIZ_FEEDBACK_COLORS.correct.text },
  oxWrongText: { color: QUIZ_FEEDBACK_COLORS.incorrect.text },
  oxAnswer: quizFeedbackSurface.answer,
  oxAnswerText: { color: QUIZ_FEEDBACK_COLORS.answer.text },
  oxFeedback: {
    marginTop: 32,
    marginHorizontal: 1,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 12,
    padding: 32,
    backgroundColor: 'rgba(228,228,228,0.7)',
    shadowColor: '#f1f1f1',
    shadowOpacity: 1,
    shadowRadius: 6.4,
  },
  oxExplanation: {
    color: '#161616',
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    lineHeight: 20,
  },
  correct: quizFeedbackSurface.correct,
  wrong: quizFeedbackSurface.incorrect,
  feedback: {
    backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background,
    borderRadius: 14,
    padding: 17,
    gap: 5,
  },
  goodFeedback: {
    backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background,
    borderRadius: 14,
    padding: 17,
    gap: 5,
  },
  stageFeedback: { marginTop: 'auto' },
  disabled: { opacity: 0.45 },
});
