import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
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
import { QuizFeedbackSheet } from './QuizFeedbackSheet';
import { useQuizFooter, type RegisterQuizFooter } from './quizFooter';
import { QUIZ_FEEDBACK_COLORS, quizFeedbackSurface } from './quizFeedbackColors';
import { gradedAnnouncement, isUngraded } from './quizGrading';

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
type QuizCardProps = {
  quiz: Quiz;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  disabled?: boolean;
  stage?: boolean;
  registerFooter?: RegisterQuizFooter;
  // 퀴즈 무대 OX 전용. 디자인 폭 기준 배율.
  scale?: number;
  // 퀴즈 무대 OX 전용. 있으면 해설 시트의 [다음]·여백 터치로 직접 다음 콘텐츠로 간다.
  onAdvance?: () => Promise<void> | void;
};

export function QuizCard(props: QuizCardProps) {
  const { quiz, stage, onAdvance } = props;
  if (stage && quiz.type === 'OX' && onAdvance)
    return (
      <StageOxQuiz
        quiz={quiz}
        scale={props.scale ?? 1}
        disabled={props.disabled ?? false}
        submit={props.submit}
        onGraded={props.onGraded}
        onAdvance={onAdvance}
      />
    );
  return <BaseQuizCard {...props} />;
}

type OxPhase = 'UNANSWERED' | 'GRADING' | 'GRADED' | 'TRANSITIONING';

// 퀴즈 무대 OX. O·X 를 누르면 바로 제출하고, 채점 뒤 해설은 하단 시트(QuizFeedbackSheet)로 보인다.
// 흐름은 PresentedChoiceQuiz 와 같다(UNANSWERED → GRADING → GRADED → TRANSITIONING).
function StageOxQuiz({
  quiz,
  scale,
  disabled,
  submit,
  onGraded,
  onAdvance,
}: {
  quiz: Quiz;
  scale: number;
  disabled: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  onAdvance: () => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<OxPhase>('UNANSWERED');
  const phaseRef = useRef<OxPhase>('UNANSWERED');
  const [ox, setOx] = useState<'O' | 'X' | ''>('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      sheetProgress.stopAnimation();
    };
  }, [sheetProgress]);

  const moveTo = (next: OxPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const choose = async (value: 'O' | 'X') => {
    if (disabled || phaseRef.current !== 'UNANSWERED') return;
    moveTo('GRADING');
    setOx(value);
    setError('');
    try {
      const graded = await submit({ value: value === 'O' });
      if (!active.current) return;
      setResult(graded);
      onGraded(graded);
      moveTo('GRADED');
      AccessibilityInfo.announceForAccessibility(gradedAnnouncement(quiz, graded));
      sheetProgress.setValue(0);
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (!active.current) return;
      if (reduceMotion) sheetProgress.setValue(1);
      else
        Animated.timing(sheetProgress, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }).start();
    } catch (cause) {
      if (!active.current) return;
      setOx('');
      moveTo('UNANSWERED');
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    }
  };
  const advance = () => {
    if (phaseRef.current !== 'GRADED') return;
    moveTo('TRANSITIONING');
    void Promise.resolve()
      .then(onAdvance)
      .catch((cause) => {
        if (!active.current) return;
        setError(cause instanceof Error ? cause.message : '다음 콘텐츠로 이동하지 못했습니다.');
        moveTo('GRADED');
      });
  };

  const graded = phase === 'GRADED' || phase === 'TRANSITIONING';
  const locked = disabled || phase !== 'UNANSWERED';
  const ungraded = isUngraded(quiz, result);
  // 고른 버튼만 정답·오답으로 칠한다. 오답을 골랐을 때만 남은 버튼(실제 정답)을 연하게 표시한다.
  // 채점하지 않는 문항은 고른 표시만 남기고 색을 바꾸지 않는다.
  const gradedFor = (value: 'O' | 'X') => {
    if (!result || ungraded) return undefined;
    if (ox === value) return result.isCorrect ? 'correct' : 'wrong';
    return result.isCorrect ? undefined : 'answer';
  };

  return (
    <View style={quizStyles.oxStage}>
      {/* 채점 뒤 여백 터치로 다음 콘텐츠로 간다(PresentedChoiceQuiz 와 같다). */}
      <Pressable
        accessible={graded}
        accessibilityRole={graded ? 'button' : undefined}
        accessibilityLabel={graded ? '다음 학습 콘텐츠로 이동' : undefined}
        disabled={!graded}
        onPress={advance}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="box-none"
        style={{ paddingTop: 200 * scale, paddingHorizontal: 36 * scale }}
      >
        <View pointerEvents="none" style={quizStyles.oxPrompt}>
          <Text style={quizStyles.oxQuestion}>{quiz.question}</Text>
          <View style={quizStyles.questionRule}>
            <QuizQuestionRule />
          </View>
        </View>
        <View pointerEvents="box-none" style={quizStyles.row}>
          {(['O', 'X'] as const).map((value) => (
            <QuizAction
              key={value}
              label={value}
              secondary
              selected={ox === value}
              graded={gradedFor(value)}
              ox
              wireframe
              disabled={locked}
              onPress={() => void choose(value)}
            />
          ))}
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={quizStyles.oxError}>
            {error}
          </Text>
        ) : null}
      </View>
      {result ? (
        <QuizFeedbackSheet
          result={result}
          progress={sheetProgress}
          nextDisabled={phase !== 'GRADED'}
          onNext={advance}
          ungraded={ungraded}
        />
      ) : null}
    </View>
  );
}

function BaseQuizCard({
  quiz,
  submit,
  onGraded,
  disabled = false,
  stage = false,
  registerFooter,
}: QuizCardProps) {
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
  // 정답·오답 색과 문구를 보일 결과. 채점하지 않는 문항(isCorrect=null 등)이면 null 이다.
  const gradedResult =
    task.result && !isUngraded(quiz, task.result as AnswerResult)
      ? (task.result as AnswerResult)
      : null;
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
              gradedResult
                ? gradedResult.isCorrect
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
                gradedResult
                  ? ox === value
                    ? gradedResult.isCorrect
                      ? 'correct'
                      : 'wrong'
                    : gradedResult.isCorrect
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
                    !gradedResult
                      ? quizStyles.neutralFeedback
                      : gradedResult.isCorrect
                        ? quizStyles.goodFeedback
                        : quizStyles.feedback,
                    stage && quizStyles.stageFeedback,
                  ]
                : styles.card
          }
          duration={280}
          offsetY={8}
        >
          {quiz.type !== 'OX' && gradedResult ? (
            <Text
              style={
                isWireframeQuiz
                  ? [quizStyles.feedbackTitle, !gradedResult.isCorrect && quizStyles.wrongText]
                  : styles.subtitle
              }
            >
              {isWireframeQuiz
                ? gradedResult.isCorrect
                  ? '맞았어요!'
                  : '함께 확인해 볼까요?'
                : gradedResult.isCorrect
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
  // 퀴즈 무대 OX. 해설 시트가 화면 아래·폭 전체에 붙도록 화면을 채운다.
  oxStage: { flexGrow: 1, width: '100%' },
  oxError: {
    marginTop: 16,
    color: '#b56060',
    fontFamily: 'PretendardMedium',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
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
  // 채점하지 않는 문항의 해설. 정답·오답 색을 쓰지 않는다.
  neutralFeedback: { backgroundColor: '#f1f1f1', borderRadius: 14, padding: 17, gap: 5 },
  stageFeedback: { marginTop: 'auto' },
  disabled: { opacity: 0.45 },
});
