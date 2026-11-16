// MATCH(짝 맞추기) 퀴즈. 짝을 모두 맞추면 제출하고, 채점 뒤 해설은 하단 시트(QuizFeedbackSheet)로 보인다.
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

type Side = 'left' | 'right';
type Selection = { side: Side; index: number };
// PAIRED: 고른 두 칸이 짝으로 확정돼 사라지는 중. COMPLETED: 짝을 모두 맞춰 제출 직전.
type Phase =
  | 'IDLE'
  | 'FIRST_SELECTED'
  | 'CHECKING'
  | 'PAIRED'
  | 'INCORRECT'
  | 'COMPLETED'
  | 'GRADING'
  | 'FAILED'
  | 'GRADED'
  | 'TRANSITIONING';

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
  // 채점하지 않는 문항은 고른 두 칸을 정답 여부와 관계없이 짝으로 받고 정답·오답 색을 보이지 않는다.
  const ungradedQuiz = isUngraded(quiz);
  const fades = useRef(Array.from({ length: count * 2 }, () => new Animated.Value(1))).current;
  const wrongFade = useRef(new Animated.Value(1)).current;
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<Phase>('IDLE');
  const phaseRef = useRef<Phase>('IDLE');
  const [first, setFirst] = useState<Selection | null>(null);
  const firstRef = useRef<Selection | null>(null);
  const [second, setSecond] = useState<Selection | null>(null);
  // 맞춘 짝. 왼쪽 순번 → 오른쪽 순번.
  const pairsRef = useRef(new Map<number, number>());
  const [pairs, setPairs] = useState(new Map<number, number>());
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      fades.forEach((fade) => fade.stopAnimation());
      wrongFade.stopAnimation();
      sheetProgress.stopAnimation();
    };
  }, [fades, wrongFade, sheetProgress]);

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
  const isPaired = (side: Side, index: number) =>
    side === 'left' ? pairsRef.current.has(index) : [...pairsRef.current.values()].includes(index);

  const finish = async () => {
    if (!data || (phaseRef.current !== 'COMPLETED' && phaseRef.current !== 'FAILED')) return;
    moveTo('GRADING');
    setError('');
    try {
      const order = data.left.map((_, index) => pairsRef.current.get(index) ?? -1);
      const graded = await submit({ order });
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
      // 맞춘 짝은 되돌리지 않는다. 오류 문구를 눌러 같은 답안을 다시 제출한다.
      moveTo('FAILED');
      setError(cause instanceof Error ? cause.message : '답안을 저장하지 못했습니다.');
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
  const choose = (item: Selection) => {
    if (
      !data ||
      disabled ||
      !['IDLE', 'FIRST_SELECTED'].includes(phaseRef.current) ||
      isPaired(item.side, item.index)
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
    // 채점하지 않는 문항에서 같은 쪽 칸을 다시 고르면 첫 선택을 바꾼다(오답 표시 없음).
    if (ungradedQuiz && previous.side === item.side) {
      firstRef.current = item;
      setFirst(item);
      return;
    }
    setSecond(item);
    moveTo('CHECKING');
    const left = previous.side === 'left' ? previous : item.side === 'left' ? item : null;
    const right = previous.side === 'right' ? previous : item.side === 'right' ? item : null;
    if (!left || !right || (!ungradedQuiz && data.answer[left.index] !== right.index)) {
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
    moveTo('PAIRED');
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
        const next = new Map(pairsRef.current).set(left.index, right.index);
        pairsRef.current = next;
        setPairs(next);
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

  const graded = phase === 'GRADED' || phase === 'TRANSITIONING';
  const ungraded = ungradedQuiz || isUngraded(quiz, result);
  const pairedRight = new Set(pairs.values());

  const cell = (side: Side, index: number) => {
    const item = { side, index };
    const isFirst = first?.side === side && first.index === index;
    const isSecond = second?.side === side && second.index === index;
    const isActive = isFirst || isSecond;
    const isMatched = side === 'left' ? pairs.has(index) : pairedRight.has(index);
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
            isActive && phase === 'PAIRED' && (ungraded ? s.selected : s.correct),
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
        style={[s.body, { paddingTop: 160 * scale, paddingBottom: 40 * scale }]}
      >
        <View pointerEvents="box-none" style={[s.group, { width: 300 * scale }]}>
          <Text style={s.title}>짝을 맞춰보세요.</Text>
          <View pointerEvents="box-none" style={[s.grid, { rowGap: 12 * scale }]}>
            {data.left.map((_, index) => (
              <View key={index} pointerEvents="box-none" style={s.row}>
                {cell('left', index)}
                {cell('right', index)}
              </View>
            ))}
          </View>
          {error && phase === 'FAILED' ? (
            <Pressable accessibilityRole="button" onPress={() => void finish()}>
              <Text accessibilityRole="alert" style={s.error}>
                {error} 다시 시도
              </Text>
            </Pressable>
          ) : error ? (
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
          ungraded={ungraded}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  // 해설 시트가 화면 폭 전체를 쓰도록 좌우 여백은 시트 밖 본문에만 둔다.
  body: { alignItems: 'center', paddingHorizontal: 16 },
  group: { maxWidth: '100%', alignItems: 'center', gap: 40 },
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
