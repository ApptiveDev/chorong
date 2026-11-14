// CHOSUNG(초성) 퀴즈. Figma 초성퀴즈(737:807)·정답(739:892)·오답(739:916)을 따른다.
// 채점은 서버(API-406·502) 결과만 쓴다. 앱은 정답을 알지 못한다.
// 제출 버튼이 없다. 입력 칸을 모두 채우고 한글 조합이 끝나면 한 번만 자동 제출한다(chosungInput.ts).
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import {
  CHOSUNG_SETTLE_MS,
  chosungHintLabel,
  chosungSlotCount,
  compactChosung,
  isChosungInputFilled,
} from './chosungInput';
import { FEEDBACK_SHEET_COLORS, QuizFeedbackSheet } from './QuizFeedbackSheet';

export function isChosungQuiz(quiz: Quiz | null | undefined): boolean {
  return quiz?.type === 'CHOSUNG' && typeof quiz.options?.hint === 'string';
}

type Phase = 'INPUT' | 'GRADING' | 'GRADED' | 'TRANSITIONING';

// 입력 밑줄·정답 글자도 해설 시트와 같은 Figma 색을 쓴다.
const color = FEEDBACK_SHEET_COLORS;

export function ChosungQuiz({
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
  const hint = String(quiz.options?.hint ?? '');
  const slotCount = chosungSlotCount(hint);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('INPUT');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const phaseRef = useRef<Phase>('INPUT');
  const textRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);
  const sheetProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      sheetProgress.stopAnimation();
    };
  }, [sheetProgress]);

  const moveTo = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const clearSettle = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };

  // 자동 제출 진입점. 타이머·완료 키·포커스 해제가 모두 여기로 오고 phaseRef 로 한 번만 통과한다.
  const grade = async () => {
    const value = textRef.current;
    if (disabled || phaseRef.current !== 'INPUT' || !isChosungInputFilled(value, slotCount)) return;
    clearSettle();
    moveTo('GRADING');
    setError('');
    inputRef.current?.blur();
    Keyboard.dismiss();
    try {
      const graded = await submit({ texts: [value] });
      if (!active.current) return;
      setResult(graded);
      onGraded(graded);
      moveTo('GRADED');
      AccessibilityInfo.announceForAccessibility(graded.isCorrect ? '정답' : '오답');
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
      // 입력은 그대로 두고 다시 열어 준다. 입력창을 눌러 완료 키를 누르거나 글자를 고치면 다시 제출한다.
      moveTo('INPUT');
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    }
  };

  const change = (next: string) => {
    if (disabled || phaseRef.current !== 'INPUT') return;
    // 서버가 공백을 빼고 비교하므로 입력에서도 공백을 받지 않는다. 칸 수 계산과 맞춘다.
    const value = compactChosung(next);
    textRef.current = value;
    setText(value);
    clearSettle();
    if (isChosungInputFilled(value, slotCount))
      settleTimer.current = setTimeout(() => void grade(), CHOSUNG_SETTLE_MS);
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
  const locked = disabled || phase !== 'INPUT';
  const expected =
    result && !result.isCorrect && typeof result.correctAnswer.answer === 'string'
      ? result.correctAnswer.answer
      : null;
  const resultColor = result ? (result.isCorrect ? color.correct : color.wrong) : color.base;

  return (
    <View style={s.stage}>
      {/* 여백 터치. 채점 전에는 키보드를 닫고(조합 확정 → 자동 제출), 채점 뒤에는 다음 콘텐츠로 간다. */}
      <Pressable
        accessible={graded}
        accessibilityRole={graded ? 'button' : undefined}
        accessibilityLabel={graded ? '다음 학습 콘텐츠로 이동' : undefined}
        onPress={graded ? advance : Keyboard.dismiss}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="box-none"
        style={[s.body, { paddingTop: 200 * scale, paddingHorizontal: 36 * scale }]}
      >
        <View pointerEvents="box-none" style={[s.group, { gap: 40 * scale }]}>
          <Text lineBreakStrategyIOS="hangul-word" style={s.question}>
            {quiz.question.replace(/\s*\n\s*/g, ' ')}
          </Text>
          <View pointerEvents="box-none" style={[s.answerArea, { gap: 20 * scale }]}>
            <Text accessibilityLabel={`초성 힌트 ${hint}`} style={s.hint}>
              {chosungHintLabel(hint)}
            </Text>
            <Pressable
              accessible={false}
              disabled={locked}
              onPress={() => inputRef.current?.focus()}
              style={[s.field, { width: 330 * scale }]}
            >
              <TextInput
                ref={inputRef}
                accessibilityLabel={`정답 입력, ${slotCount}글자`}
                value={text}
                onChangeText={change}
                onSubmitEditing={() => void grade()}
                onBlur={() => void grade()}
                editable={!locked}
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
                cursorColor={color.base}
                selectionColor={color.tertiary}
                style={[s.input, { color: resultColor }]}
              />
              <View style={[s.underline, { backgroundColor: resultColor }]} />
            </Pressable>
            {expected ? (
              <Text accessibilityLabel={`정답 ${expected}`} style={s.expected}>
                {expected}
              </Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      {result ? (
        <QuizFeedbackSheet
          result={result}
          progress={sheetProgress}
          nextDisabled={phase !== 'GRADED'}
          onNext={advance}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  body: { alignItems: 'center' },
  group: { width: '100%', maxWidth: 330 },
  question: {
    color: color.base,
    fontFamily: 'PretendardBold',
    fontSize: 20,
    lineHeight: 24,
    includeFontPadding: false,
    // Figma 처럼 낱말 단위로 줄을 바꾼다(iOS 는 lineBreakStrategyIOS).
    ...(Platform.OS === 'web' ? ({ wordBreak: 'keep-all' } as object) : null),
  },
  answerArea: { alignItems: 'center', width: '100%' },
  hint: {
    color: color.tertiary,
    fontFamily: 'PretendardBold',
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
    includeFontPadding: false,
  },
  field: { maxWidth: '100%', gap: 6, alignItems: 'stretch' },
  input: {
    minHeight: 24,
    padding: 0,
    fontFamily: 'PretendardSemiBold',
    fontSize: 20,
    textAlign: 'center',
    includeFontPadding: false,
    // 웹 기본 포커스 테두리를 지운다. 밑줄이 입력 영역을 나타낸다.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  underline: { height: 2, width: '100%' },
  expected: {
    width: '100%',
    color: color.base,
    fontFamily: 'PretendardSemiBold',
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
    includeFontPadding: false,
  },
  error: { color: '#b56060', fontFamily: 'PretendardMedium', fontSize: 12, lineHeight: 18 },
});
