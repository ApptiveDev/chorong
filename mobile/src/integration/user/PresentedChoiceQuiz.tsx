// SINGLE 의 표시 방식(config.presentation) 화면 공통 틀.
// 질문 → 미디어(소리·타일 등) → 보기 → 채점 뒤 해설 시트 순서이고, 미디어 칸만 방식별로 바꾼다.
// 답안은 일반 SINGLE 과 같은 보기 순번이다. 쓰는 곳: AudioChoiceQuiz, TileRevealQuiz.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { FEEDBACK_SHEET_COLORS, QuizFeedbackSheet } from './QuizFeedbackSheet';
import { QUIZ_FEEDBACK_COLORS } from './quizFeedbackColors';
import { choicesFor, correctChoiceIndex } from './SingleChoiceQuiz';

type Phase = 'UNANSWERED' | 'GRADING' | 'GRADED' | 'TRANSITIONING';
const color = FEEDBACK_SHEET_COLORS;

export type PresentedChoiceProps = {
  quiz: Quiz;
  scale: number;
  disabled: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  onAdvance: () => Promise<void> | void;
};

/** 미디어 칸이 받는 상태. locked: 보기를 고른 뒤(채점 중 포함), graded: 채점 결과가 나온 뒤. */
export type PresentedMediaState = { locked: boolean; graded: boolean };

export function PresentedChoiceQuiz({
  quiz,
  scale,
  disabled,
  submit,
  onGraded,
  onAdvance,
  media,
  // Figma 기준 진도 바 아래 여백과 질문·미디어·보기 사이 간격(디자인 폭 기준 px).
  topSpace,
  gap,
}: PresentedChoiceProps & {
  media: (state: PresentedMediaState) => ReactNode;
  topSpace: number;
  gap: number;
}) {
  const choices = choicesFor(quiz);
  const [phase, setPhase] = useState<Phase>('UNANSWERED');
  const phaseRef = useRef<Phase>('UNANSWERED');
  const [selected, setSelected] = useState<number | null>(null);
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

  const moveTo = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const choose = async (index: number) => {
    if (disabled || phaseRef.current !== 'UNANSWERED') return;
    moveTo('GRADING');
    setSelected(index);
    setError('');
    try {
      const graded = await submit({ index });
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
      setSelected(null);
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

  if (!choices) return <Text style={s.error}>선택지를 불러오지 못했습니다.</Text>;
  const graded = phase === 'GRADED' || phase === 'TRANSITIONING';
  const locked = disabled || phase !== 'UNANSWERED';
  const correctIndex = result ? correctChoiceIndex(result, quiz) : null;

  return (
    <View style={s.stage}>
      {/* 채점 뒤 여백 터치로 다음 콘텐츠로 간다(ChosungQuiz 와 같다). */}
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
        style={[s.body, { paddingTop: topSpace * scale, paddingHorizontal: 36 * scale }]}
      >
        <View pointerEvents="box-none" style={[s.group, { gap: gap * scale }]}>
          <Text lineBreakStrategyIOS="hangul-word" style={s.question}>
            {quiz.question.replace(/\s*\n\s*/g, ' ')}
          </Text>
          {media({ locked: phase !== 'UNANSWERED', graded })}
          <View style={[s.options, { width: 320 * scale }]}>
            {choices.map((choice) => {
              const correct =
                !!result &&
                (result.isCorrect ? selected === choice.index : correctIndex === choice.index);
              const wrong = !!result && !result.isCorrect && selected === choice.index;
              return (
                <Pressable
                  key={choice.index}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === choice.index, disabled: locked }}
                  disabled={locked}
                  onPress={() => void choose(choice.index)}
                  style={s.option}
                >
                  {(correct || wrong) && (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        s.optionTint,
                        correct ? s.correctTint : s.wrongTint,
                        { opacity: sheetProgress },
                      ]}
                    />
                  )}
                  <Text style={[s.optionText, correct && s.correctText, wrong && s.wrongText]}>
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
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
    ...(Platform.OS === 'web' ? ({ wordBreak: 'keep-all' } as object) : null),
  },
  options: { maxWidth: '100%', alignItems: 'stretch' },
  // SingleChoiceQuiz 와 같은 button_선택지 고르기
  option: {
    justifyContent: 'center',
    minHeight: 52,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.handle,
    marginBottom: -1,
    paddingHorizontal: 36,
    paddingVertical: 16,
  },
  optionTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  correctTint: { backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background },
  wrongTint: { backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background },
  optionText: {
    color: color.tertiary,
    fontFamily: 'PretendardSemiBold',
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
  },
  correctText: { color: QUIZ_FEEDBACK_COLORS.correct.text },
  wrongText: { color: QUIZ_FEEDBACK_COLORS.incorrect.text },
  error: { color: '#b56060', fontFamily: 'PretendardMedium', fontSize: 12, lineHeight: 18 },
});
