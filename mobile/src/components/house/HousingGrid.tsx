import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { gridLines, HOUSING_GRID, type GridSpec, type Size } from './placementGrid';

// 디자인 조정용 값. 선 위치는 배치 좌표와 같은 gridLines() 로 계산하므로 여기서 바꾸지 않는다.
export const GRID_STYLE = {
  color: '#ffffff',
  lineWidth: 0.5,
  opacity: 0.28,
  // majorEvery 칸마다 한 번 더 진한 선을 그어 위치를 읽기 쉽게 한다. 0 이면 모든 선을 같은 굵기로 그린다.
  majorEvery: 5,
  majorLineWidth: 0.8,
  majorOpacity: 0.5,
};
export type GridStyle = typeof GRID_STYLE;

// 장면 안쪽(테두리 제외) 전체에 격자를 그린다. 선이 지나는 점이 가구 중심이 놓이는 격자점이다.
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
  const lines = gridLines(size, grid);
  const isMajor = (index: number) => style.majorEvery > 0 && index % style.majorEvery === 0;
  const path = (major: boolean) =>
    [
      ...lines.columns
        .filter((line) => isMajor(line.index) === major)
        .map((line) => `M${line.position} 0V${size.height}`),
      ...lines.rows
        .filter((line) => isMajor(line.index) === major)
        .map((line) => `M0 ${line.position}H${size.width}`),
    ].join('');
  const minor = path(false);
  const major = path(true);
  return (
    <View pointerEvents="none" style={[s.grid, { width: size.width, height: size.height }]}>
      <Svg width={size.width} height={size.height}>
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
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { position: 'absolute', left: 0, top: 0, zIndex: 1 },
});
