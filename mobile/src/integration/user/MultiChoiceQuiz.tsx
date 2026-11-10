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

type Choice = { index: number; label: string };
type MultipleChoices = { choices: Choice[]; answers: Set<number> };
type Phase = 'UNANSWERED' | 'SELECTING' | 'FEEDBACK' | 'FAILED' | 'ANSWERED' | 'TRANSITIONING';

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
  const [phase, setPhase] = useState<Phase>('UNANSWERED');
  const phaseRef = useRef<Phase>('UNANSWERED');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectedRef = useRef<Set<number>>(new Set());
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const tintProgress = useRef<Record<number, Animated.Value>>({}).current;
  const feedbackProgress = useRef(new Animated.Value(0)).current;
  const active = useRef(true);
  const submitting = useRef(false);
  const advancing = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      feedbackProgress.stopAnimation();
      Object.values(tintProgress).forEach((value) => value.stopAnimation());
    };
  }, [feedbackProgress, tintProgress]);

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
    if (submitting.current) return;
    submitting.current = true;
    moveTo('FEEDBACK');
    setError('');
    try {
      const graded = await submit({ texts: [...indices].map(String) });
      if (!active.current) return;
      setResult(graded);
      onGraded(graded);
      feedbackProgress.setValue(0);
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (!active.current) return;
      if (reduceMotion) {
        feedbackProgress.setValue(1);
        moveTo('ANSWERED');
      } else {
        Animated.timing(feedbackProgress, {
          toValue: 1,
          duration: 300,
          delay: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }).start(({ finished }) => {
          if (finished && active.current) moveTo('ANSWERED');
        });
      }
    } catch (cause) {
      if (!active.current) return;
      setError(cause instanceof Error ? cause.message : '정답을 확인하지 못했습니다.');
      moveTo('FAILED');
    } finally {
      submitting.current = false;
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
    if (phaseRef.current !== 'ANSWERED' || advancing.current) return;
    advancing.current = true;
    moveTo('TRANSITIONING');
    void Promise.resolve()
      .then(onAdvance)
      .catch((cause) => {
        if (!active.current) return;
        setError(cause instanceof Error ? cause.message : '다음 콘텐츠로 이동하지 못했습니다.');
        advancing.current = false;
        moveTo('ANSWERED');
      });
  };

  if (!data) return <Text style={s.error}>선택지를 불러오지 못했습니다.</Text>;
  const question = quiz.question.replace(/\s*\n\s*/g, ' ');
  const wrongIndex = [...selected].find((index) => !data.answers.has(index));
  const showCorrectAnswers = wrongIndex !== undefined;
  const mayAdvance = phase === 'ANSWERED';

  return (
    <View style={s.stage}>
      <Pressable disabled={!mayAdvance} onPress={advance} style={{ height: 200 * scale }} />
      <View style={s.groupRow}>
        <Pressable disabled={!mayAdvance} onPress={advance} style={s.sideSpace} />
        <View style={[s.group, { width: 330 * scale, maxWidth: '100%' }]}>
          <Text style={[s.question, { maxWidth: 303 * scale }]}>{question}</Text>
          <Pressable
            disabled={!mayAdvance}
            onPress={advance}
            style={{ height: 40 * scale, width: '100%' }}
          />
          <View style={[s.options, { width: 320 * scale, maxWidth: '100%' }]}>
            {data.choices.map((choice) => {
              const isCorrect = data.answers.has(choice.index);
              const correct = isCorrect && (selected.has(choice.index) || showCorrectAnswers);
              const wrong = !isCorrect && selected.has(choice.index);
              return (
                <Pressable
                  key={choice.index}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: selected.has(choice.index),
                    disabled:
                      disabled ||
                      (phase !== 'UNANSWERED' && phase !== 'SELECTING') ||
                      selected.has(choice.index),
                  }}
                  disabled={
                    disabled ||
                    (phase !== 'UNANSWERED' && phase !== 'SELECTING') ||
                    selected.has(choice.index)
                  }
                  onPress={() => choose(choice.index)}
                  style={s.option}
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
                  <Text style={[s.optionText, correct && s.correctText, wrong && s.wrongText]}>
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            disabled={!mayAdvance}
            onPress={advance}
            style={{ height: 24, width: '100%' }}
          />
          <View style={[s.feedbackSlot, { width: 320 * scale, maxWidth: '100%' }]}>
            {result ? (
              <Animated.View
                style={[
                  s.feedback,
                  {
                    opacity: feedbackProgress,
                    transform: [
                      {
                        translateY: feedbackProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [8, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Text style={[s.feedbackTitle, result.isCorrect ? s.correctText : s.wrongText]}>
                  {result.isCorrect ? '맞았어요!' : '오답입니다.'}
                </Text>
                {!result.isCorrect ? (
                  <Text style={s.feedbackText}>
                    정답:{' '}
                    {data.choices
                      .filter((choice) => data.answers.has(choice.index))
                      .map((choice) => choice.label)
                      .join(', ')}
                  </Text>
                ) : null}
                {result.explanation?.trim() ? (
                  <Text style={s.feedbackText}>{result.explanation}</Text>
                ) : null}
              </Animated.View>
            ) : null}
            {error ? (
              <View style={s.errorRow}>
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
                {phase === 'FAILED' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void grade(selectedRef.current)}
                  >
                    <Text style={s.retry}>다시 시도</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
        <Pressable disabled={!mayAdvance} onPress={advance} style={s.sideSpace} />
      </View>
      <Pressable disabled={!mayAdvance} onPress={advance} style={s.lowerSpace} />
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  groupRow: { flexDirection: 'row', width: '100%' },
  sideSpace: { flex: 1 },
  group: { alignItems: 'flex-start' },
  question: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    fontSize: 20,
    lineHeight: 26,
    includeFontPadding: false,
  },
  options: { alignItems: 'stretch' },
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
  correctTint: { backgroundColor: 'rgba(67,131,93,0.16)' },
  wrongTint: { backgroundColor: 'rgba(181,96,96,0.16)' },
  optionText: {
    color: '#747474',
    fontFamily: 'PretendardSemiBold',
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
  },
  correctText: { color: '#43835d' },
  wrongText: { color: '#b56060' },
  feedbackSlot: { minHeight: 132 },
  feedback: { paddingHorizontal: 12, paddingVertical: 12, gap: 5 },
  feedbackTitle: { fontFamily: 'PretendardBold', fontSize: 14 },
  feedbackText: { color: '#161616', fontFamily: 'PretendardRegular', fontSize: 13, lineHeight: 20 },
  errorRow: { paddingHorizontal: 12, gap: 8 },
  error: { color: '#b56060', fontFamily: 'PretendardMedium', fontSize: 12, lineHeight: 18 },
  retry: { color: '#161616', fontFamily: 'PretendardSemiBold', fontSize: 13 },
  lowerSpace: { flexGrow: 1, minHeight: 80 },
});
