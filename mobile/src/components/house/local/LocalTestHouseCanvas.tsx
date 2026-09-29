import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { LocalPlacedItems } from '../../../data/localHousingTestData';

const ROOM_COLORS = {
  outline: '#334155',
  leftWall: '#f1f5f9',
  rightWall: '#f8fafc',
  floor: '#e2e8f0',
  background: '#ffffff',
} as const;

type LocalTestHouseCanvasProps = {
  placedItems: LocalPlacedItems;
};

export function LocalTestHouseCanvas({ placedItems }: LocalTestHouseCanvasProps) {
  const wallColor = placedItems.wall?.color ?? ROOM_COLORS.leftWall;
  const rightWallColor = placedItems.wall?.accentColor ?? ROOM_COLORS.rightWall;
  const floorColor = placedItems.floor?.color ?? ROOM_COLORS.floor;

  return (
    <View style={styles.container} accessibilityLabel="로컬 테스트 방 미리보기">
      <Svg width="100%" height="100%" viewBox="0 0 320 300">
        <Polygon
          points="160,28 38,96 38,218 160,282 282,218 282,96"
          fill={ROOM_COLORS.background}
          stroke={ROOM_COLORS.outline}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <Polygon
          points="160,28 38,96 38,218 160,282"
          fill={wallColor}
          stroke={ROOM_COLORS.outline}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <Polygon
          points="160,28 282,96 282,218 160,282"
          fill={rightWallColor}
          stroke={ROOM_COLORS.outline}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <Polygon
          points="38,218 160,154 282,218 160,282"
          fill={floorColor}
          stroke={ROOM_COLORS.outline}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <Line x1="160" y1="28" x2="160" y2="154" stroke={ROOM_COLORS.outline} strokeWidth="2" />
        <Line x1="38" y1="218" x2="160" y2="154" stroke={ROOM_COLORS.outline} strokeWidth="2" />
        <Line x1="282" y1="218" x2="160" y2="154" stroke={ROOM_COLORS.outline} strokeWidth="2" />
        <LocalFurniture placedItems={placedItems} />
      </Svg>
    </View>
  );
}

function LocalFurniture({ placedItems }: LocalTestHouseCanvasProps) {
  const bed = placedItems.bed;
  const light = placedItems.light;
  const decoration = placedItems.decoration;
  const other = placedItems.other;

  return (
    <G>
      {other?.id === 'other-2' ? (
        <Polygon
          points="142,222 190,197 226,216 178,242"
          fill={other.color}
          stroke={other.accentColor}
          strokeWidth="2"
        />
      ) : null}
      {bed ? (
        <G>
          <Polygon
            points="72,215 137,181 190,209 124,244"
            fill={bed.color}
            stroke={ROOM_COLORS.outline}
            strokeWidth="2"
          />
          <Polygon
            points="72,215 124,244 124,254 72,226"
            fill={bed.accentColor}
            stroke={ROOM_COLORS.outline}
            strokeWidth="2"
          />
          <Polygon
            points="124,244 190,209 190,219 124,254"
            fill={bed.accentColor}
            stroke={ROOM_COLORS.outline}
            strokeWidth="2"
          />
          <Polygon
            points="79,211 105,197 124,207 98,221"
            fill="#ffffff"
            stroke={ROOM_COLORS.outline}
            strokeWidth="1.5"
          />
          <SvgText x="126" y="222" fill={ROOM_COLORS.outline} fontSize="10" textAnchor="middle">
            BED
          </SvgText>
        </G>
      ) : null}
      {light ? (
        <G>
          <Circle
            cx="236"
            cy="132"
            r="15"
            fill={light.color}
            stroke={light.accentColor}
            strokeWidth="2"
          />
          <Line x1="236" y1="147" x2="236" y2="199" stroke={ROOM_COLORS.outline} strokeWidth="3" />
          <Line x1="222" y1="199" x2="250" y2="199" stroke={ROOM_COLORS.outline} strokeWidth="3" />
        </G>
      ) : null}
      {decoration ? (
        decoration.id === 'decoration-1' ? (
          <Polygon
            points="221,163 226,174 238,175 229,183 232,195 221,189 210,195 213,183 204,175 216,174"
            fill={decoration.color}
            stroke={decoration.accentColor}
            strokeWidth="2"
          />
        ) : (
          <G>
            <Rect
              x="210"
              y="189"
              width="25"
              height="24"
              rx="3"
              fill="#c2410c"
              stroke={ROOM_COLORS.outline}
              strokeWidth="2"
            />
            <Line
              x1="222"
              y1="190"
              x2="211"
              y2="169"
              stroke={decoration.accentColor}
              strokeWidth="5"
            />
            <Line
              x1="222"
              y1="190"
              x2="235"
              y2="168"
              stroke={decoration.accentColor}
              strokeWidth="5"
            />
          </G>
        )
      ) : null}
      {other && other.id !== 'other-2' ? (
        <G>
          <Rect
            x="190"
            y="215"
            width="34"
            height="28"
            fill={other.color}
            stroke={ROOM_COLORS.outline}
            strokeWidth="2"
          />
          <Line x1="190" y1="224" x2="224" y2="224" stroke={other.accentColor} strokeWidth="2" />
        </G>
      ) : null}
    </G>
  );
}

const styles = StyleSheet.create({
  container: { width: '72%', maxWidth: 420, aspectRatio: 320 / 300 },
});
