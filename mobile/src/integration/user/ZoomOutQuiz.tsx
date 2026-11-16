// 축소 그림. SINGLE + config.presentation.type === 'ZOOM_OUT'.
// Figma 축소 그림(740:1763)·정답(740:1817)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
//
// 사진의 무작위 지점을 서버 stages(배율, 예: [6, 4, 2, 1])의 첫 배율로 크게 확대해 둔다.
// 사진을 누를 때마다 다음 배율로 짧게 줄어들고, 마지막은 원본 크기(1배)다. 보기는 언제든 고를 수 있다.
// 그 지점을 화면에 고정한 채 확대·축소하므로(x' = s·x + p·(1 − s)) 지점이 사진 안이면
// 어느 배율에서도 사진이 틀을 빈틈없이 채운다. 채점 결과가 나오면 원본 크기까지 줄인다.
// 정답이면 해설 시트에 'n배 확대에서 맞췄어요.'를 덧붙인다(n: 보기를 고른 순간의 배율).
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import { studyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { presentationImageUrl, presentationStages } from './presentationImage';

// stages 가 없거나 규칙에 맞지 않을 때 쓰는 배율.
export const ZOOM_OUT_DEFAULT_STAGES = [6, 4, 2, 1] as const;
// 한 번 눌렀을 때 다음 배율로 줄어드는 시간.
export const ZOOM_OUT_STEP_MS = 350;
// 확대 지점을 고르는 범위(사진 폭·높이 비율). 가장자리 빈 배경에 걸리는 일을 줄인다.
export const ZOOM_OUT_FOCUS_RANGE = { min: 0.15, max: 0.85 } as const;

type Random = () => number;

/** 확대 지점(사진 왼쪽 위 기준 0~1 비율). */
export function randomZoomFocus(random: Random = Math.random) {
  const pick = () =>
    ZOOM_OUT_FOCUS_RANGE.min + random() * (ZOOM_OUT_FOCUS_RANGE.max - ZOOM_OUT_FOCUS_RANGE.min);
  return { x: pick(), y: pick() };
}

/** 정답 문구. 원본 크기(1배)에서 맞혔으면 배율 대신 원본이라고 쓴다. */
export function zoomOutCorrectNote(scale: number) {
  const rounded = Math.round(scale);
  return rounded <= 1 ? '원본 크기에서 맞췄어요.' : `${rounded}배 확대에서 맞췄어요.`;
}

export function ZoomOutQuiz(props: PresentedChoiceProps) {
  const url = presentationImageUrl(props.quiz, 'ZOOM_OUT');
  const stages = presentationStages(props.quiz, 'ZOOM_OUT') ?? [...ZOOM_OUT_DEFAULT_STAGES];
  const last = stages.length - 1;
  // 지금 보이는 단계. 보기를 고른 뒤에는 넘길 수 없어 이 값이 곧 답한 순간의 단계다.
  const [stage, setStage] = useState(0);
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={80}
      gap={20}
      correctNote={zoomOutCorrectNote(stages[Math.min(stage, last)])}
      media={({ locked, graded }) =>
        url ? (
          <ZoomOutImage
            url={url}
            zoom={stages[graded ? last : Math.min(stage, last)]}
            scale={props.scale}
            canAdvance={!locked && !props.disabled && stage < last}
            onAdvance={() => setStage((value) => Math.min(value + 1, last))}
          />
        ) : null
      }
    />
  );
}

// Figma 740:1768: 폭 전체(330)×260, 모서리 12, 사진 뒤 #D9D9D9.
function ZoomOutImage({
  url,
  zoom,
  scale,
  canAdvance,
  onAdvance,
}: {
  url: string;
  // 지금 보여 줄 배율. 1 이면 원본 크기.
  zoom: number;
  scale: number;
  // 눌러서 다음 배율로 갈 수 있는지(보기를 고르기 전이고 마지막 배율이 아닐 때).
  canAdvance: boolean;
  onAdvance: () => void;
}) {
  const [focus] = useState(() => randomZoomFocus());
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const value = useRef(new Animated.Value(zoom)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) reduceMotion.current = enabled;
      })
      .catch(() => {});
    return () => {
      active = false;
      value.stopAnimation();
    };
  }, [value]);

  useEffect(() => {
    if (reduceMotion.current) return value.setValue(zoom);
    Animated.timing(value, {
      toValue: zoom,
      duration: ZOOM_OUT_STEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [zoom, value]);

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { width, height } = nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  // 확대 지점의 틀 가운데 기준 위치(px). 크기를 재기 전에는 가운데로 둔다.
  const px = size ? (focus.x - 0.5) * size.width : 0;
  const py = size ? (focus.y - 0.5) * size.height : 0;
  const shrink = Animated.subtract(1, value);
  const transform = [
    { translateX: Animated.multiply(shrink, px) },
    { translateY: Animated.multiply(shrink, py) },
    { scale: value },
  ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="이미지 축소"
      accessibilityValue={{ text: zoom > 1 ? `${zoom}배 확대` : '원본 크기' }}
      accessibilityState={{ disabled: !canAdvance }}
      disabled={!canAdvance}
      onPress={onAdvance}
      onLayout={onLayout}
      style={[s.frame, { height: 260 * scale }]}
    >
      <Animated.Image
        source={studyImageSource(url)}
        resizeMode="cover"
        style={[s.photo, { transform }]}
      />
    </Pressable>
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
