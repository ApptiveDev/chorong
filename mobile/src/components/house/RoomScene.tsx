import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { HousingGrid } from './HousingGrid';
import {
  DEFAULT_FURNITURE_1X,
  dragTarget,
  FALLBACK_ART_RATIO,
  furnitureScale,
  placeableArea,
  type Point,
  ROOM_1X,
  type Size,
  toPixels,
} from './placementGrid';

// 6배로 내보낸 도트 방 그림(996×1032). 화면에서는 줄여 그려 선명하다.
const roomSource = require('../../../assets/housing/room.png');
const TOOL_MARGIN = 4;
const TOOLS_WIDTH = 68;
const TOOLS_HEIGHT = 32;
const MENU_WIDTH = 120;
const MENU_HEIGHT = 79;
const SELECTED_BLUE = '#38acff';

export type RoomSceneItem = {
  key: string;
  name: string;
  x: number;
  y: number;
  layer: number;
  color?: string;
  pending?: boolean;
  // 서버 가구 그림. 없으면 이름으로 고른 SVG 를 기본 상자 크기로 그린다.
  art?: FurnitureImage;
};

// width·height 는 1배 px.
export type FurnitureImage = { uri: string; width: number; height: number };

// 서버 그림 필드를 화면용으로 바꾼다. URL 이 아니거나(목업 previewAsset) 크기가 없으면 그림 없이 그린다.
export const furnitureImage = (
  uri: string | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined,
): FurnitureImage | undefined =>
  uri && /^https?:\/\//.test(uri) && width && height && width > 0 && height > 0
    ? { uri, width, height }
    : undefined;

const itemSize = (item: RoomSceneItem): Size => item.art ?? DEFAULT_FURNITURE_1X;

export function RoomScene({
  items,
  editable = false,
  showGrid = editable,
  selectedKey,
  onSelect,
  onMove,
  onRemove,
  onToggleLayer,
  layerMenu = false,
  onChangeLayer,
  onClearSelection,
}: {
  items: RoomSceneItem[];
  editable?: boolean;
  // 꾸미기·상점 배치 화면에서만 격자를 그린다. 조회 화면은 기본값(editable=false)으로 숨긴다.
  showGrid?: boolean;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  // x·y 는 그리드에 스냅한 저장 좌표(0~1)다.
  onMove?: (key: string, x: number, y: number) => void;
  onRemove?: () => void;
  onToggleLayer?: () => void;
  layerMenu?: boolean;
  onChangeLayer?: (front: boolean) => void;
  // 편집 중 빈 곳을 누르면 선택을 해제한다.
  onClearSelection?: () => void;
}) {
  const [inner, setInner] = useState<Size>({
    width: ROOM_1X.width * 2,
    height: ROOM_1X.height * 2,
  });
  const [dragPreview, setDragPreview] = useState<{ point: Point; size: Size } | null>(null);
  const selectedItem = items.find((item) => item.key === selectedKey);
  // 가구 크기를 장면 폭에 비례시켜 화면 크기가 달라도 같은 배치로 보이게 한다.
  const scale = furnitureScale(inner);
  const previewPixels = dragPreview ? toPixels(dragPreview.point, inner) : null;
  const previewBox = dragPreview
    ? { width: dragPreview.size.width * scale, height: dragPreview.size.height * scale }
    : null;
  const clamp = (value: number, length: number, limit: number) =>
    Math.min(Math.max(TOOL_MARGIN, value), Math.max(TOOL_MARGIN, limit - length - TOOL_MARGIN));
  const centerX = (selectedItem?.x ?? 0) * inner.width;
  const centerY = (selectedItem?.y ?? 0) * inner.height;
  // Figma U01_1(656:2997): 아이템(80) 중심 기준 도구 묶음 (+6, -88), 순서 메뉴 (+7, -50).
  const toolsPosition = {
    left: clamp(centerX + 6, TOOLS_WIDTH, inner.width),
    top: clamp(centerY - 88, TOOLS_HEIGHT, inner.height),
  };
  const menuPosition = {
    left: clamp(centerX + 7, MENU_WIDTH, inner.width),
    top: clamp(centerY - 50, MENU_HEIGHT, inner.height),
  };
  return (
    <View
      style={s.scene}
      accessibilityLabel="우주선 방"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setInner({ width, height });
      }}
    >
      <Image source={roomSource} style={s.background} resizeMode="stretch" />
      {editable && onClearSelection ? (
        <Pressable accessible={false} onPress={onClearSelection} style={StyleSheet.absoluteFill} />
      ) : null}
      {showGrid ? <HousingGrid size={inner} /> : null}
      {previewPixels && previewBox ? (
        // 손을 떼면 가구가 놓일 격자점. 가구보다 아래에 그린다.
        <View
          pointerEvents="none"
          style={[
            s.dropPreview,
            {
              left: previewPixels.left - previewBox.width / 2,
              top: previewPixels.top - previewBox.height / 2,
              width: previewBox.width,
              height: previewBox.height,
            },
          ]}
        >
          <View style={s.dropPreviewDot} />
        </View>
      ) : null}
      {/* 같은 layer 는 배열 순서(서버 응답의 placementId 순)를 유지한다. */}
      {[...items]
        .sort((a, b) => a.layer - b.layer)
        .map((item) => (
          <DraggableItem
            key={item.key}
            item={item}
            inner={inner}
            scale={scale}
            editable={editable}
            selected={selectedKey === item.key}
            onSelect={onSelect}
            onMove={onMove}
            onPreview={setDragPreview}
          />
        ))}
      <View style={s.cat} pointerEvents="none">
        <RoomCat />
      </View>
      {editable && selectedItem && onRemove ? (
        // Figma 656:2999 button: 68×32, 배경 #F1F1F1, 테두리 0.8 #000, 모서리 16, 왼쪽 4 · 간격 8
        <View style={[s.selectionTools, toolsPosition]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${selectedItem.name} 배치에서 빼기`}
            onPress={onRemove}
            hitSlop={6}
          >
            <RemoveIcon />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="겹침 순서 메뉴"
            accessibilityState={{ expanded: layerMenu }}
            onPress={onToggleLayer}
            hitSlop={8}
            style={s.moreButton}
          >
            <MoreIcon />
          </Pressable>
        </View>
      ) : null}
      {editable && layerMenu && selectedItem && onChangeLayer ? (
        // Figma 656:3009 Frame 153: 폭 120, 항목 높이 40, 배경 #F1F1F1, 테두리 1 #161616
        <View style={[s.layerMenu, menuPosition]}>
          {(
            [
              { front: true, label: '앞으로 보내기' },
              { front: false, label: '뒤로 보내기' },
            ] as const
          ).map((entry) => (
            <Pressable
              key={entry.label}
              accessibilityRole="button"
              onPress={() => onChangeLayer(entry.front)}
              style={[s.layerItem, entry.front ? s.layerItemTop : s.layerItemBottom]}
            >
              {({ pressed }) => (
                <Text style={[s.layerText, pressed && s.layerTextPressed]}>{entry.label}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const DRAG_THRESHOLD = 5;

function DraggableItem({
  item,
  inner,
  scale,
  editable,
  selected,
  onSelect,
  onMove,
  onPreview,
}: {
  item: RoomSceneItem;
  inner: Size;
  // 화면 px / 1배 px
  scale: number;
  editable: boolean;
  selected: boolean;
  onSelect?: (key: string) => void;
  onMove?: (key: string, x: number, y: number) => void;
  onPreview?: (preview: { point: Point; size: Size } | null) => void;
}) {
  const offset = useRef(new Animated.ValueXY()).current;
  const latest = useRef({ item, inner, editable, onSelect, onMove, onPreview });
  useEffect(() => {
    latest.current = { item, inner, editable, onSelect, onMove, onPreview };
  }, [item, inner, editable, onSelect, onMove, onPreview]);
  // 미리보기 격자점이 바뀔 때만 상위 상태를 갱신한다.
  const previewRef = useRef<Point | null>(null);
  const setPreview = (point: Point | null) => {
    const previous = previewRef.current;
    if (
      previous === point ||
      (previous && point && previous.x === point.x && previous.y === point.y)
    )
      return;
    previewRef.current = point;
    latest.current.onPreview?.(point ? { point, size: itemSize(latest.current.item) } : null);
  };
  // 저장 좌표가 바뀌어 새 위치로 그려지면 손을 뗄 때 남겨 둔 이동량을 지운다. 같은 커밋에서 처리해 깜빡이지 않는다.
  useLayoutEffect(() => {
    offset.setValue({ x: 0, y: 0 });
  }, [item.x, item.y, inner.width, inner.height]);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.editable,
      onMoveShouldSetPanResponder: () => latest.current.editable,
      onPanResponderGrant: () => latest.current.onSelect?.(latest.current.item.key),
      // 드래그 중에는 손가락을 그대로 따라가고, 놓일 격자점은 미리보기로 보여준다.
      onPanResponderMove: (_, gesture) => {
        offset.setValue({ x: gesture.dx, y: gesture.dy });
        if (Math.hypot(gesture.dx, gesture.dy) <= DRAG_THRESHOLD) return;
        const { item: current, inner: size } = latest.current;
        setPreview(dragTarget(current, gesture, size, undefined, placeableArea(itemSize(current))));
      },
      onPanResponderRelease: (_, gesture) => {
        const { item: current, inner: size, onMove: move } = latest.current;
        setPreview(null);
        if (Math.hypot(gesture.dx, gesture.dy) <= DRAG_THRESHOLD) {
          offset.setValue({ x: 0, y: 0 });
          return;
        }
        // 손을 떼면 가장 가까운 유효 격자점에 맞춘다. 범위 밖이면 가장 가까운 유효 칸으로 옮긴다.
        const target = dragTarget(
          current,
          gesture,
          size,
          undefined,
          placeableArea(itemSize(current)),
        );
        if (target.x === current.x && target.y === current.y) {
          offset.setValue({ x: 0, y: 0 });
          return;
        }
        const from = toPixels(current, size);
        const to = toPixels(target, size);
        offset.setValue({ x: to.left - from.left, y: to.top - from.top });
        move?.(current.key, target.x, target.y);
      },
      onPanResponderTerminate: () => {
        setPreview(null);
        offset.setValue({ x: 0, y: 0 });
      },
    }),
  ).current;
  const box = { width: itemSize(item).width * scale, height: itemSize(item).height * scale };
  return (
    <Animated.View
      {...pan.panHandlers}
      accessible={editable}
      accessibilityRole={editable ? 'button' : undefined}
      accessibilityLabel={editable ? `${item.name} 선택 및 이동` : undefined}
      style={[
        s.furniture,
        {
          left: `${item.x * 100}%`,
          top: `${item.y * 100}%`,
          width: box.width,
          height: box.height,
          zIndex: item.layer + 2,
        },
        selected && s.furnitureSelected,
        {
          transform: [
            { translateX: -box.width / 2 },
            { translateY: -box.height / 2 },
            ...offset.getTranslateTransform(),
          ],
        },
      ]}
    >
      {item.art ? (
        <Image
          source={{ uri: item.art.uri }}
          style={s.furnitureImage}
          resizeMode="stretch"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <FurnitureArt name={item.name} color={item.color} size={box.width * FALLBACK_ART_RATIO} />
      )}
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
  // 색상 옵션(빨강·노랑·초록·파랑·보라)은 영문 서버 값 · 한글 목업 값 모두 받는다. 그 밖은 기본 나무색.
  const shade = color?.startsWith('#')
    ? color
    : /green|초록/i.test(color ?? '')
      ? '#a9b9ac'
      : /purple|보라/i.test(color ?? '')
        ? '#b9afd0'
        : /red|빨강/i.test(color ?? '')
          ? '#d1a29d'
          : /blue|파랑/i.test(color ?? '')
            ? '#929db2'
            : /yellow|노랑/i.test(color ?? '')
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

// Figma 656:1530 button_X Variant2 (24×24, 원 #D9D9D9 · X #161616)
function RemoveIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect width={24} height={24} rx={12} fill="#d9d9d9" />
      <Path
        d="M14.9911 8.13783C15.1696 7.95406 15.459 7.95406 15.6376 8.13783C15.816 8.32162 15.8161 8.61952 15.6376 8.80328L12.6465 11.8824L15.8661 15.1967C16.0446 15.3805 16.0446 15.6784 15.8661 15.8622C15.6876 16.046 15.3982 16.0459 15.2197 15.8622L12 12.5478L8.78033 15.8622C8.60182 16.046 8.31243 16.0459 8.1339 15.8622C7.95537 15.6784 7.95537 15.3805 8.1339 15.1967L11.3536 11.8824L8.36247 8.80328C8.18394 8.61951 8.18394 8.32161 8.36247 8.13783C8.541 7.95406 8.83038 7.95406 9.00891 8.13783L12 11.2169L14.9911 8.13783Z"
        fill="#161616"
      />
    </Svg>
  );
}

// Figma 656:1534 Frame 137 (점 3개, 20×4, #161616)
function MoreIcon() {
  return (
    <Svg width={20} height={4} viewBox="0 0 20 4" fill="none">
      <Circle cx={2} cy={2} r={2} fill="#161616" />
      <Circle cx={10} cy={2} r={2} fill="#161616" />
      <Circle cx={18} cy={2} r={2} fill="#161616" />
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
  // 방 그림이 테두리·창문·바닥을 모두 그린다. 모서리는 투명이다.
  scene: {
    width: '100%',
    maxWidth: ROOM_1X.width * 2,
    aspectRatio: ROOM_1X.width / ROOM_1X.height,
    alignSelf: 'center',
  },
  background: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  furniture: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropPreview: {
    position: 'absolute',
    zIndex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: SELECTED_BLUE,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 172, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  furnitureImage: { width: '100%', height: '100%' },
  dropPreviewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SELECTED_BLUE },
  // Figma 656:1512 가구 선택 pressed: 테두리 2 #38ACFF, 모서리 8
  furnitureSelected: {
    borderWidth: 2,
    borderColor: SELECTED_BLUE,
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
    width: TOOLS_WIDTH,
    height: TOOLS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    paddingVertical: 4,
    backgroundColor: '#f1f1f1',
    borderWidth: 0.8,
    borderColor: '#000000',
    borderRadius: 16,
  },
  moreButton: { width: 20, height: 24, alignItems: 'center', justifyContent: 'center' },
  layerMenu: { position: 'absolute', zIndex: 2100, width: MENU_WIDTH },
  layerItem: {
    height: 40,
    paddingHorizontal: 20,
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#161616',
  },
  layerItemTop: { marginBottom: -1, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  layerItemBottom: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  layerText: { color: '#424242', fontFamily: 'PretendardSemiBold', fontSize: 14 },
  layerTextPressed: { color: '#aaaaaa' },
});
