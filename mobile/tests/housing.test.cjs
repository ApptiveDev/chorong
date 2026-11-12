const assert = require('node:assert/strict');
const { test } = require('node:test');
const grid = require('../.expo/housing-tests/placementGrid.js');

const {
  HOUSING_GRID,
  MAX_LAYER,
  bringToFront,
  clampCell,
  dragTarget,
  gridLines,
  initialPoint,
  isOnGrid,
  isPlaceable,
  nextLayer,
  placeableCells,
  sendToBack,
  snapPoint,
  toPixels,
} = grid;

const layersOf = (map) => Object.fromEntries(map);
// 서버 응답 순서와 같은 기준(layer 오름차순, 같은 값은 입력 순서)으로 그려지는 순서를 구한다.
const renderOrder = (entries, map) =>
  entries
    .map((entry, index) => ({ key: entry.key, layer: map.get(entry.key), index }))
    .sort((a, b) => a.layer - b.layer || a.index - b.index)
    .map((entry) => entry.key);

test('snapped points are API-compatible 0..1 values on the grid', () => {
  for (let i = 0; i < 500; i += 1) {
    const point = snapPoint({ x: Math.random() * 1.4 - 0.2, y: Math.random() * 1.4 - 0.2 });
    assert.ok(point.x >= 0 && point.x <= 1);
    assert.ok(point.y >= 0 && point.y <= 1);
    assert.ok(isOnGrid(point));
    assert.ok(isPlaceable(point));
    // JSON 직렬화 후에도 같은 격자점이다.
    assert.deepEqual(JSON.parse(JSON.stringify(point)), point);
  }
});

test('placeable cells match the previous editor bounds', () => {
  // 25칸 기준: x 0.12~0.88, y 0.44~0.88
  assert.deepEqual(placeableCells(), { minCol: 3, maxCol: 22, minRow: 11, maxRow: 22 });
});

test('drops outside the area clamp to the nearest valid cell', () => {
  assert.deepEqual(clampCell({ col: -3, row: 2 }), { col: 3, row: 11 });
  assert.deepEqual(clampCell({ col: 60, row: 90 }), { col: 22, row: 22 });
  assert.deepEqual(snapPoint({ x: 0.48, y: 0.1 }), { x: 0.48, y: 0.44 });
});

test('drag target uses cumulative delta and is independent of screen size', () => {
  const start = { x: 0.5, y: 0.6 };
  // 같은 비율만큼 끌면 장면 크기와 관계없이 같은 격자점이 된다.
  for (const width of [206, 273, 314, 480]) {
    const inner = { width, height: width * (326 / 314) };
    const target = dragTarget(start, { dx: inner.width * 0.13, dy: inner.height * 0.07 }, inner);
    assert.deepEqual(target, { x: 0.64, y: 0.68 });
  }
  // 이동 이벤트를 아무리 잘게 나눠도 마지막 누적값만 쓰므로 결과가 같다.
  const inner = { width: 314, height: 326 };
  let last;
  for (let step = 1; step <= 37; step += 1)
    last = dragTarget(start, { dx: (step * 91.3) / 37, dy: (step * -40.1) / 37 }, inner);
  assert.deepEqual(last, dragTarget(start, { dx: 91.3, dy: -40.1 }, inner));
  // 크기가 0이면 원래 위치를 유지한다.
  assert.deepEqual(dragTarget(start, { dx: 40, dy: 40 }, { width: 0, height: 0 }), start);
});

test('grid lines are drawn at the same positions furniture snaps to', () => {
  const inner = { width: 289.3, height: 300.1 };
  const lines = gridLines(inner);
  assert.equal(lines.columns.length, HOUSING_GRID.columns - 1);
  assert.equal(lines.rows.length, HOUSING_GRID.rows - 1);
  const point = snapPoint({ x: 0.333, y: 0.711 });
  const pixels = toPixels(point, inner);
  const col = lines.columns.find(
    (line) => line.index === Math.round(point.x * HOUSING_GRID.columns),
  );
  const row = lines.rows.find((line) => line.index === Math.round(point.y * HOUSING_GRID.rows));
  assert.ok(Math.abs(col.position - pixels.left) < 1e-9);
  assert.ok(Math.abs(row.position - pixels.top) < 1e-9);
});

test('initial points are on valid cells', () => {
  for (let count = 0; count < 30; count += 1) {
    const point = initialPoint(count);
    assert.ok(isOnGrid(point));
    assert.ok(isPlaceable(point));
  }
  assert.deepEqual(initialPoint(0), { x: 0.36, y: 0.56 });
});

test('new layers stay within 0..9', () => {
  assert.equal(nextLayer([]), 0);
  assert.equal(nextLayer([0, 3]), 4);
  assert.equal(nextLayer([9, 9]), MAX_LAYER);
});

test('bring to front only changes the target when there is room', () => {
  const entries = [
    { key: 'a', layer: 0 },
    { key: 'b', layer: 2 },
    { key: 'c', layer: 1 },
  ];
  assert.deepEqual(layersOf(bringToFront(entries, 'a')), { a: 3, b: 2, c: 1 });
  assert.deepEqual(layersOf(bringToFront(entries, 'b')), { a: 0, b: 2, c: 1 });
  // 다른 가구가 0 을 쓰고 있으면 나머지를 한 칸씩 올린다.
  assert.deepEqual(layersOf(sendToBack(entries, 'b')), { a: 1, b: 0, c: 2 });
  assert.deepEqual(layersOf(sendToBack([{ key: 'x', layer: 2 }, ...entries.slice(1)], 'c')), {
    x: 2,
    b: 2,
    c: 1,
  });
});

test('front/back keep every value within 0..9 and put the target strictly first or last', () => {
  const entries = Array.from({ length: 14 }, (_, index) => ({
    key: `k${index}`,
    layer: index % 10,
  }));
  for (const { key } of entries) {
    const front = bringToFront(entries, key);
    const back = sendToBack(entries, key);
    for (const map of [front, back]) {
      for (const value of map.values()) assert.ok(value >= 0 && value <= MAX_LAYER);
      assert.equal(map.size, entries.length);
    }
    const others = entries.filter((entry) => entry.key !== key).map((entry) => entry.key);
    assert.ok(others.every((other) => front.get(key) > front.get(other)));
    assert.ok(others.every((other) => back.get(key) < back.get(other)));
    assert.equal(renderOrder(entries, front).at(-1), key);
    assert.equal(renderOrder(entries, back)[0], key);
  }
});

test('compressing keeps the relative order of the other furniture when levels fit', () => {
  const entries = [
    { key: 'a', layer: 0 },
    { key: 'b', layer: 4 },
    { key: 'c', layer: 9 },
    { key: 'd', layer: 7 },
  ];
  const before = renderOrder(entries, new Map(entries.map((e) => [e.key, e.layer])));
  const front = bringToFront(entries, 'a');
  assert.deepEqual(renderOrder(entries, front), [...before.filter((key) => key !== 'a'), 'a']);
  const back = sendToBack(entries, 'c');
  assert.deepEqual(renderOrder(entries, back), ['c', ...before.filter((key) => key !== 'c')]);
});

test('out-of-range stored layers are brought back into 0..9 by layer operations', () => {
  const entries = [
    { key: 'a', layer: 12 },
    { key: 'b', layer: 3 },
  ];
  for (const map of [bringToFront(entries, 'b'), sendToBack(entries, 'b')])
    for (const value of map.values()) assert.ok(value >= 0 && value <= MAX_LAYER);
});
