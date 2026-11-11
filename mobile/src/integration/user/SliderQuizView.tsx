// 슬라이더 퀴즈 공통 화면. Figma `L03-11 슬라이더`(300:672·300:712)를 따른다.
// 값 계산·제출은 쓰는 쪽(SliderQuiz·HtmlLessonQuiz range)이 맡고, 여기서는 0~1 위치만 주고받는다.
import { useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { positionAt } from './sliderQuizState';
import { QUIZ_FEEDBACK_COLORS } from './quizFeedbackColors';

export const DEFAULT_SLIDER_HINT = '끌어서 고르기';
// 손잡이(높이 20)보다 넓게 잡히도록 위아래로 늘리는 터치 여백.
const TOUCH_SLOP = 12;

export type SliderTick = { label: string; position: number };

export function SliderQuizView({
  question,
  hint,
  ticks,
  position,
  valueLabel,
  answerAt = null,
  locked,
  onMove,
  onRelease,
  canAdvance = false,
  onAdvance,
  error,
  children,
}: {
  question: string;
  hint: string;
  ticks: SliderTick[];
  // 0(왼쪽 끝)~1(오른쪽 끝). 화면 표시용 위치다.
  position: number;
  valueLabel: string;
  answerAt?: number | null;
  locked: boolean;
  onMove: (position: number) => void;
  onRelease?: (position: number) => void;
  canAdvance?: boolean;
  onAdvance?: () => void;
  error?: string;
  // 해설 등 값 문구 아래에 놓을 내용.
  children?: ReactNode;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scale = Math.min(windowWidth / 402, windowHeight / 874, 1);
  const [width, setWidth] = useState(0);
  // 드래그 시작 시 트랙 왼쪽 끝의 pageX. 이동 중 locationX 는 기준 뷰가 바뀔 수 있어 pageX 로 계산한다.
  const originX = useRef(0);

  const at = (event: GestureResponderEvent) =>
    positionAt(event.nativeEvent.pageX - originX.current, width);
  const grant = (event: GestureResponderEvent) => {
    originX.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
    if (!locked) onMove(at(event));
    // Android 에서 ScrollView 같은 네이티브 응답자가 드래그를 가로채지 못하게 한다.
    return true;
  };
  const move = (event: GestureResponderEvent) => {
    if (!locked) onMove(at(event));
  };
  const release = (event: GestureResponderEvent) => {
    if (locked) return;
    const next = at(event);
    onMove(next);
    onRelease?.(next);
  };
  const advanceArea = (style: StyleProp<ViewStyle>, content?: ReactNode) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="다음 학습 콘텐츠로 이동"
      disabled={!canAdvance || !onAdvance}
      onPress={onAdvance}
      style={style}
    >
      {content}
    </Pressable>
  );

  return (
    <View style={[s.stage, { paddingHorizontal: 28 * scale }]}>
      {advanceArea({ height: 200 * scale })}
      {advanceArea(
        [s.questionBox, { width: 320 * scale }],
        <Text style={s.question}>{question}</Text>,
      )}
      {advanceArea({ height: 64 * scale })}
      <Text style={s.hint}>{hint}</Text>
      <View style={s.card}>
        <View
          style={s.sliderTouch}
          hitSlop={{ left: 20, right: 20 }}
          accessibilityRole="adjustable"
          accessibilityLabel="답 위치 조절"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(position * 100) }}
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => !locked}
          onMoveShouldSetResponder={() => !locked}
          onResponderTerminationRequest={() => false}
          onResponderGrant={grant}
          onResponderMove={move}
          onResponderRelease={release}
        >
          <View pointerEvents="none" style={s.slider}>
            <View style={s.track} />
            {ticks.map((tick, index) => (
              <View
                key={`${index}:${tick.label}`}
                style={[s.tickMark, { left: tick.position * width - 0.7 }]}
              />
            ))}
            <View style={[s.fill, { width: position * width }]} />
            {answerAt !== null ? (
              <View style={[s.answerMark, { left: answerAt * width - 1 }]} />
            ) : null}
            <View style={[s.thumb, { left: position * width - 2 }]} />
          </View>
        </View>
        <View style={s.labels}>
          {ticks.map((tick, index) => {
            const first = index === 0;
            const last = index === ticks.length - 1;
            // 눈금 사이 중간점까지를 라벨 칸으로 쓴다. 양 끝은 반 칸이라 겹치지 않는다.
            return (
              <Text
                key={`${index}:${tick.label}`}
                numberOfLines={2}
                style={[
                  s.label,
                  first ? s.labelStart : last ? s.labelEnd : s.labelMiddle,
                  { flex: first || last ? 1 : 2 },
                ]}
              >
                {tick.label}
              </Text>
            );
          })}
        </View>
      </View>
      <Text style={s.value}>{valueLabel}</Text>
      {children}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {advanceArea(s.lowerSpace)}
    </View>
  );
}

// 정오답·해설. 색상·글꼴은 SingleChoiceQuiz 와 같다.
export function SliderFeedback({
  correct,
  title,
  lines,
  canAdvance = false,
  onAdvance,
}: {
  correct: boolean;
  title: string;
  lines: (string | null | undefined)[];
  canAdvance?: boolean;
  onAdvance?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="다음 학습 콘텐츠로 이동"
      disabled={!canAdvance || !onAdvance}
      onPress={onAdvance}
      style={s.feedback}
    >
      <Text style={[s.feedbackTitle, correct ? s.correctText : s.wrongText]}>{title}</Text>
      {lines.map((line, index) =>
        line?.trim() ? (
          <Text key={index} style={s.feedbackText}>
            {line}
          </Text>
        ) : null,
      )}
    </Pressable>
  );
}

// 수치는 Figma 300:712 값.
const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  questionBox: { alignSelf: 'center', maxWidth: '100%' },
  question: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    fontSize: 20,
    lineHeight: 24,
    includeFontPadding: false,
  },
  hint: {
    color: '#747474',
    fontFamily: 'PretendardMedium',
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'center',
    marginBottom: 18,
  },
  card: {
    minHeight: 128,
    justifyContent: 'center',
    gap: 23,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 12,
    shadowColor: '#f1f1f1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6.4,
  },
  sliderTouch: { paddingVertical: TOUCH_SLOP, marginVertical: -TOUCH_SLOP },
  slider: { height: 27 },
  track: {
    position: 'absolute',
    top: 9,
    left: -1,
    right: -1,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#aaa',
  },
  tickMark: { position: 'absolute', top: 15, width: 1.4, height: 12, backgroundColor: '#aaa' },
  fill: {
    position: 'absolute',
    top: 9,
    left: -1,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#ebc60f',
  },
  answerMark: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 20,
    borderRadius: 1,
    backgroundColor: QUIZ_FEEDBACK_COLORS.correct.border,
  },
  thumb: {
    position: 'absolute',
    top: -2,
    width: 4,
    height: 24,
    borderRadius: 2,
    backgroundColor: '#ebc60f',
  },
  labels: { flexDirection: 'row' },
  label: {
    color: '#161616',
    fontFamily: 'PretendardMedium',
    fontSize: 12,
    lineHeight: 14,
    includeFontPadding: false,
  },
  labelStart: { textAlign: 'left' },
  labelMiddle: { textAlign: 'center' },
  labelEnd: { textAlign: 'right' },
  value: {
    color: '#747474',
    fontFamily: 'PretendardMedium',
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 20,
  },
  feedback: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 12, gap: 5 },
  feedbackTitle: { fontFamily: 'PretendardBold', fontSize: 14 },
  correctText: { color: QUIZ_FEEDBACK_COLORS.correct.text },
  wrongText: { color: QUIZ_FEEDBACK_COLORS.incorrect.text },
  feedbackText: { color: '#161616', fontFamily: 'PretendardRegular', fontSize: 13, lineHeight: 20 },
  error: {
    marginTop: 8,
    color: '#b56060',
    fontFamily: 'PretendardMedium',
    fontSize: 12,
    lineHeight: 18,
  },
  lowerSpace: { flexGrow: 1, minHeight: 80 },
});
