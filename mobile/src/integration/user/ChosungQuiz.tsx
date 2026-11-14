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
import Svg, { Mask, Path } from 'react-native-svg';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import {
  CHOSUNG_SETTLE_MS,
  chosungHintLabel,
  chosungSlotCount,
  compactChosung,
  isChosungInputFilled,
} from './chosungInput';

export function isChosungQuiz(quiz: Quiz | null | undefined): boolean {
  return quiz?.type === 'CHOSUNG' && typeof quiz.options?.hint === 'string';
}

type Phase = 'INPUT' | 'GRADING' | 'GRADED' | 'TRANSITIONING';

// Figma 739:892 의 정답색은 #3D8F11 로 공통 팔레트(QUIZ_FEEDBACK_COLORS.correct #67B13F)와 다르다.
// 이 화면은 Figma 값을 쓴다. 오답색은 공통 팔레트와 같다.
const color = {
  base: '#161616',
  tertiary: '#747474',
  sheet: '#E4E4E4',
  handle: '#AAAAAA',
  fale: '#F1F1F1',
  correct: '#3D8F11',
  wrong: '#F92669',
} as const;

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
  const explanation = result?.explanation?.trim()
    ? result.explanation.trim().split(/\s*\n\s*/)
    : [];

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
        <Animated.View
          accessibilityLiveRegion="polite"
          style={[
            s.sheet,
            {
              opacity: sheetProgress,
              transform: [
                {
                  translateY: sheetProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [SHEET_HEIGHT, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={s.handle} />
          <View style={s.feedback}>
            <View style={s.feedbackTitleRow}>
              {result.isCorrect ? <CorrectStarIcon /> : <WrongCrossIcon />}
              <Text style={[s.feedbackTitle, { color: resultColor }]}>
                {result.isCorrect ? '정답' : '오답'}
              </Text>
            </View>
            {explanation.length ? (
              <View style={s.explanation}>
                {explanation.map((line, index) => (
                  <Text key={index} style={s.explanationText}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: phase !== 'GRADED' }}
            disabled={phase !== 'GRADED'}
            onPress={advance}
            style={s.next}
          >
            <Text style={s.nextText}>다음</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

// Figma Star 1(I739:883;737:860). 24 칸 안에 7.84% 여백을 두고 안쪽 선(마스크)으로 그린다.
function CorrectStarIcon() {
  const star =
    'M9.18061 0.652964C9.50276 -0.217654 10.7342 -0.217655 11.0563 0.652963L13.2 6.44613C13.3013 6.71985 13.5171 6.93566 13.7908 7.03694L19.5839 9.18061C20.4546 9.50276 20.4546 10.7342 19.584 11.0563L13.7908 13.2C13.5171 13.3013 13.3013 13.5171 13.2 13.7908L11.0563 19.5839C10.7342 20.4546 9.50276 20.4546 9.18061 19.584L7.03694 13.7908C6.93566 13.5171 6.71985 13.3013 6.44613 13.2L0.652964 11.0563C-0.217654 10.7342 -0.217655 9.50276 0.652963 9.18061L6.44613 7.03694C6.71985 6.93566 6.93566 6.71985 7.03694 6.44613L9.18061 0.652964Z';
  return (
    <Svg width={24} height={24} viewBox="-1.8816 -1.8816 24 24" fill="none">
      <Mask id="chosungStarStroke" fill="white">
        <Path d={star} />
      </Mask>
      <Path d={star} stroke={color.correct} strokeWidth={3.2} mask="url(#chosungStarStroke)" />
    </Svg>
  );
}

// Figma Union(739:954). 12 칸에 -4.17% 여백(13×13)으로 그린다.
function WrongCrossIcon() {
  return (
    <View style={s.crossBox}>
      <Svg width={13} height={13} viewBox="0 0 13 13" fill="none" style={s.crossSvg}>
        <Path
          d="M11.6423 0.647217C11.8386 0.450928 12.1565 0.450928 12.3528 0.647217C12.5491 0.843507 12.5491 1.16143 12.3528 1.35772L7.21051 6.5L12.3528 11.6423C12.5491 11.8386 12.5491 12.1565 12.3528 12.3528C12.1565 12.5491 11.8386 12.5491 11.6423 12.3528L6.5 7.21051L1.35772 12.3528C1.16143 12.5491 0.843507 12.5491 0.647217 12.3528C0.450928 12.1565 0.450928 11.8386 0.647217 11.6423L5.78949 6.5L0.647217 1.35772C0.450928 1.16143 0.450928 0.843507 0.647217 0.647217C0.843507 0.450928 1.16143 0.450928 1.35772 0.647217L6.5 5.78949L11.6423 0.647217Z"
          fill="black"
          stroke={color.wrong}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// Figma Frame 140(739:982): 높이 210, 안쪽 36·20, 위 모서리 12.
const SHEET_HEIGHT = 210;

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
  sheet: {
    marginTop: 'auto',
    width: '100%',
    minHeight: SHEET_HEIGHT,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 36,
    paddingVertical: 20,
    backgroundColor: color.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: color.tertiary,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  // Vector 95: 길이 72 + 둥근 끝 2씩, 굵기 4
  handle: { width: 76, height: 4, borderRadius: 2, backgroundColor: color.handle },
  feedback: { width: '100%', gap: 12 },
  feedbackTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedbackTitle: { fontFamily: 'PretendardBold', fontSize: 16, lineHeight: 20 },
  crossBox: { width: 12, height: 12 },
  crossSvg: { position: 'absolute', left: -0.5, top: -0.5 },
  explanation: { gap: 4 },
  explanationText: {
    color: color.base,
    fontFamily: 'PretendardMedium',
    fontSize: 16,
    lineHeight: 20,
  },
  next: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: color.fale,
    backgroundColor: color.base,
    boxShadow: '0px 0px 4px 0px #f1f1f1',
  },
  nextText: { color: color.fale, fontFamily: 'PretendardRegular', fontSize: 16 },
});
