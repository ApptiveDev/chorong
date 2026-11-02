import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import type { Placement } from '../../integration/models';

const clamp = (value: number) => Math.min(1, Math.max(0, value));

// 배치 좌표는 기존 0~1 범위를 유지하고, 화면 좌표만 원근감 있는 바닥에 투영한다.
const floorPoint = (x: number, y: number) => {
  const depth = clamp(y);
  return {
    x: 160 + (clamp(x) - 0.5) * (204 + depth * 72),
    y: 126 + depth * 145,
    scale: 0.82 + depth * 0.22,
  };
};

export function TopDownRoom({
  placements,
  itemNames = {},
}: {
  placements: Placement[];
  itemNames?: Record<string, string>;
}) {
  return (
    <View style={styles.frame} accessibilityLabel="비스듬히 내려다본 우주선 방">
      <Svg width="100%" height="100%" viewBox="0 0 320 320">
        <Defs>
          <ClipPath id="floorClip">
            <Polygon points="58,126 262,126 298,271 22,271" />
          </ClipPath>
        </Defs>

        {/* 뒷벽을 세우고 양쪽 벽은 앞쪽으로 벌려 낮은 시점을 만든다. */}
        <Path
          d="M36 18 Q36 11 44 11 H276 Q284 11 284 18 L298 271 H22 Z"
          fill="#b9c8ce"
          stroke="#34495d"
          strokeWidth="3"
        />
        <Rect x="48" y="22" width="224" height="104" rx="8" fill="#f2f3ee" />
        <Polygon points="36,18 58,126 22,271 22,76" fill="#d2dde0" />
        <Polygon points="284,18 262,126 298,271 298,76" fill="#aabec5" />
        <Line x1="48" y1="22" x2="58" y2="126" stroke="#8ca2ac" strokeWidth="2" />
        <Line x1="272" y1="22" x2="262" y2="126" stroke="#8299a5" strokeWidth="2" />

        {/* 창은 세로 벽에 놓여 바닥과 시점을 구분한다. */}
        <Rect
          x="83"
          y="28"
          width="154"
          height="67"
          rx="13"
          fill="#617987"
          stroke="#34495d"
          strokeWidth="3"
        />
        <Rect x="90" y="35" width="140" height="53" rx="9" fill="#172d4b" />
        <Circle cx="113" cy="50" r="1.8" fill="#e4effb" />
        <Circle cx="180" cy="61" r="1.5" fill="#e4effb" />
        <Circle cx="208" cy="47" r="1" fill="#fff" />
        <Path
          d="M101 77 Q160 38 219 72"
          fill="none"
          stroke="#5b83aa"
          strokeWidth="3"
          opacity="0.7"
        />
        <Rect x="105" y="102" width="110" height="13" rx="3" fill="#c6d1d0" />

        <Rect
          x="52"
          y="73"
          width="36"
          height="34"
          rx="4"
          fill="#91aab2"
          stroke="#506b78"
          strokeWidth="2"
        />
        <Rect x="57" y="78" width="23" height="17" rx="2" fill="#235465" />
        <Circle cx="84" cy="82" r="2" fill="#e6c56b" />
        <Circle cx="84" cy="91" r="2" fill="#75c2b0" />
        <Rect
          x="241"
          y="71"
          width="25"
          height="41"
          rx="4"
          fill="#8fa7b0"
          stroke="#52697d"
          strokeWidth="2"
        />
        <Line x1="246" y1="79" x2="261" y2="79" stroke="#52697d" strokeWidth="2" />
        <Line x1="246" y1="87" x2="261" y2="87" stroke="#52697d" strokeWidth="2" />

        <Polygon
          points="58,126 262,126 298,271 22,271"
          fill="#e8e5dd"
          stroke="#8e9fa7"
          strokeWidth="2"
        />
        <G clipPath="url(#floorClip)">
          {Array.from({ length: 9 }, (_, index) => (
            <Line
              key={`v${index}`}
              x1={58 + index * 25.5}
              y1="126"
              x2={22 + index * 34.5}
              y2="271"
              stroke="#d0d0c9"
              strokeWidth="1"
            />
          ))}
          {[0.17, 0.37, 0.62, 0.9].map((depth) => (
            <Line
              key={`h${depth}`}
              x1={58 - depth * 36}
              y1={126 + depth * 145}
              x2={262 + depth * 36}
              y2={126 + depth * 145}
              stroke="#d0d0c9"
              strokeWidth="1"
            />
          ))}
        </G>

        {placements
          .filter((placement) => placement.area === 'INTERIOR')
          .sort((a, b) => a.transform.layer - b.transform.layer)
          .map((placement) => {
            const point = floorPoint(placement.transform.x, placement.transform.y);
            return (
              <G
                key={placement.placementId}
                transform={`translate(${point.x} ${point.y}) scale(${point.scale}) rotate(${placement.transform.rotation})`}
              >
                <Ellipse cx="0" cy="12" rx="22" ry="7" fill="#657983" opacity="0.2" />
                <Polygon
                  points="-19,-10 19,-10 19,11 -19,11"
                  fill="#a5bac5"
                  stroke="#52697d"
                  strokeWidth="2"
                />
                <Rect
                  x="-19"
                  y="-18"
                  width="38"
                  height="19"
                  rx="5"
                  fill="#b8cbd2"
                  stroke="#52697d"
                  strokeWidth="2"
                />
                <Line x1="-14" y1="-8" x2="14" y2="-8" stroke="#7d98a7" strokeWidth="1.5" />
                <SvgText x="0" y="28" fill="#273a52" fontSize="8" textAnchor="middle">
                  {itemNames[placement.inventoryId] ?? '배치 아이템'}
                </SvgText>
              </G>
            );
          })}

        {/* 앞쪽은 낮은 단면으로 남겨 방 안이 보이게 한다. */}
        <Polygon
          points="22,271 122,271 122,283 198,283 198,271 298,271 292,296 28,296"
          fill="#b3c2c7"
          stroke="#52697d"
          strokeWidth="2"
        />
        <Rect
          x="120"
          y="278"
          width="80"
          height="27"
          rx="5"
          fill="#879ba8"
          stroke="#34495d"
          strokeWidth="2"
        />
        <Rect x="131" y="284" width="58" height="15" rx="3" fill="#536977" />
        <Rect x="146" y="290" width="28" height="3" rx="1.5" fill="#f0c776" />
        <Line x1="39" y1="282" x2="111" y2="282" stroke="#8297a0" strokeWidth="2" />
        <Line x1="209" y1="282" x2="281" y2="282" stroke="#8297a0" strokeWidth="2" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', maxWidth: 460, aspectRatio: 1, alignSelf: 'center' },
});
