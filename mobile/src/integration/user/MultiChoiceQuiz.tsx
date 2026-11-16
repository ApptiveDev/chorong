// MULTI(여러 개 고르기) 퀴즈. 보기를 누를 때마다 정답·오답 색을 보이고,
// 오답을 고르거나 정답을 모두 고르면 제출한다. 채점 뒤 해설은 하단 시트(QuizFeedbackSheet)로 보인다.
import { useEffect, useRef, useState } from 'react';
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
import { QuizFeedbackSheet } from './QuizFeedbackSheet';
import { QUIZ_FEEDBACK_COLORS } from './quizFeedbackColors';
import { gradedAnnouncement, isUngraded } from './quizGrading';

type Choice = { index: number; label: string };
type MultipleChoices = { choices: Choice[]; answers: Set<number> };
type Phase = 'UNANSWERED' | 'SELECTING' | 'GRADING' | 'GRADED' | 'TRANSITIONING';

function multipleChoicesFor(quiz: Quiz): MultipleChoices | null {
  if (quiz.type !== 'MULTIPLE_CHOICE' || quiz.options?.mockHtmlType !== 'multi') return null;
  const rawChoices = quiz.options.choices;
  const rawAnswers = quiz.options.answer;
  if (
    !Array.isArray(rawChoices) ||
    !rawChoices.length ||
    !Array.isArray(rawAnswers) ||
    !rawAnswers.length
  )
    return null;

  const choices: Choice[] = [];
  for (const item of rawChoices) {
    if (
      !item ||
      typeof item !== 'object' ||
      !Number.isSafeInteger(item.index) ||
      typeof item.label !== 'string'
    )
      return null;
    choices.push({ index: item.index, label: item.label });
  }
  const choiceIds = new Set(choices.map((choice) => choice.index));
  const answers = new Set<number>(rawAnswers);
  if (
    choiceIds.size !== choices.length ||
    answers.size !== rawAnswers.length ||
    rawAnswers.some((answer) => !Number.isSafeInteger(answer) || !choiceIds.has(answer))
  )
    return null;
  return { choices, answers };
}

export function hasMultiChoiceOptions(quiz: Quiz): boolean {
  return multipleChoicesFor(quiz) !== null;
}

export function MultiChoiceQuiz({
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
  const data = multipleChoicesFor(quiz);
  // 채점하지 않는 문항은 고를 때 색을 보이지 않고, 정답 개수만큼 고르면 제출한다.
  const ungradedQuiz = isUngraded(quiz);
  const [phase, setPhase] = useState<Phase>('UNANSWERED');
  const phaseRef = useRef<Phase>('UNANSWERED');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectedRef = useRef<Set<number>>(new Set());
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const tintProgress = useRef<Record<number, Animated.Value>>({}).current;
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      sheetProgress.stopAnimation();
      Object.values(tintProgress).forEach((value) => value.stopAnimation());
    };
  }, [sheetProgress, tintProgress]);

  const moveTo = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const revealTint = (index: number) => {
    const progress = (tintProgress[index] ??= new Animated.Value(0));
    Animated.timing(progress, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };
  const grade = async (indices: Set<number>) => {
    if (phaseRef.current !== 'UNANSWERED' && phaseRef.current !== 'SELECTING') return;
    moveTo('GRADING');
    setError('');
    try {
      const graded = await submit({ texts: [...indices].map(String) });
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
      // 고른 보기와 색을 지우고 처음부터 다시 고르게 한다.
      selectedRef.current = new Set();
      setSelected(new Set());
      Object.values(tintProgress).forEach((value) => value.setValue(0));
      moveTo('UNANSWERED');
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    }
  };
  const choose = (index: number) => {
    if (
      disabled ||
      !data ||
      (phaseRef.current !== 'UNANSWERED' && phaseRef.current !== 'SELECTING') ||
      selectedRef.current.has(index)
    )
      return;
    const next = new Set(selectedRef.current).add(index);
    selectedRef.current = next;
    setSelected(next);
    setError('');
    if (ungradedQuiz) {
      if (next.size >= data.answers.size) void grade(next);
      else moveTo('SELECTING');
      return;
    }
    revealTint(index);
    if (!data.answers.has(index)) {
      data.answers.forEach(revealTint);
      void grade(next);
    } else if ([...data.answers].every((answer) => next.has(answer))) {
      void grade(next);
    } else {
      moveTo('SELECTING');
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

  if (!data) return <Text style={s.error}>선택지를 불러오지 못했습니다.</Text>;
  const question = quiz.question.replace(/\s*\n\s*/g, ' ');
  const graded = phase === 'GRADED' || phase === 'TRANSITIONING';
  const locked = disabled || (phase !== 'UNANSWERED' && phase !== 'SELECTING');
  const ungraded = ungradedQuiz || isUngraded(quiz, result);
  const wrongIndex = [...selected].find((index) => !data.answers.has(index));
  const showCorrectAnswers = wrongIndex !== undefined;
  // 오답이면 정답 보기를 해설 시트 첫 줄에 붙인다.
  const answerLine =
    result && !ungraded && result.isCorrect === false
      ? `정답: ${data.choices
          .filter((choice) => data.answers.has(choice.index))
          .map((choice) => choice.label)
          .join(', ')}`
      : null;
  const sheetResult =
    result && answerLine
      ? { ...result, explanation: [answerLine, result.explanation].filter(Boolean).join('\n') }
      : result;

  return (
    <View style={s.stage}>
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
        style={[s.body, { paddingTop: 200 * scale, paddingHorizontal: 36 * scale }]}
      >
        <View pointerEvents="box-none" style={[s.group, { gap: 40 * scale }]}>
          <Text style={[s.question, { maxWidth: 303 * scale }]}>{question}</Text>
          <View style={[s.options, { width: 320 * scale }]}>
            {data.choices.map((choice) => {
              const picked = selected.has(choice.index);
              const isAnswer = data.answers.has(choice.index);
              // 채점하지 않는 문항은 정답·오답 색 대신 고른 표시만 한다.
              const correct = !ungraded && isAnswer && (picked || showCorrectAnswers);
              const wrong = !ungraded && !isAnswer && picked;
              return (
                <Pressable
                  key={choice.index}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked, disabled: locked || picked }}
                  disabled={locked || picked}
                  onPress={() => choose(choice.index)}
                  style={[s.option, ungraded && picked && s.pickedOption]}
                >
                  {(correct || wrong) && (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        s.optionTint,
                        correct ? s.correctTint : s.wrongTint,
                        { opacity: (tintProgress[choice.index] ??= new Animated.Value(0)) },
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      s.optionText,
                      ungraded && picked && s.pickedText,
                      correct && s.correctText,
                      wrong && s.wrongText,
                    ]}
                  >
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
      {sheetResult ? (
        <QuizFeedbackSheet
          result={sheetResult}
          progress={sheetProgress}
          nextDisabled={phase !== 'GRADED'}
          onNext={advance}
          ungraded={ungraded}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  body: { alignItems: 'center' },
  group: { width: '100%', maxWidth: 330, alignItems: 'flex-start' },
  question: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    fontSize: 20,
    lineHeight: 26,
    includeFontPadding: false,
  },
  options: { maxWidth: '100%', alignItems: 'stretch' },
  option: {
    justifyContent: 'center',
    minHeight: 52,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#aaa',
    marginBottom: -1,
    paddingHorizontal: 36,
    paddingVertical: 16,
  },
  optionTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // Figma button_선택지 고르기: 회색 상하 경계선은 그대로 두고 배경·글자색만 바꾼다.
  correctTint: { backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background },
  wrongTint: { backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background },
  // 채점하지 않는 문항에서 고른 보기. 정답·오답 색이 아닌 회색으로 표시한다.
  pickedOption: { backgroundColor: 'rgba(170,170,170,0.18)' },
  optionText: {
    color: '#747474',
    fontFamily: 'PretendardSemiBold',
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
  },
  pickedText: { color: '#161616' },
  correctText: { color: QUIZ_FEEDBACK_COLORS.correct.text },
  wrongText: { color: QUIZ_FEEDBACK_COLORS.incorrect.text },
  error: { color: '#b56060', fontFamily: 'PretendardMedium', fontSize: 12, lineHeight: 18 },
});
