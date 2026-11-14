// 축소 그림. SINGLE + config.presentation.type === 'ZOOM_OUT'.
// Figma 축소 그림(740:1763)·정답(740:1817)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
//
// 사진의 무작위 지점을 ZOOM_OUT_START_SCALE 배로 크게 확대해 두고 아주 천천히 원본 크기(1배)로 줄인다.
// 그 지점을 화면에 고정한 채 확대·축소하므로(x' = s·x + p·(1 − s)) 지점이 사진 안이면
// 어느 배율에서도 사진이 틀을 빈틈없이 채운다. 배율은 N^(1−t) 로 줄어 눈에는 일정한 속도로 보인다.
// 서버의 stages(배율 목록)는 아직 쓰지 않는다(화면 규칙을 앱이 정한다).
import { useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { studyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { presentationImageUrl } from './presentationImage';
import { useSlowReveal } from './slowReveal';

// 처음 배율(N배).
export const ZOOM_OUT_START_SCALE = 6;
// 처음 배율에서 원본 크기가 될 때까지 걸리는 시간. 채점 뒤 마무리 시간은 slowReveal 이 정한다.
export const ZOOM_OUT_DURATION_MS = 36000;
// 확대 지점을 고르는 범위(사진 폭·높이 비율). 가장자리 빈 배경에 걸리는 일을 줄인다.
export const ZOOM_OUT_FOCUS_RANGE = { min: 0.15, max: 0.85 } as const;
// 배율 곡선을 나누는 칸 수. 곡선을 구간별 직선으로 근사한다.
const CURVE_STEPS = 12;

type Random = () => number;

/** 확대 지점(사진 왼쪽 위 기준 0~1 비율). */
export function randomZoomFocus(random: Random = Math.random) {
  const pick = () =>
    ZOOM_OUT_FOCUS_RANGE.min + random() * (ZOOM_OUT_FOCUS_RANGE.max - ZOOM_OUT_FOCUS_RANGE.min);
  return { x: pick(), y: pick() };
}

/** 진행 t(0~1)에 따른 배율 N^(1−t) 표본. 0 에서 N배, 1 에서 1배. */
export function zoomScaleCurve(start = ZOOM_OUT_START_SCALE, steps = CURVE_STEPS) {
  const input = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  return { input, scale: input.map((t) => start ** (1 - t)) };
}

export function ZoomOutQuiz(props: PresentedChoiceProps) {
  const url = presentationImageUrl(props.quiz, 'ZOOM_OUT');
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={80}
      gap={20}
      media={({ locked, graded }) =>
        url ? <ZoomOutImage url={url} scale={props.scale} paused={locked} finish={graded} /> : null
      }
    />
  );
}

// Figma 740:1768: 폭 전체(330)×260, 모서리 12, 사진 뒤 #D9D9D9.
function ZoomOutImage({
  url,
  scale,
  paused,
  finish,
}: {
  url: string;
  scale: number;
  paused: boolean;
  finish: boolean;
}) {
  const [focus] = useState(() => randomZoomFocus());
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const progress = useSlowReveal({
    started: loaded && !!size,
    paused,
    finish,
    durationMs: ZOOM_OUT_DURATION_MS,
  });

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { width, height } = nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  // 확대 지점의 틀 가운데 기준 위치(px). 크기를 재기 전에는 가운데로 둔다.
  const px = size ? (focus.x - 0.5) * size.width : 0;
  const py = size ? (focus.y - 0.5) * size.height : 0;
  const curve = zoomScaleCurve();
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
