import { useId } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  Filter,
  G,
  Line,
  Path,
  Rect,
} from 'react-native-svg';
import type { ConstellationImage, StarPoint } from './constellationLayouts';
import {
  FOLDER_CARD_PATH,
  FOLDER_ICON_PATH,
  MAP_ICON_PATH,
  SPARK_STAR_PATH,
} from './constellationIconPaths';

// 학습 홈·별자리 기록·별자리 완성이 같이 쓰는 그림 요소.
export const artColor = { base: '#161616', fale: '#f1f1f1', yellow: '#ffde23' };

// HUD 원본 경로(Figma 757:3131 · 749:1810)
export const HUD_CORNER = 'M0.5 18.6513V4.5C0.5 2.29086 2.29086 0.5 4.5 0.5H18.555';
export const HUD_DOTTED =
  'M0 0.5H0.977982M58.6789 0.5H57.7009M2.93394 0.5H4.88991M6.84587 0.5H8.80184M10.7578 0.5H12.7138M14.6697 0.5H16.6257M18.5817 0.5H20.5376M22.4936 0.5H24.4495M26.4055 0.5H28.3615M30.3174 0.5H32.2734M34.2294 0.5H36.1853M38.1413 0.5H40.0972M42.0532 0.5H44.0092M45.9651 0.5H47.9211M49.8771 0.5H51.833M53.789 0.5H55.745';
export const HUD_RULER = [1, 27, 53, 79, 105, 131]
  .map((x) => `M${x} 0V0.6M${x} 12V11.4M${x} 3V6.6`)
  .concat(
    [14, 40, 66, 92, 118].map(
      (x) => `M${x} 0V0.444444M${x} 8V7.55556M${x} 1.77778V3.55556M${x} 4.44444V5.77778`,
    ),
  )
  .join('');

// 별을 놓는 기준 칸(학습 홈 HUD 안쪽 328×288). constellationLayouts 의 0~1 좌표가 이 비율을 따른다.
const SKY_ASPECT = { width: 328, height: 288 };

// SVG id 는 웹에서 문서 전체에 하나여야 한다. 같은 그림이 여러 번 나와도 겹치지 않게 만든다.
export function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^A-Za-z0-9]/g, '')}`;
}

// Figma 와 같은 흰 빛 번짐. 도형과 같은 색 그림자(blur)를 도형 아래에 합친다.
// inner: 두 번째 그림자(별 754:2957 처럼 blur 12 + blur 4). soften: 결과 전체를 한 번 더 흐린다(배경 별).
export function GlowFilter({
  id,
  blur,
  inner = 0,
  soften = 0,
  width,
  height,
}: {
  id: string;
  blur: number;
  inner?: number;
  soften?: number;
  width: number;
  height: number;
}) {
  return (
    <Filter
      id={id}
      x={-80}
      y={-80}
      width={width + 160}
      height={height + 160}
      filterUnits="userSpaceOnUse"
    >
      <FeGaussianBlur in="SourceGraphic" stdDeviation={blur} result="outer" />
      {inner ? <FeGaussianBlur in="SourceGraphic" stdDeviation={inner} result="inner" /> : null}
      <FeMerge result="glow">
        {(inner ? ['outer', 'inner', 'SourceGraphic'] : ['outer', 'SourceGraphic']).map(
          (source) => (
            <FeMergeNode key={source} in={source} />
          ),
        )}
      </FeMerge>
      {soften ? <FeGaussianBlur in="glow" stdDeviation={soften} /> : null}
    </Filter>
  );
}

// 별자리 그림. 별 위치를 상자 안에 비율을 지켜 가운데로 맞추고, 별(모두 밝힘)과 별 사이 선을 그린다.
// image 가 있으면(서버 imageUrl 또는 설정 그림) 그 그림을 대신 보여 준다.
export function ConstellationFigure({
  points,
  image,
  width,
  height,
  starRadius,
  glow,
  innerGlow = 0,
  lineWidth = 1,
  padding,
}: {
  points: StarPoint[];
  image?: ConstellationImage | null;
  width: number;
  height: number;
  starRadius: number;
  glow: number;
  innerGlow?: number;
  lineWidth?: number;
  padding: number;
}) {
  const filterId = useSvgId('figureGlow');
  if (image) return <Image source={image} resizeMode="contain" style={{ width, height }} />;
  const raw = points.map((point) => ({
    x: point.x * SKY_ASPECT.width,
    y: point.y * SKY_ASPECT.height,
  }));
  const xs = raw.map((point) => point.x);
  const ys = raw.map((point) => point.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const spanX = maxX - minX,
    spanY = maxY - minY;
  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);
  const scale = Math.min(
    spanX > 0 ? innerWidth / spanX : Infinity,
    spanY > 0 ? innerHeight / spanY : Infinity,
  );
  const k = Number.isFinite(scale) ? scale : 1;
  const offsetX = (width - spanX * k) / 2;
  const offsetY = (height - spanY * k) / 2;
  const placed = raw.map((point) => ({
    x: offsetX + (point.x - minX) * k,
    y: offsetY + (point.y - minY) * k,
  }));
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} pointerEvents="none">
      <Defs>
        <GlowFilter id={filterId} blur={glow} inner={innerGlow} width={width} height={height} />
      </Defs>
      {placed.slice(1).map((point, index) => (
        <Line
          key={`line-${index}`}
          x1={placed[index].x}
          y1={placed[index].y}
          x2={point.x}
          y2={point.y}
          stroke={artColor.fale}
          strokeWidth={lineWidth}
        />
      ))}
      {placed.map((point, index) => (
        <Circle
          key={`star-${index}`}
          cx={point.x}
          cy={point.y}
          r={starRadius}
          fill={artColor.fale}
          filter={`url(#${filterId})`}
        />
      ))}
    </Svg>
  );
}

// HUD 틀(Figma 749:1810): 네 모서리, 위 점선 두 줄과 시계 문구, 아래 눈금. 크기에 맞춰 모서리에 붙는다.
export function HudFrame({ width, height }: { width: number; height: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <G stroke={artColor.fale} fill="none">
          <Path d={HUD_CORNER} transform="translate(-0.5 -0.5)" />
          <Path d={HUD_CORNER} transform={`translate(${width + 0.5} -0.5) scale(-1 1)`} />
          <Path d={HUD_CORNER} transform={`translate(-0.5 ${height + 0.5}) scale(1 -1)`} />
          <Path
            d={HUD_CORNER}
            transform={`translate(${width + 0.5} ${height + 0.5}) scale(-1 -1)`}
          />
          <Path d={HUD_DOTTED} transform="translate(44.6 -0.5)" />
          <Path d={HUD_DOTTED} transform={`translate(${width - 44.6 - 58.6789} -0.5)`} />
          <Path
            d={HUD_RULER}
            strokeWidth={2}
            transform={`translate(${width / 2 + 66} ${height}) rotate(180)`}
          />
        </G>
      </Svg>
      <Text style={[s.timer, { left: width / 2 - 26 }]}>00 :00 :00 :00</Text>
    </View>
  );
}

// 443:1972 Rectangle 31: 지도 보기(기록 상태 머리말 오른쪽)
export function MapModeIcon() {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
      <Rect width={36} height={36} rx={4} fill={artColor.fale} />
      <Path d={MAP_ICON_PATH} fill="black" stroke="black" fillRule="evenodd" clipRule="evenodd" />
    </Svg>
  );
}

// 749:1717 Rectangle 30: 기록 보기(지도 상태 머리말 오른쪽). 36 칸 밖으로 그림자가 4 번진다.
export function RecordModeIcon() {
  const filterId = useSvgId('folderGlow');
  return (
    <View style={s.iconBox}>
      <Svg style={s.iconGlow} width={44} height={44} viewBox="0 0 44 44" fill="none">
        <Defs>
          <GlowFilter id={filterId} blur={2} width={44} height={44} />
        </Defs>
        <Rect
          x={4}
          y={4}
          width={36}
          height={36}
          rx={4}
          fill={artColor.fale}
          filter={`url(#${filterId})`}
        />
        <Path d={FOLDER_ICON_PATH} stroke="black" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

// 342:577 레슨 줄 앞 별(16 칸, 별 12.24). 완료가 아니면 테두리만 그린다.
export function SparkStar({ filled }: { filled: boolean }) {
  return (
    <View style={s.spark}>
      <Svg width={12.2369} height={12.2369} viewBox="-0.5 -0.5 13.2369 13.2369">
        <Path
          d={SPARK_STAR_PATH}
          fill={filled ? artColor.base : 'none'}
          stroke={filled ? 'none' : artColor.base}
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

// 443:1972 기록 카드의 폴더 모양(Union) 배경. 카드 칸(160:144)에서 위 5.59%·좌우 5% 안쪽에 놓이고
// 6 번진 흰 그림자를 가진다.
export function FolderCardShape({ width, height }: { width: number; height: number }) {
  const filterId = useSvgId('folderCard');
  const left = width * 0.05;
  const top = height * 0.0559;
  const sx = (width * 0.9) / 144.9;
  const sy = (height - top) / 135.955;
  return (
    <View pointerEvents="none" style={[s.folder, { width: width + 48, height: height + 48 }]}>
      <Svg width={width + 48} height={height + 48}>
        <Defs>
          {/* 그림자만 흐린다. 폴더 면은 #161616 이고 그림자는 #F1F1F1 이라 색이 다르다. */}
          <Filter
            id={filterId}
            x={-80}
            y={-80}
            width={width + 208}
            height={height + 208}
            filterUnits="userSpaceOnUse"
          >
            <FeGaussianBlur in="SourceGraphic" stdDeviation={6} />
          </Filter>
        </Defs>
        <G transform={`translate(${24 + left} ${24 + top}) scale(${sx} ${sy}) translate(-12 -12)`}>
          {/* Figma drop shadow(0 0 blur 12, #F1F1F1): 같은 모양을 흰색으로 흐려 아래에 깔고 */}
          <Path d={FOLDER_CARD_PATH} fill={artColor.fale} filter={`url(#${filterId})`} />
          {/* 그 위에 폴더 면(#161616)을 그린다 */}
          <Path d={FOLDER_CARD_PATH} fill={artColor.base} />
        </G>
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  timer: {
    position: 'absolute',
    top: -8,
    color: artColor.fale,
    fontFamily: 'TekoRegular',
    fontSize: 12,
  },
  iconBox: { width: 36, height: 36 },
  iconGlow: { position: 'absolute', left: -4, top: -4 },
  spark: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  folder: { position: 'absolute', left: -24, top: -24 },
});
