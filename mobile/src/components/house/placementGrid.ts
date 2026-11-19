// 하우징 배치 좌표 체계. 꾸미기(내 아이템)·상점 배치·조회 화면이 모두 이 모듈을 쓴다.
//
// - 저장 좌표: API-702 transform.x·y. 0~1 실수. 방 그림 전체 폭·높이에 대한 비율이며 가구 중심점이다.
//   서버는 [0, 1] 범위만 검사하고 그리드를 모른다(HousingPlacementTransformRequest).
// - 그리드 좌표: 저장 좌표 × columns·rows 를 반올림한 정수 칸. 화면 계산에만 쓰고 서버에는 보내지 않는다.
// - 화면 좌표: 렌더링할 때만 장면 크기를 곱해 만든다.
//
// 그리드에 스냅한 저장 좌표는 col / columns 형태의 0~1 실수라 기존 API 형식 그대로 저장된다.

export type GridSpec = { columns: number; rows: number };
export type GridCell = { col: number; row: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type PlaceableArea = { minX: number; maxX: number; minY: number; maxY: number };

// 한 칸이 원본 캔버스 기준 약 6.6px. 기존 1/50 저장값 중 격자 밖 값은 그대로 그리고 옮길 때 스냅한다.
export const HOUSING_GRID: GridSpec = { columns: 25, rows: 25 };

// 도트 원본 캔버스(1배) 크기. 그림 파일은 6배(996×1032)로 내보낸다.
// 서버 가구 width·height 도 이 1배 픽셀 단위다(V55__housing_art.sql).
export const ROOM_1X: Size = { width: 166, height: 172 };
// 방 그림의 노란 바닥 안쪽(1배 px). 6배 그림에서 x 30~965, y 354~995 를 잰 값이다.
export const FLOOR_1X: PlaceableArea = { minX: 5, maxX: 161, minY: 59, maxY: 166 };
// 바닥 모서리 반지름(1배 px). 6배 그림에서 약 80px.
export const FLOOR_RADIUS_1X = 13;
// 서버 그림·크기가 없는 가구의 상자(1배 px). 예전 디자인 65/314 비율을 유지한다.
export const DEFAULT_FURNITURE_1X: Size = { width: 34, height: 34 };
// 상자 안 대체 SVG 그림 비율(예전 55/65).
export const FALLBACK_ART_RATIO = 55 / 65;

// 가구 중심이 놓일 수 있는 범위(저장 좌표). 서버에는 이 제약이 없다.
// 가로는 가구 전체가 바닥 안에 있어야 한다. 세로는 중심이 바닥 위에 있고 아래 끝이 바닥을 넘지 않아야 한다.
// 키 큰 가구는 윗부분이 벽에 걸칠 수 있다. 바닥보다 넓은 가구는 가운데에만 둔다.
export const placeableArea = (size: Size = DEFAULT_FURNITURE_1X): PlaceableArea => {
  const minX = (FLOOR_1X.minX + size.width / 2) / ROOM_1X.width;
  const maxX = (FLOOR_1X.maxX - size.width / 2) / ROOM_1X.width;
  const minY = FLOOR_1X.minY / ROOM_1X.height;
  const maxY = (FLOOR_1X.maxY - size.height / 2) / ROOM_1X.height;
  const midX = (minX + maxX) / 2;
  return {
    minX: Math.min(minX, midX),
    maxX: Math.max(maxX, midX),
    minY,
    maxY: Math.max(maxY, minY),
  };
};

export const PLACEABLE_AREA: PlaceableArea = placeableArea();

// API-702 transform.layer 허용 범위(@Min(0) @Max(9), OpenAPI Transform.layer maximum 9).
export const MIN_LAYER = 0;
export const MAX_LAYER = 9;

const EPSILON = 1e-9;

// 화면 px / 1배 px.
export const furnitureScale = (inner: Size) => (inner.width > 0 ? inner.width / ROOM_1X.width : 1);

export const cellToPoint = ({ col, row }: GridCell, grid: GridSpec = HOUSING_GRID): Point => ({
  x: col / grid.columns,
  y: row / grid.rows,
});

export const pointToCell = ({ x, y }: Point, grid: GridSpec = HOUSING_GRID): GridCell => ({
  col: Math.round(x * grid.columns),
  row: Math.round(y * grid.rows),
});

export const placeableCells = (
  grid: GridSpec = HOUSING_GRID,
  area: PlaceableArea = PLACEABLE_AREA,
) => ({
  minCol: Math.ceil(area.minX * grid.columns - EPSILON),
  maxCol: Math.floor(area.maxX * grid.columns + EPSILON),
  minRow: Math.ceil(area.minY * grid.rows - EPSILON),
  maxRow: Math.floor(area.maxY * grid.rows + EPSILON),
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// 배치 가능 범위 밖의 칸은 가장 가까운 유효 칸으로 옮긴다.
export const clampCell = (
  cell: GridCell,
  grid: GridSpec = HOUSING_GRID,
  area: PlaceableArea = PLACEABLE_AREA,
): GridCell => {
  const bounds = placeableCells(grid, area);
  return {
    col: clamp(cell.col, bounds.minCol, bounds.maxCol),
    row: clamp(cell.row, bounds.minRow, bounds.maxRow),
  };
};

// 저장 좌표를 가장 가까운 유효 격자점으로 맞춘다.
export const snapPoint = (
  point: Point,
  grid: GridSpec = HOUSING_GRID,
  area: PlaceableArea = PLACEABLE_AREA,
): Point => cellToPoint(clampCell(pointToCell(point, grid), grid, area), grid);

export const isOnGrid = (point: Point, grid: GridSpec = HOUSING_GRID) =>
  Math.abs(point.x * grid.columns - Math.round(point.x * grid.columns)) < 1e-6 &&
  Math.abs(point.y * grid.rows - Math.round(point.y * grid.rows)) < 1e-6;

export const isPlaceable = (point: Point, area: PlaceableArea = PLACEABLE_AREA) =>
  point.x >= area.minX - EPSILON &&
  point.x <= area.maxX + EPSILON &&
  point.y >= area.minY - EPSILON &&
  point.y <= area.maxY + EPSILON;

export const toPixels = (point: Point, inner: Size) => ({
  left: point.x * inner.width,
  top: point.y * inner.height,
});

// 드래그 시작 좌표 + 누적 이동량(px)으로 놓일 격자점을 구한다.
// 누적 이동량만 쓰므로 빠르게 끌어도 이벤트 사이 오차가 쌓이지 않는다.
export const dragTarget = (
  start: Point,
  delta: { dx: number; dy: number },
  inner: Size,
  grid: GridSpec = HOUSING_GRID,
  area: PlaceableArea = PLACEABLE_AREA,
): Point => {
  if (inner.width <= 0 || inner.height <= 0) return start;
  return snapPoint(
    { x: start.x + delta.dx / inner.width, y: start.y + delta.dy / inner.height },
    grid,
    area,
  );
};

// 새로 꺼낸 가구의 첫 위치. 3열로 늘어놓고 모두 유효 격자점에 맞춘다.
export const initialPoint = (count: number): Point =>
  snapPoint({
    x: 0.36 + (count % 3) * 0.14,
    y: Math.min(0.86, 0.55 + Math.floor(count / 3) * 0.08),
  });

// 격자선 위치(px). 0과 끝 선은 장면 테두리와 겹쳐 그리지 않는다.
export const gridLines = (inner: Size, grid: GridSpec = HOUSING_GRID) => ({
  columns: Array.from({ length: grid.columns - 1 }, (_, index) => {
    const col = index + 1;
    return { index: col, position: (col / grid.columns) * inner.width };
  }),
  rows: Array.from({ length: grid.rows - 1 }, (_, index) => {
    const row = index + 1;
    return { index: row, position: (row / grid.rows) * inner.height };
  }),
});

// ---- 겹침 순서(layer)
//
// layer 는 화면 겹침만 정한다. 위치 좌표와 별개다.
// 서버 응답은 layer 오름차순, 같은 layer 안에서는 placementId 오름차순이다(findAllByUserIdOrderByLayerAscIdAsc).
// 같은 layer 끼리의 순서는 API 로 지정할 수 없으므로, 앞·뒤 보내기는 대상 가구가 다른 모든 가구와 다른 layer 를 갖게 한다.

export type LayerEntry = { key: string; layer: number };

// 새 가구는 맨 앞에 둔다. 이미 MAX_LAYER 면 같은 값이 되고, 나중에 만든 배치(큰 placementId)가 위에 그려진다.
export const nextLayer = (layers: number[]) =>
  layers.length ? clamp(Math.max(...layers) + 1, MIN_LAYER, MAX_LAYER) : MIN_LAYER;

// 다른 가구들의 서로 다른 layer 값을 0부터 촘촘히 다시 매긴다.
// 값 종류가 slots 개보다 많으면 mergeFrom 쪽(아래 또는 위)부터 합친다. 합쳐진 가구끼리는 placementId 순서를 따른다.
const compressLayers = (layers: number[], slots: number, mergeFrom: 'bottom' | 'top') => {
  const levels = [...new Set(layers)].sort((a, b) => a - b);
  const overflow = Math.max(0, levels.length - slots);
  const rank = new Map(
    levels.map((level, index) => [
      level,
      mergeFrom === 'bottom' ? Math.max(0, index - overflow) : Math.min(index, slots - 1),
    ]),
  );
  return (layer: number) => rank.get(layer) ?? 0;
};

const unchanged = (entries: LayerEntry[]) =>
  new Map(entries.map((entry) => [entry.key, entry.layer]));

export const bringToFront = (entries: LayerEntry[], key: string): Map<string, number> => {
  const target = entries.find((entry) => entry.key === key);
  const others = entries.filter((entry) => entry.key !== key);
  if (!target) return unchanged(entries);
  if (!others.length) return new Map([[key, clamp(target.layer, MIN_LAYER, MAX_LAYER)]]);
  const top = Math.max(...others.map((entry) => entry.layer));
  const valid = others.every((entry) => entry.layer >= MIN_LAYER && entry.layer <= MAX_LAYER);
  if (valid && target.layer > top && target.layer <= MAX_LAYER) return unchanged(entries);
  if (valid && top < MAX_LAYER) {
    const result = unchanged(entries);
    result.set(key, top + 1);
    return result;
  }
  // 다른 가구가 0~9 를 다 쓰고 있으면 0~8 로 다시 매기고 대상에 그 위 값을 준다.
  const rank = compressLayers(
    others.map((entry) => entry.layer),
    MAX_LAYER,
    'bottom',
  );
  const result = new Map(others.map((entry) => [entry.key, rank(entry.layer)]));
  result.set(key, Math.max(...result.values()) + 1);
  return result;
};

export const sendToBack = (entries: LayerEntry[], key: string): Map<string, number> => {
  const target = entries.find((entry) => entry.key === key);
  const others = entries.filter((entry) => entry.key !== key);
  if (!target) return unchanged(entries);
  if (!others.length) return new Map([[key, clamp(target.layer, MIN_LAYER, MAX_LAYER)]]);
  const bottom = Math.min(...others.map((entry) => entry.layer));
  const valid = others.every((entry) => entry.layer >= MIN_LAYER && entry.layer <= MAX_LAYER);
  if (valid && target.layer < bottom && target.layer >= MIN_LAYER) return unchanged(entries);
  if (valid && bottom > MIN_LAYER) {
    const result = unchanged(entries);
    result.set(key, bottom - 1);
    return result;
  }
  // 다른 가구가 0 을 쓰고 있으면 1~9 로 다시 매기고 대상을 0 에 둔다.
  const rank = compressLayers(
    others.map((entry) => entry.layer),
    MAX_LAYER,
    'top',
  );
  const result = new Map(others.map((entry) => [entry.key, rank(entry.layer) + 1]));
  result.set(key, MIN_LAYER);
  return result;
};
