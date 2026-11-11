// SLIDER(0~1) 퀴즈. 트랙·손잡이·눈금·해설 상자는 HtmlLessonQuiz 의 range 슬라이더 값을 그대로 쓴다.
// 드래그 중에는 위치만 바꾸고, 손을 뗄 때 한 번 제출한다. 채점·근접도·정답 위치는 서버 응답만 쓴다.
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import {
  closenessText,
  createReleaseSubmitter,
  positionAt,
  serverAnswerPosition,
  tickPositions,
} from './sliderQuizState';

export function isSliderQuiz(quiz: Quiz | null | undefined): boolean {
  const ticks = quiz?.options?.ticks;
  return (
    quiz?.type === 'SLIDER' &&
    Array.isArray(ticks) &&
    ticks.length >= 2 &&
    ticks.every((tick) => typeof tick === 'string')
  );
}

const DEFAULT_HINT = '막대를 움직여 답을 골라 보세요.';

export function SliderQuiz({
  quiz,
  disabled,
  submit,
  onGraded,
  onAdvance,
}: {
  quiz: Quiz;
  disabled: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  // 없으면 부모 화면이 다음 이동을 처리한다(복습 화면의 전체 터치 영역).
  onAdvance?: () => Promise<void> | void;
}) {
  const ticks = tickPositions(quiz.options?.ticks as string[]);
  const hint = typeof quiz.options?.hint === 'string' ? quiz.options.hint : DEFAULT_HINT;
  const [position, setPosition] = useState(0.5);
  const [width, setWidth] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0.5);
  const advancing = useRef(false);
  const submitter = useRef(
    createReleaseSubmitter((value: number) => submit({ position: value })),
  ).current;
  const locked = disabled || !!result || busy;

  const move = (x: number) => {
    if (locked) return;
    latest.current = positionAt(x, width);
    setPosition(latest.current);
  };
  const release = async (x: number) => {
    if (locked) return;
    move(x);
    setBusy(true);
    setError('');
    try {
      const graded = await submitter.release(latest.current);
      if (graded) {
        setResult(graded);
        onGraded(graded);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  const advance = () => {
    if (!result || !onAdvance || advancing.current) return;
    advancing.current = true;
    void Promise.resolve()
      .then(onAdvance)
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : '다음 콘텐츠로 이동하지 못했습니다.');
      })
      .finally(() => {
        advancing.current = false;
      });
  };

  const answerAt = result ? serverAnswerPosition(result) : null;
  const closeness = result ? closenessText(result) : null;
  const canAdvance = !!result && !!onAdvance;

  return (
    <View style={s.page}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 학습 콘텐츠로 이동"
        disabled={!canAdvance}
        onPress={advance}
      >
        <Text style={s.question}>{quiz.question}</Text>
      </Pressable>
      <View style={s.rangeArea}>
        <Text style={s.hint}>{hint}</Text>
        <View
          style={s.sliderTouch}
          accessibilityRole="adjustable"
          accessibilityLabel="답 위치 조절"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(position * 100) }}
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => !locked}
          onMoveShouldSetResponder={() => !locked}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(event) => move(event.nativeEvent.locationX)}
          onResponderMove={(event) => move(event.nativeEvent.locationX)}
          onResponderRelease={(event) => void release(event.nativeEvent.locationX)}
        >
          <View pointerEvents="none" style={s.sliderTrack}>
            <View style={[s.sliderFill, { width: `${position * 100}%` }]} />
          </View>
          {answerAt !== null ? (
            <View pointerEvents="none" style={[s.answerMark, { left: `${answerAt * 100}%` }]} />
          ) : null}
          <View pointerEvents="none" style={[s.sliderThumb, { left: `${position * 100}%` }]} />
        </View>
        <View style={s.ticks}>
          {ticks.map((tick, index) => (
            <Text
              key={`${index}:${tick.label}`}
              numberOfLines={2}
              style={[
                s.tick,
                index === 0
                  ? s.tickStart
                  : index === ticks.length - 1
                    ? s.tickEnd
                    : [s.tickMiddle, { left: `${tick.position * 100}%` }],
              ]}
            >
              {tick.label}
            </Text>
          ))}
        </View>
      </View>
      {result ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 학습 콘텐츠로 이동"
          disabled={!canAdvance}
          onPress={advance}
          style={[s.feedback, result.isCorrect && s.feedbackGood]}
        >
          <Text style={s.feedbackTitle}>
            {result.isCorrect ? '맞았어요!' : '함께 확인해 볼까요?'}
          </Text>
          {closeness ? <Text style={s.feedbackText}>{closeness}</Text> : null}
          {result.explanation ? <Text style={s.feedbackText}>{result.explanation}</Text> : null}
        </Pressable>
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 학습 콘텐츠로 이동"
        disabled={!canAdvance}
        onPress={advance}
        style={s.lowerSpace}
      />
    </View>
  );
}

// HtmlLessonQuiz 의 range·feedback 스타일 값과 같다. 눈금 위치·정답 표시만 추가했다.
const s = StyleSheet.create({
  page: { flexGrow: 1, gap: 15 },
  question: {
    color: '#282636',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 38,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 15,
  },
  rangeArea: { gap: 15 },
  hint: { color: '#aaa1b3', fontSize: 11, textAlign: 'center' },
  sliderTouch: { height: 38, justifyContent: 'center' },
  sliderTrack: { height: 5, backgroundColor: '#e9e5ef', borderRadius: 5 },
  sliderFill: { height: 5, backgroundColor: '#827094', borderRadius: 5 },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#827094',
    marginLeft: -10,
  },
  answerMark: {
    position: 'absolute',
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#83ac92',
    marginLeft: -1.5,
  },
  ticks: { minHeight: 30 },
  tick: { position: 'absolute', top: 0, color: '#aaa1b3', fontSize: 11, width: 72 },
  tickStart: { left: 0, textAlign: 'left' },
  tickEnd: { right: 0, textAlign: 'right' },
  tickMiddle: { marginLeft: -36, textAlign: 'center' },
  feedback: {
    backgroundColor: '#f5f3f8',
    borderRadius: 14,
    padding: 17,
    gap: 5,
  },
  feedbackGood: { backgroundColor: '#f0f6f1' },
  feedbackTitle: { color: '#282636', fontWeight: '700', fontSize: 13 },
  feedbackText: { color: '#282636', fontSize: 13, lineHeight: 23 },
  error: { color: '#b56060', fontSize: 12 },
  lowerSpace: { flexGrow: 1, minHeight: 80 },
});
