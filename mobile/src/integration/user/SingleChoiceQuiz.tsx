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
type Phase = 'UNANSWERED' | 'FEEDBACK' | 'ANSWERED' | 'TRANSITIONING';

function choicesFor(quiz: Quiz): Choice[] | null {
  if (quiz.type !== 'MULTIPLE_CHOICE' || quiz.options?.mockHtmlType === 'multi') return null;
  const raw = quiz.options?.choices;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const choices: Choice[] = [];
  for (const item of raw) {
    if (
      !item ||
      typeof item !== 'object' ||
      !Number.isSafeInteger(item.index) ||
      typeof item.label !== 'string'
    )
      return null;
    choices.push({ index: item.index, label: item.label });
  }
  return new Set(choices.map((choice) => choice.index)).size === choices.length ? choices : null;
}

export function hasSingleChoiceOptions(quiz: Quiz): boolean {
  return choicesFor(quiz) !== null;
}

function correctChoiceIndex(result: AnswerResult, quiz: Quiz): number | null {
  const raw = result.correctAnswer.index ?? result.correctAnswer.answer ?? quiz.options?.answer;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return Number.isSafeInteger(value) ? (value as number) : null;
}

export function SingleChoiceQuiz({
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
  const choices = choicesFor(quiz);
  const [phase, setPhase] = useState<Phase>('UNANSWERED');
  const phaseRef = useRef<Phase>('UNANSWERED');
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const feedbackProgress = useRef(new Animated.Value(0)).current;
  const active = useRef(true);
  const submitting = useRef(false);
  const advancing = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      feedbackProgress.stopAnimation();
    };
  }, [feedbackProgress]);

  const moveTo = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const choose = async (index: number) => {
    if (disabled || phaseRef.current !== 'UNANSWERED' || submitting.current) return;
    submitting.current = true;
    moveTo('FEEDBACK');
    setSelected(index);
    setError('');
    try {
      const graded = await submit({ index });
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
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }).start(({ finished }) => {
          if (finished && active.current) moveTo('ANSWERED');
        });
      }
    } catch (cause) {
      if (!active.current) return;
      setSelected(null);
      moveTo('UNANSWERED');
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    } finally {
      submitting.current = false;
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

  if (!choices) return <Text style={s.error}>선택지를 불러오지 못했습니다.</Text>;
  const correctIndex = result ? correctChoiceIndex(result, quiz) : null;
  const question = quiz.question.replace(/\s*\n\s*/g, ' ');

  return (
    <View style={s.stage}>
      <Pressable
        disabled={phase !== 'ANSWERED'}
        onPress={advance}
        style={{ height: 200 * scale }}
      />
      <View style={s.groupRow}>
        <Pressable disabled={phase !== 'ANSWERED'} onPress={advance} style={s.sideSpace} />
        <View style={[s.group, { width: 330 * scale, maxWidth: '100%' }]}>
          <Text style={[s.question, { maxWidth: 290 * scale }]}>{question}</Text>
          <Pressable
            disabled={phase !== 'ANSWERED'}
            onPress={advance}
            style={{ height: 40 * scale, width: '100%' }}
          />
          <View style={[s.options, { width: 320 * scale, maxWidth: '100%' }]}>
            {choices.map((choice) => {
              const correct =
                result &&
                (result.isCorrect ? selected === choice.index : correctIndex === choice.index);
              const wrong = result && !result.isCorrect && selected === choice.index;
              return (
                <Pressable
                  key={choice.index}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: selected === choice.index,
                    disabled: disabled || phase !== 'UNANSWERED',
                  }}
                  disabled={disabled || phase !== 'UNANSWERED'}
                  onPress={() => void choose(choice.index)}
                  style={s.option}
                >
                  {(correct || wrong) && (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        s.optionTint,
                        correct ? s.correctTint : s.wrongTint,
                        { opacity: feedbackProgress },
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
            disabled={phase !== 'ANSWERED'}
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
                {!result.isCorrect && correctIndex !== null ? (
                  <Text style={s.feedbackText}>
                    정답: {choices.find((choice) => choice.index === correctIndex)?.label}
                  </Text>
                ) : null}
                {result.explanation?.trim() ? (
                  <Text style={s.feedbackText}>{result.explanation}</Text>
                ) : null}
              </Animated.View>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable disabled={phase !== 'ANSWERED'} onPress={advance} style={s.sideSpace} />
      </View>
      <Pressable disabled={phase !== 'ANSWERED'} onPress={advance} style={s.lowerSpace} />
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
  error: { color: '#b56060', fontFamily: 'PretendardMedium', fontSize: 12, lineHeight: 18 },
  lowerSpace: { flexGrow: 1, minHeight: 80 },
});
