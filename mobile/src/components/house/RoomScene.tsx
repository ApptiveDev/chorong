import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

export type RoomSceneItem = {
  key: string;
  name: string;
  x: number;
  y: number;
  layer: number;
  color?: string;
  pending?: boolean;
};

export function RoomScene({
  items,
  editable = false,
  selectedKey,
  onSelect,
  onMove,
  onInvalidDrop,
  onRemove,
  onToggleLayer,
  layerMenu = false,
  onChangeLayer,
}: {
  items: RoomSceneItem[];
  editable?: boolean;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  onMove?: (key: string, x: number, y: number) => void;
  onInvalidDrop?: () => void;
  onRemove?: () => void;
  onToggleLayer?: () => void;
  layerMenu?: boolean;
  onChangeLayer?: (front: boolean) => void;
}) {
  const [size, setSize] = useState({ width: 330, height: 342 });
  const selectedItem = items.find((item) => item.key === selectedKey);
  return (
    <View
      style={s.scene}
      accessibilityLabel="우주선 방"
      onLayout={(event) => setSize(event.nativeEvent.layout)}
    >
      <View style={s.floor}>
        {[20, 40, 60, 80].map((left) => (
          <View key={left} style={[s.floorLine, { left: `${left}%` }]} />
        ))}
      </View>
      <View style={s.window}>
        <Text style={s.windowStars}>✦ · ✧</Text>
        <View style={s.moon} />
      </View>
      {[...items]
        .sort((a, b) => a.layer - b.layer)
        .map((item) => (
          <DraggableItem
            key={item.key}
            item={item}
            sceneSize={size}
            editable={editable}
            selected={selectedKey === item.key}
            onSelect={onSelect}
            onMove={onMove}
            onInvalidDrop={onInvalidDrop}
          />
        ))}
      <View style={s.cat} pointerEvents="none">
        <RoomCat />
      </View>
      {editable && selectedItem && onRemove ? (
        <View
          style={[
            s.selectionTools,
            {
              left: `${Math.min(0.77, Math.max(0.23, selectedItem.x)) * 100}%`,
              top: `${Math.max(0.17, selectedItem.y - 0.12) * 100}%`,
            },
          ]}
        >
          <Text style={s.selectionLabel}>{selectedItem.pending ? '구매 예정' : '보유 아이템'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="선택한 가구 회수"
            onPress={onRemove}
            style={s.toolButton}
          >
            <Ionicons name="close" size={18} color="#655174" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="가구 겹침 순서"
            onPress={onToggleLayer}
            style={s.toolButton}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#655174" />
          </Pressable>
        </View>
      ) : null}
      {editable && layerMenu && selectedItem && onChangeLayer ? (
        <View style={s.layerMenu}>
          <Pressable accessibilityRole="button" onPress={() => onChangeLayer(true)}>
            <Text style={s.layerText}>맨 앞으로 보내기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onChangeLayer(false)}>
            <Text style={s.layerText}>맨 뒤로 보내기</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function DraggableItem({
  item,
  sceneSize,
  editable,
  selected,
  onSelect,
  onMove,
  onInvalidDrop,
}: {
  item: RoomSceneItem;
  sceneSize: { width: number; height: number };
  editable: boolean;
  selected: boolean;
  onSelect?: (key: string) => void;
  onMove?: (key: string, x: number, y: number) => void;
  onInvalidDrop?: () => void;
}) {
  const offset = useRef(new Animated.ValueXY()).current;
  const latest = useRef({ item, sceneSize, editable, onSelect, onMove, onInvalidDrop });
  useEffect(() => {
    latest.current = { item, sceneSize, editable, onSelect, onMove, onInvalidDrop };
  }, [item, sceneSize, editable, onSelect, onMove, onInvalidDrop]);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.editable,
      onMoveShouldSetPanResponder: () => latest.current.editable,
      onPanResponderGrant: () => latest.current.onSelect?.(latest.current.item.key),
      onPanResponderMove: (_, gesture) => {
        offset.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        const {
          item: current,
          sceneSize: size,
          onMove: move,
          onInvalidDrop: invalid,
        } = latest.current;
        if (Math.hypot(gesture.dx, gesture.dy) > 5) {
          const x = Math.round((current.x + gesture.dx / size.width) * 50) / 50;
          const y = Math.round((current.y + gesture.dy / size.height) * 50) / 50;
          if (
            x < 34 / size.width ||
            x > 1 - 34 / size.width ||
            y < 0.43 ||
            y > 1 - 34 / size.height
          )
            invalid?.();
          else move?.(current.key, x, y);
        }
        offset.setValue({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => offset.setValue({ x: 0, y: 0 }),
    }),
  ).current;
  return (
    <Animated.View
      {...pan.panHandlers}
      accessible={editable}
      accessibilityRole={editable ? 'button' : undefined}
      accessibilityLabel={editable ? `${item.name} 선택 및 이동` : undefined}
      style={[
        s.furniture,
        { left: `${item.x * 100}%`, top: `${item.y * 100}%`, zIndex: item.layer + 2 },
        selected && s.furnitureSelected,
        {
          transform: [{ translateX: -32 }, { translateY: -32 }, ...offset.getTranslateTransform()],
        },
      ]}
    >
      <FurnitureArt name={item.name} color={item.color} />
      {item.pending ? <View style={s.pendingDot} /> : null}
    </Animated.View>
  );
}

export function FurnitureArt({
  name,
  color,
  size = 55,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const shade = color?.startsWith('#')
    ? color
    : /세이지|초록/.test(color ?? '')
      ? '#a9b9ac'
      : /라벤더|보라/.test(color ?? '')
        ? '#b9afd0'
        : /로즈|분홍/.test(color ?? '')
          ? '#d1a29d'
          : /블루|파랑/.test(color ?? '')
            ? '#929db2'
            : /노랑/.test(color ?? '')
              ? '#e9d69a'
              : '#d9bf99';
  const edge = '#807064';
  const kind = /의자|chair/i.test(name)
    ? 'chair'
    : /화분|plant/i.test(name)
      ? 'plant'
      : /러그|rug/i.test(name)
        ? 'rug'
        : /조명|lamp/i.test(name)
          ? 'lamp'
          : /책장|shelf/i.test(name)
            ? 'shelf'
            : /탁자|책상|desk|table/i.test(name)
              ? 'desk'
              : /침대|bed/i.test(name)
                ? 'bed'
                : /별|star/i.test(name)
                  ? 'star'
                  : 'object';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {kind === 'plant' ? (
        <>
          <Path d="M32 40V12" fill="none" stroke="#749472" strokeWidth={2} />
          <Path
            d="M31 33C7 34 8 11 15 12c13 3 18 9 16 21z"
            fill="#94aa88"
            stroke={edge}
            strokeWidth={2}
          />
          <Path
            d="M33 27C55 28 58 6 49 7c-13 2-19 10-16 20z"
            fill="#7e9e7e"
            stroke={edge}
            strokeWidth={2}
          />
          <Path d="M19 39h28l-5 20H24z" fill={shade} stroke={edge} strokeWidth={2} />
        </>
      ) : kind === 'rug' ? (
        <>
          <Ellipse cx={32} cy={39} rx={29} ry={16} fill={shade} stroke={edge} strokeWidth={2} />
          <Ellipse
            cx={32}
            cy={39}
            rx={22}
            ry={11}
            fill="none"
            stroke={edge}
            strokeWidth={2}
            strokeDasharray="3 3"
          />
        </>
      ) : kind === 'lamp' ? (
        <Path d="M32 26v32M19 8h26l9 22H10z" fill={shade} stroke={edge} strokeWidth={2} />
      ) : kind === 'shelf' ? (
        <>
          <Rect
            x={9}
            y={5}
            width={47}
            height={56}
            rx={3}
            fill={shade}
            stroke={edge}
            strokeWidth={2}
          />
          <Path
            d="M10 24h45M10 43h45M17 11v11m7-11v11m14-11 6 11M18 30v11m8-11v11m7-11v11M18 48v10m9-10v10m16-9v9"
            fill="none"
            stroke="#faf7ef"
            strokeWidth={4}
          />
        </>
      ) : kind === 'chair' ? (
        <>
          <Rect
            x={16}
            y={8}
            width={34}
            height={31}
            rx={5}
            fill={shade}
            stroke={edge}
            strokeWidth={2}
          />
          <Path d="M17 42v17m30-17v17" fill="none" stroke={edge} strokeWidth={2} />
          <Rect
            x={12}
            y={34}
            width={43}
            height={12}
            rx={4}
            fill={shade}
            stroke={edge}
            strokeWidth={2}
          />
        </>
      ) : kind === 'desk' ? (
        <>
          <Path d="M9 31v28m48-28v28" fill="none" stroke={edge} strokeWidth={2} />
          <Rect
            x={4}
            y={23}
            width={57}
            height={12}
            rx={3}
            fill={shade}
            stroke={edge}
            strokeWidth={2}
          />
          <Rect
            x={39}
            y={35}
            width={16}
            height={12}
            rx={2}
            fill={shade}
            stroke={edge}
            strokeWidth={2}
          />
        </>
      ) : kind === 'bed' ? (
        <>
          <Rect
            x={7}
            y={10}
            width={52}
            height={45}
            rx={5}
            fill={shade}
            stroke={edge}
            strokeWidth={2}
          />
          <Rect
            x={13}
            y={15}
            width={38}
            height={12}
            rx={4}
            fill="#faf6ec"
            stroke={edge}
            strokeWidth={2}
          />
          <Path d="M12 55v6m42-6v6M9 34h47" fill="none" stroke={edge} strokeWidth={2} />
        </>
      ) : kind === 'star' ? (
        <Path
          d="M32 5l7 17 18 2-14 12 4 18-15-10-15 10 4-18L7 24l18-2z"
          fill={shade}
          stroke={edge}
          strokeWidth={2}
        />
      ) : (
        <>
          <Ellipse cx={32} cy={50} rx={22} ry={7} fill="#b69f97" opacity={0.4} />
          <Rect
            x={13}
            y={15}
            width={38}
            height={35}
            rx={7}
            fill={shade}
            stroke={edge}
            strokeWidth={2}
          />
        </>
      )}
    </Svg>
  );
}

function RoomCat() {
  return (
    <Svg width={52} height={52} viewBox="0 0 64 64" accessibilityLabel="초롱이">
      <Path
        d="M14 29L12 10l17 12h9L53 9l-2 22c7 14 1 25-17 25S9 47 14 29z"
        fill="#f6f0de"
        stroke="#7d6e68"
        strokeWidth={2}
      />
      <Path d="M18 22l-2-7 9 8M41 23l8-9-1 10" fill="#deb7ac" />
      <Path d="M23 35v4M42 35v4" stroke="#6c5e5c" strokeWidth={3} strokeLinecap="round" />
      <Path
        d="M30 40l3 3 3-3M33 43v3m0 0l-4 2m4-2 4 2"
        fill="none"
        stroke="#b18f85"
        strokeWidth={1.5}
      />
      <Path d="M8 37l12 3M7 45l12-2M47 40l12-3M47 44l13 1" stroke="#bfae9e" strokeWidth={1.5} />
      <Path d="M29 25l2 5M36 25l-1 5" stroke="#d5bc99" strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

const s = StyleSheet.create({
  scene: {
    width: '100%',
    maxWidth: 330,
    aspectRatio: 330 / 342,
    alignSelf: 'center',
    borderWidth: 8,
    borderColor: '#e6dfec',
    borderTopLeftRadius: 95,
    borderTopRightRadius: 95,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#eee6e0',
    overflow: 'hidden',
  },
  floor: {
    position: 'absolute',
    top: '43%',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#d6c3b3',
    borderTopWidth: 3,
    borderTopColor: '#c2ad9e',
  },
  floorLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#b9a19222',
  },
  window: {
    position: 'absolute',
    left: '28%',
    top: '6%',
    width: '44%',
    height: '30%',
    borderWidth: 6,
    borderColor: '#fffbf8',
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#9691b5',
    overflow: 'hidden',
  },
  windowStars: { color: '#f1ebd0', fontSize: 24, position: 'absolute', left: 10, top: 7 },
  moon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e6d5c1',
    position: 'absolute',
    right: 9,
    bottom: -12,
  },
  furniture: {
    position: 'absolute',
    width: 65,
    height: 65,
    alignItems: 'center',
    justifyContent: 'center',
  },
  furnitureSelected: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#765c92',
    borderRadius: 8,
  },
  pendingDot: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#a58cbe',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cat: { position: 'absolute', left: '69%', top: '65%', zIndex: 800 },
  selectionTools: {
    position: 'absolute',
    zIndex: 2000,
    transform: [{ translateX: -65 }, { translateY: -38 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e3d8ed',
    borderRadius: 20,
    paddingLeft: 9,
    paddingRight: 3,
    paddingVertical: 3,
  },
  selectionLabel: { color: '#897299', fontSize: 10 },
  toolButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f0f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerMenu: {
    position: 'absolute',
    zIndex: 2100,
    right: 14,
    top: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4dce9',
    borderRadius: 14,
    padding: 7,
    minWidth: 150,
    gap: 3,
  },
  layerText: { color: '#655174', fontSize: 12, padding: 10 },
});
