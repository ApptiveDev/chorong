// 축소 그림. SINGLE + config.presentation.type === 'ZOOM_OUT'.
// Figma 축소 그림(740:1763)·정답(740:1817)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
//
// 사진의 무작위 지점을 서버 stages(배율, 예: [6, 4, 2, 1])의 첫 배율로 크게 확대해 두고
// 단계를 앞에서 뒤로 아주 천천히 지나 원본 크기(1배)로 줄인다. 단계 사이 칸은 같은 시간이다.
// 그 지점을 화면에 고정한 채 확대·축소하므로(x' = s·x + p·(1 − s)) 지점이 사진 안이면
// 어느 배율에서도 사진이 틀을 빈틈없이 채운다. 칸 안에서는 배율을 같은 비율씩 줄여 일정한 속도로 보인다.
// 정답이면 해설 시트에 'n배 확대에서 맞췄어요.'를 덧붙인다(n: 보기를 고른 순간의 배율, 반올림).
import { useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { studyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { presentationImageUrl, presentationStages } from './presentationImage';
import { useSlowReveal } from './slowReveal';

// stages 가 없거나 규칙에 맞지 않을 때 쓰는 배율.
export const ZOOM_OUT_DEFAULT_STAGES = [6, 1] as const;
// 첫 배율에서 원본 크기가 될 때까지 걸리는 시간(단계 수와 관계없이 같다). 채점 뒤 마무리는 slowReveal 이 정한다.
export const ZOOM_OUT_DURATION_MS = 36000;
// 확대 지점을 고르는 범위(사진 폭·높이 비율). 가장자리 빈 배경에 걸리는 일을 줄인다.
export const ZOOM_OUT_FOCUS_RANGE = { min: 0.15, max: 0.85 } as const;
// 단계 사이 칸 하나를 나누는 표본 수. 칸 안의 곡선을 구간별 직선으로 근사한다.
const SAMPLES_PER_SPAN = 6;

type Random = () => number;

/** 확대 지점(사진 왼쪽 위 기준 0~1 비율). */
export function randomZoomFocus(random: Random = Math.random) {
  const pick = () =>
    ZOOM_OUT_FOCUS_RANGE.min + random() * (ZOOM_OUT_FOCUS_RANGE.max - ZOOM_OUT_FOCUS_RANGE.min);
  return { x: pick(), y: pick() };
}

/** 진행 t(0~1)에 따른 배율. 단계 i → i+1 칸에서 stages[i]·(stages[i+1]/stages[i])^u 로 줄어든다. */
export function zoomScaleAt(progress: number, stages: readonly number[]) {
  const spans = stages.length - 1;
  if (spans <= 0) return stages[0] ?? 1;
  const position = Math.min(Math.max(progress, 0), 1) * spans;
  const span = Math.min(Math.floor(position), spans - 1);
  const from = stages[span];
  const to = stages[span + 1];
  return from * (to / from) ** (position - span);
}

/** 배율 곡선 표본(Animated interpolate 용). 단계 값에서 정확히 꺾이도록 칸마다 같은 수로 나눈다. */
export function zoomScaleCurve(stages: readonly number[], samplesPerSpan = SAMPLES_PER_SPAN) {
  const spans = Math.max(stages.length - 1, 1);
  const count = spans * samplesPerSpan;
  const input = Array.from({ length: count + 1 }, (_, i) => i / count);
  return { input, scale: input.map((t) => zoomScaleAt(t, stages)) };
}

/** 정답 문구. 원본 크기(1배)까지 줄어든 뒤 맞혔으면 배율 대신 원본이라고 쓴다. */
export function zoomOutCorrectNote(scale: number) {
  const rounded = Math.round(scale);
  return rounded <= 1 ? '원본 크기에서 맞췄어요.' : `${rounded}배 확대에서 맞췄어요.`;
}

export function ZoomOutQuiz(props: PresentedChoiceProps) {
  const url = presentationImageUrl(props.quiz, 'ZOOM_OUT');
  const stages = presentationStages(props.quiz, 'ZOOM_OUT') ?? [...ZOOM_OUT_DEFAULT_STAGES];
  const [answeredScale, setAnsweredScale] = useState<number | null>(null);
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={80}
      gap={20}
      correctNote={answeredScale === null ? null : zoomOutCorrectNote(answeredScale)}
      media={({ locked, graded }) =>
        url ? (
          <ZoomOutImage
            url={url}
            stages={stages}
            scale={props.scale}
            paused={locked}
            finish={graded}
            onAnswerScale={setAnsweredScale}
          />
        ) : null
      }
    />
  );
}

// Figma 740:1768: 폭 전체(330)×260, 모서리 12, 사진 뒤 #D9D9D9.
function ZoomOutImage({
  url,
  stages,
  scale,
  paused,
  finish,
  onAnswerScale,
}: {
  url: string;
  // 배율. 마지막은 1(원본 크기).
  stages: number[];
  scale: number;
  paused: boolean;
  finish: boolean;
  onAnswerScale: (scale: number) => void;
}) {
  const [focus] = useState(() => randomZoomFocus());
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const progress = useSlowReveal({
    started: loaded && !!size,
    paused,
    finish,
    durationMs: ZOOM_OUT_DURATION_MS,
    onPause: (value) => onAnswerScale(zoomScaleAt(value, stages)),
  });

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { width, height } = nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  // 확대 지점의 틀 가운데 기준 위치(px). 크기를 재기 전에는 가운데로 둔다.
  const px = size ? (focus.x - 0.5) * size.width : 0;
  const py = size ? (focus.y - 0.5) * size.height : 0;
  const curve = zoomScaleCurve(stages);
  const transform = [
    {
      translateX: progress.interpolate({
        inputRange: curve.input,
        outputRange: curve.scale.map((s) => px * (1 - s)),
      }),
    },
    {
      translateY: progress.interpolate({
        inputRange: curve.input,
        outputRange: curve.scale.map((s) => py * (1 - s)),
      }),
    },
    { scale: progress.interpolate({ inputRange: curve.input, outputRange: curve.scale }) },
  ];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="크게 확대했다가 점점 줄어드는 사진"
      onLayout={onLayout}
      style={[s.frame, { height: 260 * scale }]}
    >
      <Animated.Image
        source={studyImageSource(url)}
        resizeMode="cover"
        onLoadEnd={() => setLoaded(true)}
        style={[s.photo, { transform }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#D9D9D9',
  },
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
});
