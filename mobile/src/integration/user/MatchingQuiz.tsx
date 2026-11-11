import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { QUIZ_FEEDBACK_COLORS } from './quizFeedbackColors';

type Side = 'left' | 'right';
type Selection = { side: Side; index: number };
type Phase =
  'IDLE' | 'FIRST_SELECTED' | 'CHECKING' | 'CORRECT' | 'INCORRECT' | 'COMPLETED' | 'TRANSITIONING';

function matchingPairsFor(quiz: Quiz) {
  if (quiz.type !== 'ORDERING') return null;
  const { left, right, answer } = quiz.options ?? {};
  if (
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    !Array.isArray(answer) ||
    left.length === 0 ||
    left.length !== right.length ||
    left.length !== answer.length ||
    !left.every((label) => typeof label === 'string') ||
    !right.every((label) => typeof label === 'string') ||
    !answer.every((index) => Number.isSafeInteger(index) && index >= 0 && index < right.length) ||
    new Set(answer).size !== answer.length
  )
    return null;
  return { left: left as string[], right: right as string[], answer: answer as number[] };
}

export function hasMatchingPairs(quiz: Quiz): boolean {
  return matchingPairsFor(quiz) !== null;
}

export function MatchingQuiz({
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
  const data = matchingPairsFor(quiz);
  const count = data?.left.length ?? 0;
  const fades = useRef(Array.from({ length: count * 2 }, () => new Animated.Value(1))).current;
  const wrongFade = useRef(new Animated.Value(1)).current;
  const [phase, setPhase] = useState<Phase>('IDLE');
  const phaseRef = useRef<Phase>('IDLE');
  const [first, setFirst] = useState<Selection | null>(null);
  const firstRef = useRef<Selection | null>(null);
  const [second, setSecond] = useState<Selection | null>(null);
  const matchedRef = useRef(new Set<number>());
  const [matched, setMatched] = useState(new Set<number>());
  const [error, setError] = useState('');
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const active = useRef(true);
  const submitting = useRef(false);
  const graded = useRef(false);
  const transitioning = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      fades.forEach((fade) => fade.stopAnimation());
      wrongFade.stopAnimation();
    };
  }, [fades, wrongFade]);

  const moveTo = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const after = (delay: number, callback: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (active.current) callback();
    }, delay);
    timers.current.add(timer);
  };
  const clearSelection = () => {
    firstRef.current = null;
    setFirst(null);
    setSecond(null);
  };
  const finish = async () => {
    if (!data || submitting.current || transitioning.current) return;
    submitting.current = true;
    setError('');
    try {
      if (!graded.current) {
        const result = await submit({ order: data.answer });
        if (!active.current) return;
        graded.current = true;
        onGraded(result);
      }
      transitioning.current = true;
      moveTo('TRANSITIONING');
      await onAdvance();
    } catch (cause) {
      if (!active.current) return;
      transitioning.current = false;
      moveTo('COMPLETED');
      setError(cause instanceof Error ? cause.message : '답안을 저장하지 못했습니다.');
    } finally {
      submitting.current = false;
    }
  };
  const choose = (item: Selection) => {
    if (
      !data ||
      disabled ||
      !['IDLE', 'FIRST_SELECTED'].includes(phaseRef.current) ||
      matchedRef.current.has(item.side === 'left' ? item.index : data.answer.indexOf(item.index))
    )
      return;
    const previous = firstRef.current;
    if (!previous) {
      firstRef.current = item;
      setFirst(item);
      moveTo('FIRST_SELECTED');
      return;
    }
    if (previous.side === item.side && previous.index === item.index) {
      clearSelection();
      moveTo('IDLE');
      return;
    }
    setSecond(item);
    moveTo('CHECKING');
    const left = previous.side === 'left' ? previous : item.side === 'left' ? item : null;
    const right = previous.side === 'right' ? previous : item.side === 'right' ? item : null;
    if (!left || !right || data.answer[left.index] !== right.index) {
      wrongFade.setValue(1);
      moveTo('INCORRECT');
      after(320, () => {
        Animated.timing(wrongFade, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }).start(({ finished }) => {
          if (!finished || !active.current) return;
          clearSelection();
          moveTo('IDLE');
        });
      });
      return;
    }
    moveTo('CORRECT');
    after(300, () => {
      Animated.parallel(
        [fades[left.index], fades[count + right.index]].map((fade) =>
          Animated.timing(fade, {
            toValue: 0,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ),
      ).start(({ finished }) => {
        if (!finished || !active.current) return;
        const next = new Set(matchedRef.current).add(left.index);
        matchedRef.current = next;
        setMatched(next);
        clearSelection();
        if (next.size === count) {
          moveTo('COMPLETED');
          void finish();
        } else {
          moveTo('IDLE');
        }
      });
    });
  };

  if (!data) return <Text style={s.error}>짝 맞추기 문제를 불러오지 못했습니다.</Text>;

  const cell = (side: Side, index: number) => {
    const item = { side, index };
    const isFirst = first?.side === side && first.index === index;
    const isSecond = second?.side === side && second.index === index;
    const isActive = isFirst || isSecond;
    const isMatched =
      side === 'left' ? matched.has(index) : matched.has(data.answer.indexOf(index));
    const fade = fades[(side === 'left' ? 0 : count) + index];
    return (
      <Animated.View
        key={`${side}-${index}`}
        style={[
          s.slot,
          {
            opacity: fade,
            transform: [
              { scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
            ],
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={data[side][index]}
          accessibilityState={{ selected: isActive, disabled: isMatched || disabled }}
          disabled={isMatched || disabled || !['IDLE', 'FIRST_SELECTED'].includes(phase)}
          onPress={() => choose(item)}
          style={[
            s.choice,
            isActive && phase === 'FIRST_SELECTED' && s.selected,
            isActive && phase === 'CORRECT' && s.correct,
          ]}
        >
          {isActive && phase === 'INCORRECT' ? (
            <Animated.View pointerEvents="none" style={[s.incorrect, { opacity: wrongFade }]} />
          ) : null}
          <Text style={[s.choiceText, isActive && s.activeText]}>{data[side][index]}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={[s.stage, { paddingTop: 160 * scale, paddingBottom: 40 * scale }]}>
      <View style={[s.group, { width: 300 * scale, maxWidth: '100%' }]}>
        <Text style={s.title}>짝을 맞춰보세요.</Text>
        <View style={[s.grid, { rowGap: 12 * scale }]}>
          {data.left.map((_, index) => (
            <View key={index} style={s.row}>
              {cell('left', index)}
              {cell('right', index)}
            </View>
          ))}
        </View>
        {error ? (
          <Pressable accessibilityRole="button" onPress={() => void finish()}>
            <Text style={s.error}>{error} 다시 시도</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flexGrow: 1, alignItems: 'center' },
  group: { alignItems: 'center', gap: 40 },
  title: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
    includeFontPadding: false,
  },
  grid: { width: '100%' },
  row: { flexDirection: 'row', gap: 9 },
  slot: { flex: 1, height: 52 },
  choice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  choiceText: {
    color: '#747474',
    fontFamily: 'PretendardMedium',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
  selected: { backgroundColor: 'rgba(170,170,170,0.18)' },
  activeText: { color: '#161616' },
  correct: { backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background },
  incorrect: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background,
  },
  error: { color: '#a94444', fontFamily: 'PretendardMedium', fontSize: 13, textAlign: 'center' },
});
