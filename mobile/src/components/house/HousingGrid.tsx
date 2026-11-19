import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import {
  FLOOR_1X,
  FLOOR_RADIUS_1X,
  gridLines,
  HOUSING_GRID,
  ROOM_1X,
  type GridSpec,
  type Size,
} from './placementGrid';

// 디자인 조정용 값. 선 위치는 배치 좌표와 같은 gridLines() 로 계산하므로 여기서 바꾸지 않는다.
// 흰 벽·연노랑 바닥 위에서 보이도록 방 그림 외곽선과 같은 검정을 옅게 쓴다.
export const GRID_STYLE = {
  color: '#000000',
  lineWidth: 0.6,
  opacity: 0.14,
  // majorEvery 칸마다 한 번 더 진한 선을 그어 위치를 읽기 쉽게 한다. 0 이면 모든 선을 같은 굵기로 그린다.
  majorEvery: 5,
  majorLineWidth: 1,
  majorOpacity: 0.28,
};
export type GridStyle = typeof GRID_STYLE;

// 가구를 놓을 수 있는 바닥 안에만 격자를 그린다. 선이 지나는 점이 가구 중심이 놓이는 격자점이다.
export function HousingGrid({
  size,
  grid = HOUSING_GRID,
  style = GRID_STYLE,
}: {
  size: Size;
  grid?: GridSpec;
  style?: GridStyle;
}) {
  if (size.width <= 0 || size.height <= 0) return null;
  const sx = size.width / ROOM_1X.width;
  const sy = size.height / ROOM_1X.height;
  const floor = {
    left: FLOOR_1X.minX * sx,
    right: FLOOR_1X.maxX * sx,
    top: FLOOR_1X.minY * sy,
    bottom: FLOOR_1X.maxY * sy,
  };
  const lines = gridLines(size, grid);
  const isMajor = (index: number) => style.majorEvery > 0 && index % style.majorEvery === 0;
  const path = (major: boolean) =>
    [
      ...lines.columns
        .filter((line) => line.position > floor.left && line.position < floor.right)
        .filter((line) => isMajor(line.index) === major)
        .map((line) => `M${line.position} ${floor.top}V${floor.bottom}`),
      ...lines.rows
        .filter((line) => line.position > floor.top && line.position < floor.bottom)
        .filter((line) => isMajor(line.index) === major)
        .map((line) => `M${floor.left} ${line.position}H${floor.right}`),
    ].join('');
  const minor = path(false);
  const major = path(true);
  return (
    <View pointerEvents="none" style={[s.grid, { width: size.width, height: size.height }]}>
      <Svg width={size.width} height={size.height}>
        <Defs>
          {/* 바닥의 둥근 모서리 밖으로 선이 나가지 않게 자른다. */}
          <ClipPath id="housing-floor">
            <Rect
              x={floor.left}
              y={floor.top}
              width={floor.right - floor.left}
              height={floor.bottom - floor.top}
              rx={FLOOR_RADIUS_1X * sx}
            />
          </ClipPath>
        </Defs>
        <G clipPath="url(#housing-floor)">
          {minor ? (
            <Path
              d={minor}
              stroke={style.color}
              strokeWidth={style.lineWidth}
              strokeOpacity={style.opacity}
            />
          ) : null}
          {major ? (
            <Path
              d={major}
              stroke={style.color}
              strokeWidth={style.majorLineWidth}
              strokeOpacity={style.majorOpacity}
            />
          ) : null}
        </G>
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { position: 'absolute', left: 0, top: 0, zIndex: 1 },
});
