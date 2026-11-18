// 점점 선명해지는 사진. SINGLE + config.presentation.type === 'SHARPEN'.
// Figma 점점 선명(740:1335)·정답(740:1365)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
//
// 큰 픽셀 모자이크로 시작해 사진을 누를 때마다 픽셀이 작아지고, 마지막 단계는 원본이다.
// 단계 수는 서버 stages 개수를 따른다(예: [24, 12, 4, 0] → 모자이크 3단계 + 원본).
// 블록 크기는 stages 값이 아니라 아래 규칙으로 정한다. 값을 그대로 쓰면 3칸 → 5칸 → 16칸 → 원본처럼
// 거칠게 뛰어서, 가로 블록 수를 MIN_COLUMNS 에서 칸 수 상한이 허용하는 최대까지 같은 비율로 늘린다.
// 단계가 바뀔 때는 새 단계를 짧게 겹쳐 띄워(crossfade) 원본으로 넘어갈 때도 갑자기 바뀌지 않게 한다.
// 보기는 언제든 고를 수 있고, 채점 결과가 나오면 원본을 보여 준다.
// 정답이면 해설 시트에 'n단계에서 맞췄어요.'를 덧붙인다(n: 보기를 고른 순간의 단계, 1부터).
//
// 모자이크는 Skia·GL 없이 보통 View 로 그린다. 틀을 블록 격자로 나누고, 블록마다 overflow 를 숨긴 칸에
// 같은 사진을 블록 가운데를 기준으로 크게 확대해 넣는다. 블록에는 그 지점의 원본 1px 안팎만 보여
// 한 가지 색의 픽셀로 보인다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';
import { SHARPEN_MOSAIC_RASTER_PX, useStudyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { presentationImageUrl, presentationStages } from './presentationImage';

// stages 가 없거나 규칙에 맞지 않을 때 쓰는 단계(모자이크 4단계 + 원본).
export const SHARPEN_DEFAULT_STAGES = [24, 12, 6, 3, 0] as const;
// 첫 단계의 가로 블록 수.
export const SHARPEN_MIN_COLUMNS = 5;
// 블록(칸 View + 사진) 수 상한. 마지막 모자이크 단계가 이 안에서 가장 잘게 나뉜다
// (330×260 틀이면 24×19 = 456칸).
export const SHARPEN_MAX_CELLS = 480;
// 블록 하나에 보이는 원본 폭(dp). 1 보다 작게 해야 블록 안에서 색이 번지지 않고 단색으로 보인다.
const SAMPLE_DP = 0.5;
const FADE_MS = 320;

type Grid = { columns: number; rows: number };

const rowsFor = (columns: number, width: number, height: number) =>
  Math.max(1, Math.round((columns * height) / width));

/**
 * 모자이크 단계별 격자. levels 개를 돌려준다(원본 단계는 포함하지 않는다).
 * 가로 블록 수는 SHARPEN_MIN_COLUMNS 에서 maxCells 가 허용하는 최대까지 같은 비율로 늘고,
 * 세로 블록 수는 블록이 정사각형에 가깝게 맞춘다.
 */
export function pixelateLevels(
  levels: number,
  width: number,
  height: number,
  maxCells = SHARPEN_MAX_CELLS,
): Grid[] {
  if (levels <= 0 || !(width > 0) || !(height > 0)) return [];
  let maxColumns = 1;
  while ((maxColumns + 1) * rowsFor(maxColumns + 1, width, height) <= maxCells) maxColumns++;
  const minColumns = Math.min(SHARPEN_MIN_COLUMNS, maxColumns);
  return Array.from({ length: levels }, (_, index) => {
    const t = levels === 1 ? 0.5 : index / (levels - 1);
    const columns = Math.round(minColumns * Math.pow(maxColumns / minColumns, t));
    return { columns, rows: rowsFor(columns, width, height) };
  });
}

export function SharpenQuiz(props: PresentedChoiceProps) {
  const url = presentationImageUrl(props.quiz, 'SHARPEN');
  const stages = presentationStages(props.quiz, 'SHARPEN') ?? [...SHARPEN_DEFAULT_STAGES];
  const last = stages.length - 1;
  // 지금 보이는 단계(0부터). 보기를 고른 뒤에는 넘길 수 없어 이 값이 곧 답한 순간의 단계다.
  const [stage, setStage] = useState(0);
  const current = Math.min(stage, last);
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={80}
      gap={20}
      centered
      correctNote={`${current + 1}단계에서 맞췄어요.`}
      media={({ locked, graded }) =>
        url ? (
          <SharpenImage
            url={url}
            stage={graded ? last : current}
            last={last}
            stageText={`${(graded ? last : current) + 1}/${stages.length}단계`}
            scale={props.scale}
            canAdvance={!locked && !props.disabled && stage < last}
            onAdvance={() => setStage((value) => Math.min(value + 1, last))}
          />
        ) : null
      }
    />
  );
}

// Figma 740:1364: 330×260, 모서리 12, 사진 뒤 #D9D9D9.
function SharpenImage({
  url,
  stage,
  last,
  stageText,
  scale,
  canAdvance,
  onAdvance,
}: {
  url: string;
  // 지금 단계(0부터). last 면 원본.
  stage: number;
  last: number;
  stageText: string;
  scale: number;
  // 눌러서 다음 단계로 갈 수 있는지(보기를 고르기 전이고 마지막 단계가 아닐 때).
  canAdvance: boolean;
  onAdvance: () => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const { source } = useStudyImageSource(url);
  // 모자이크는 같은 사진을 수백 칸에 깔아서 SVG 면 작은 PNG 를 쓴다.
  const { source: mosaicSource } = useStudyImageSource(url, SHARPEN_MOSAIC_RASTER_PX);
  const levels = useMemo(
    () => (size ? pixelateLevels(last, size.width, size.height) : []),
    [last, size],
  );
  // 바로 앞 단계. 새 단계가 위에서 다 나타날 때까지 아래에 남겨 둔다.
  const [previous, setPrevious] = useState<number | null>(null);
  const shown = useRef(stage);
  const fade = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => (reduceMotion.current = value))
      .catch(() => {});
  }, []);

  // 그리기 전에 앞 단계를 남기고 새 단계를 투명하게 둔다(새 단계가 한 프레임 먼저 보이지 않게).
  useLayoutEffect(() => {
    if (shown.current === stage) return;
    const from = shown.current;
    shown.current = stage;
    if (reduceMotion.current) return;
    let active = true;
    setPrevious(from);
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished && active) setPrevious(null);
    });
    return () => {
      active = false;
    };
  }, [stage, fade]);

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { width, height } = nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  const layer = (index: number) =>
    index >= last ? (
      source ? (
        <Image source={source} resizeMode="cover" fadeDuration={0} style={s.photo} />
      ) : null
    ) : mosaicSource && size && levels[index] ? (
      <Mosaic source={mosaicSource} width={size.width} height={size.height} {...levels[index]} />
    ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="이미지 선명하게"
      accessibilityValue={{ text: stageText }}
      accessibilityState={{ disabled: !canAdvance }}
      disabled={!canAdvance}
      onPress={onAdvance}
      onLayout={onLayout}
      style={[s.frame, { width: 330 * scale, height: 260 * scale }]}
    >
      {previous !== null && previous !== stage ? (
        <View key={`layer-${previous}`} pointerEvents="none" style={s.photo}>
          {layer(previous)}
        </View>
      ) : null}
      <Animated.View
        key={`layer-${stage}`}
        pointerEvents="none"
        style={[s.photo, { opacity: previous !== null ? fade : 1 }]}
      >
        {layer(stage)}
      </Animated.View>
    </Pressable>
  );
}

function Mosaic({
  source,
  width,
  height,
  columns,
  rows,
}: {
  source: ImageSourcePropType;
  width: number;
  height: number;
  columns: number;
  rows: number;
}) {
  const blockWidth = width / columns;
  const blockHeight = height / rows;
  // 블록 안에 원본 SAMPLE_DP 만큼만 보이도록 확대한다.
  const magnify = Math.max(1, Math.max(blockWidth, blockHeight) / SAMPLE_DP);
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // 블록 경계를 정수로 내리고 올려 이웃 블록과 1px 안쪽으로 겹친다(틈이 비치지 않게).
      const left = Math.floor(column * blockWidth);
      const top = Math.floor(row * blockHeight);
      const right = Math.ceil((column + 1) * blockWidth);
      const bottom = Math.ceil((row + 1) * blockHeight);
      // 블록 가운데의 틀 가운데 기준 위치. 이 지점을 고정한 채 확대한다(x' = s·x + p·(1 − s)).
      const px = (column + 0.5) * blockWidth - width / 2;
      const py = (row + 0.5) * blockHeight - height / 2;
      cells.push(
        <View
          key={row * columns + column}
          style={[s.cell, { left, top, width: right - left, height: bottom - top }]}
        >
          <Image
            source={source}
            resizeMode="cover"
            fadeDuration={0}
            style={{
              position: 'absolute',
              left: -left,
              top: -top,
              width,
              height,
              transform: [
                { translateX: px * (1 - magnify) },
                { translateY: py * (1 - magnify) },
                { scale: magnify },
              ],
            }}
          />
        </View>,
      );
    }
  }
  return <View style={s.photo}>{cells}</View>;
}

const s = StyleSheet.create({
  frame: {
    maxWidth: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#D9D9D9',
  },
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  cell: { position: 'absolute', overflow: 'hidden' },
});
