import { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { PlacedItems } from '../../data/mockShopItems';

type PlacedFurnitureProps = {
  placedItems: PlacedItems;
};

const OUTLINE = '#334155';

export function PlacedFurniture({ placedItems }: PlacedFurnitureProps) {
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
            stroke={OUTLINE}
            strokeWidth="2"
          />
          <Polygon
            points="72,215 124,244 124,254 72,226"
            fill={bed.accentColor}
            stroke={OUTLINE}
            strokeWidth="2"
          />
          <Polygon
            points="124,244 190,209 190,219 124,254"
            fill={bed.accentColor}
            stroke={OUTLINE}
            strokeWidth="2"
          />
          <Polygon
            points="79,211 105,197 124,207 98,221"
            fill="#ffffff"
            stroke={OUTLINE}
            strokeWidth="1.5"
          />
          <SvgText x="126" y="222" fill={OUTLINE} fontSize="10" textAnchor="middle">
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
          <Line x1="236" y1="147" x2="236" y2="199" stroke={OUTLINE} strokeWidth="3" />
          <Line x1="222" y1="199" x2="250" y2="199" stroke={OUTLINE} strokeWidth="3" />
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
              stroke={OUTLINE}
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
            stroke={OUTLINE}
            strokeWidth="2"
          />
          <Line x1="190" y1="224" x2="224" y2="224" stroke={other.accentColor} strokeWidth="2" />
        </G>
      ) : null}
    </G>
  );
}
