import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import type { CatalogResponse, Layout } from '../../lib/housingApi';
import { PlacedFurniture } from './PlacedFurniture';

const ROOM_COLORS = {
  outline: '#334155',
  leftWall: '#f1f5f9',
  rightWall: '#f8fafc',
  floor: '#e2e8f0',
  background: '#ffffff',
} as const;

const STROKE_WIDTH = 2;

type HouseCanvasProps = {
  layout: Layout | null;
  catalog: CatalogResponse | null;
  roomId?: string;
};

export function HouseCanvas({ layout, catalog, roomId }: HouseCanvasProps) {
  const room = catalog?.rooms.find((candidate) => candidate.id === roomId);
  const wallSurface = room?.surfaces.find((surface) => surface.kind.toLowerCase() === 'wall');
  const floorSurface = room?.surfaces.find((surface) => surface.kind.toLowerCase() === 'floor');
  const hasWallSkin = Boolean(wallSurface && layout?.surfaceSkins[wallSurface.id]);
  const hasFloorSkin = Boolean(floorSurface && layout?.surfaceSkins[floorSurface.id]);

  return (
    <View style={styles.container} accessibilityLabel="빈 방 미리보기">
      <Svg width="100%" height="100%" viewBox="0 0 320 300">
        <Polygon
          points="160,28 38,96 38,218 160,282 282,218 282,96"
          fill={ROOM_COLORS.background}
          stroke={ROOM_COLORS.outline}
          strokeWidth={STROKE_WIDTH}
          strokeLinejoin="round"
        />
        <Polygon
          points="160,28 38,96 38,218 160,282"
          fill={hasWallSkin ? '#dbeafe' : ROOM_COLORS.leftWall}
          stroke={ROOM_COLORS.outline}
          strokeWidth={STROKE_WIDTH}
          strokeLinejoin="round"
        />
        <Polygon
          points="160,28 282,96 282,218 160,282"
          fill={hasWallSkin ? '#bfdbfe' : ROOM_COLORS.rightWall}
          stroke={ROOM_COLORS.outline}
          strokeWidth={STROKE_WIDTH}
          strokeLinejoin="round"
        />
        <Polygon
          points="38,218 160,154 282,218 160,282"
          fill={hasFloorSkin ? '#fde68a' : ROOM_COLORS.floor}
          stroke={ROOM_COLORS.outline}
          strokeWidth={STROKE_WIDTH}
          strokeLinejoin="round"
        />
        <Line
          x1="160"
          y1="28"
          x2="160"
          y2="154"
          stroke={ROOM_COLORS.outline}
          strokeWidth={STROKE_WIDTH}
        />
        <Line
          x1="38"
          y1="218"
          x2="160"
          y2="154"
          stroke={ROOM_COLORS.outline}
          strokeWidth={STROKE_WIDTH}
        />
        <Line
          x1="282"
          y1="218"
          x2="160"
          y2="154"
          stroke={ROOM_COLORS.outline}
          strokeWidth={STROKE_WIDTH}
        />
        <PlacedFurniture placements={layout?.placements ?? []} catalog={catalog} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '72%',
    maxWidth: 420,
    aspectRatio: 320 / 300,
  },
});
