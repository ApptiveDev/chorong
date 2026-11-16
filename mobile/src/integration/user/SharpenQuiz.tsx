// 점점 선명해지는 사진. SINGLE + config.presentation.type === 'SHARPEN'.
// Figma 점점 선명(740:1335)·정답(740:1365)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
//
// 서버 stages(예: [24, 12, 4, 0])의 첫 단계 모자이크로 시작한다. 사진을 누를 때마다 다음 단계로
// 넘어가고, 마지막(0)은 원본이다. 보기는 언제든 고를 수 있고, 채점 결과가 나오면 원본을 보여 준다.
// 정답이면 해설 시트에 'n단계에서 맞췄어요.'를 덧붙인다(n: 보기를 고른 순간의 단계, 1부터).
//
// 모자이크는 Skia·GL 없이 보통 View 로 그린다. 틀을 블록 격자로 나누고, 블록마다 overflow 를 숨긴 칸에
// 같은 사진을 블록 가운데를 기준으로 크게 확대해 넣는다. 블록에는 그 지점 둘레 몇 dp 만 보여
// 거의 한 가지 색으로 보인다.
import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';
import { studyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { presentationImageUrl, presentationStages } from './presentationImage';

// stages 가 없거나 규칙에 맞지 않을 때 쓰는 단계 값.
export const SHARPEN_DEFAULT_STAGES = [24, 14, 8, 4, 2, 0] as const;
// 단계 값 v 를 블록 크기로 바꾸는 기준. 블록 한 변은 틀 폭의 v/64 다(가로 블록 수 = round(64 / v)).
// 서버 상한 32 는 가로 2칸, 4 는 16칸이다. 0 은 원본이다.
export const SHARPEN_BLOCK_DIVISOR = 64;
// 블록(칸 View + 사진) 수 상한. 넘으면 블록을 키워 이 안에 맞춘다(330×260 틀이면 19×15 = 285칸).
export const SHARPEN_MAX_CELLS = 300;
// 블록 하나에 보이는 원본 사진 폭(dp). 작을수록 블록 색이 고르다.
const SAMPLE_DP = 2;

/**
 * 단계 값과 틀 크기(px)로 정한 모자이크 격자. 0 이하면 원본이라 null 이다.
 * 블록은 정사각형에 가깝게 세로 칸 수를 맞추고, maxCells 를 넘으면 가로 칸 수를 줄인다.
 */
export function pixelateGrid(
  value: number,
  width: number,
  height: number,
  maxCells = SHARPEN_MAX_CELLS,
): { columns: number; rows: number } | null {
  if (!(value > 0) || !(width > 0) || !(height > 0)) return null;
  const rowsFor = (columns: number) => Math.max(1, Math.round((columns * height) / width));
  let columns = Math.max(1, Math.round(SHARPEN_BLOCK_DIVISOR / value));
  while (columns > 1 && columns * rowsFor(columns) > maxCells) columns--;
  return { columns, rows: rowsFor(columns) };
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
            value={stages[graded ? last : current]}
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
  value,
  stageText,
  scale,
  canAdvance,
  onAdvance,
}: {
  url: string;
  // 지금 단계 값. 0 이면 원본.
  value: number;
  stageText: string;
  scale: number;
  // 눌러서 다음 단계로 갈 수 있는지(보기를 고르기 전이고 마지막 단계가 아닐 때).
  canAdvance: boolean;
  onAdvance: () => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const source = useMemo(() => studyImageSource(url), [url]);
  const grid = size ? pixelateGrid(value, size.width, size.height) : null;

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { width, height } = nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

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
      {/* 원본은 마지막 단계에서만 그린다. 모자이크 밑에 깔면 블록이 뜨기 전에 원본이 비친다. */}
      {value <= 0 ? (
        <Image source={source} resizeMode="cover" style={s.photo} />
      ) : size && grid ? (
        <Mosaic source={source} width={size.width} height={size.height} {...grid} />
      ) : null}
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
        // 단계가 바뀌어도 순번 key 로 View·Image 를 다시 쓴다.
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
  return (
    <View pointerEvents="none" style={s.photo}>
      {cells}
    </View>
  );
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
