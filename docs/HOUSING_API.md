# 하우징 API

아이소메트릭 방을 꾸미는 기능. 서버는 **ID 와 규칙**만 저장하고, 좌표·이미지는 앱 에셋 번들이 갖는다.

## 역할 분담

| 정보 | 위치 |
|---|---|
| 배경·벽·바닥·가구·방·아바타 목록, 슬롯 ID, 배치 규칙 | 서버 카탈로그 |
| 보유 에셋, 재화, 방별 배치 | 서버 (유저별) |
| 상점 상품·가격 | 서버 |
| 슬롯 좌표, zIndex, 이미지, 면 방향 | 앱 `mobile/src/housing/assets.ts` |

ID 가 유일한 연결고리다. 앱이 모르는 ID 는 무시하고 로그를 남긴다. 새 에셋은 **서버 카탈로그 → 앱 릴리즈** 순서로 올린다.

## 용어

- **방(room)**: 벽·바닥 면(surface)과 가구 슬롯(slot)을 가진 배경 골격.
- **면(surface)**: 스킨을 입히는 영역. 아이소메트릭 기본은 `wall_left`, `wall_right`, `floor` 3면.
- **슬롯(slot)**: 가구를 놓는 고정 자리. 그리드 아님.
- **카테고리(category)**: 가구 종류. 슬롯의 `allowedCategories` 와 매칭한다.

## 엔드포인트

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/housing/catalog` | 전체 카탈로그. `version` 으로 앱 캐시 |
| GET | `/api/housing/me` | 보유 에셋, 재화, 방별 배치 |
| PUT | `/api/housing/me/rooms/{roomId}/layout` | 해당 방 배치 저장 (전체 교체) |
| PUT | `/api/housing/me/active-room` | 현재 보여줄 방 선택 |
| GET | `/api/housing/shop` | 상점 상품 목록 |
| POST | `/api/housing/shop/purchase` | 구매 |

## GET /api/housing/catalog

```json
{
  "version": 12,
  "backgrounds": [
    { "id": "bg_forest", "name": "숲" }
  ],
  "walls": [
    { "id": "wall_brick", "name": "벽돌" },
    { "id": "wall_paper_blue", "name": "파란 벽지" }
  ],
  "floors": [
    { "id": "floor_wood", "name": "원목" }
  ],
  "avatars": [
    { "id": "av_cat", "name": "고양이" }
  ],
  "furniture": [
    { "id": "fn_chair_wood", "name": "나무 의자", "category": "chair" },
    { "id": "fn_table_round", "name": "둥근 탁자", "category": "table" },
    { "id": "fn_frame_sun", "name": "해 액자", "category": "frame" },
    { "id": "fn_lamp_attic", "name": "다락 램프", "category": "lamp", "compatibleRoomIds": ["room_attic"] }
  ],
  "rooms": [
    {
      "id": "room_basic",
      "name": "기본 방",
      "surfaces": [
        { "id": "wall_left", "kind": "wall" },
        { "id": "wall_right", "kind": "wall" },
        { "id": "floor", "kind": "floor" }
      ],
      "slots": [
        { "id": "s_floor_1", "allowedCategories": ["chair", "table", "lamp"] },
        { "id": "s_floor_2", "allowedCategories": ["chair", "plant"] },
        { "id": "s_wall_l1", "allowedCategories": ["frame", "clock"] },
        { "id": "s_wall_r1", "allowedCategories": ["frame", "shelf"] }
      ]
    }
  ]
}
```

- `compatibleRoomIds` 생략 = 모든 방 허용.
- `kind: wall` 면에는 `walls`, `kind: floor` 면에는 `floors` 스킨만 들어간다.

## GET /api/housing/me

```json
{
  "wallet": { "coin": 1200 },
  "owned": {
    "backgroundIds": ["bg_forest"],
    "wallIds": ["wall_brick"],
    "floorIds": ["floor_wood"],
    "roomIds": ["room_basic", "room_attic"],
    "avatarIds": ["av_cat"],
    "furniture": [
      { "furnitureId": "fn_chair_wood", "category": "chair" },
      { "furnitureId": "fn_frame_sun", "category": "frame" }
    ]
  },
  "activeRoomId": "room_basic",
  "layouts": {
    "room_basic": {
      "backgroundId": "bg_forest",
      "surfaceSkins": {
        "wall_left": "wall_brick",
        "wall_right": "wall_brick",
        "floor": "floor_wood"
      },
      "avatarId": "av_cat",
      "placements": [
        { "slotId": "s_floor_1", "furnitureId": "fn_chair_wood" },
        { "slotId": "s_floor_2", "furnitureId": "fn_chair_wood" },
        { "slotId": "s_wall_l1", "furnitureId": "fn_frame_sun" }
      ],
      "updatedAt": "2026-09-26T09:00:00Z"
    },
    "room_attic": {
      "backgroundId": "bg_forest",
      "surfaceSkins": { "wall_left": "wall_brick", "wall_right": "wall_brick", "floor": "floor_wood" },
      "avatarId": "av_cat",
      "placements": [],
      "updatedAt": "2026-09-26T09:00:00Z"
    }
  }
}
```

- 모든 에셋은 보유 = 무제한 사용. 가구도 같은 종을 여러 슬롯에 놓을 수 있다.
- `owned.furniture` 의 `category` 는 카탈로그 값을 복사한 것. 인벤토리 UI 가 카테고리별로 묶을 때 카탈로그 조회 없이 쓴다.
- `layouts` 는 보유한 방마다 하나. 방을 구매하면 기본 스킨·빈 배치로 생성한다.
- `activeRoomId` 가 홈 화면에 보여줄 방.

## PUT /api/housing/me/rooms/{roomId}/layout

요청은 `layouts[roomId]` 에서 `updatedAt` 제외. 응답은 저장된 layout.

```json
{
  "backgroundId": "bg_forest",
  "surfaceSkins": { "wall_left": "wall_brick", "wall_right": "wall_paper_blue", "floor": "floor_wood" },
  "avatarId": "av_cat",
  "placements": [
    { "slotId": "s_floor_1", "furnitureId": "fn_chair_wood" },
    { "slotId": "s_floor_2", "furnitureId": "fn_chair_wood" }
  ]
}
```

서버 검증:

1. `roomId` 보유 중.
2. `backgroundId`, `avatarId`, 모든 스킨 ID, 모든 `furnitureId` 가 카탈로그에 있고 보유 중.
3. `surfaceSkins` 키가 방의 `surfaces` 와 일치. 면 `kind` 와 스킨 종류 일치.
4. `slotId` 가 방에 존재하고 중복 없음.
5. `furniture.category ∈ slot.allowedCategories`.
6. `furniture.compatibleRoomIds` 가 없거나 `roomId` 포함.

실패 시 400:

```json
{ "code": "SLOT_CATEGORY_MISMATCH", "slotId": "s_floor_1", "furnitureId": "fn_frame_sun" }
```

| code | 의미 |
|---|---|
| `UNKNOWN_ID` | 카탈로그에 없는 ID |
| `NOT_OWNED` | 미보유 에셋 (방 포함) |
| `SURFACE_MISMATCH` | 면 누락·초과 또는 kind 불일치 |
| `SLOT_DUPLICATED` | 같은 슬롯 2회 |
| `SLOT_CATEGORY_MISMATCH` | 카테고리 불일치 |
| `ROOM_INCOMPATIBLE` | `compatibleRoomIds` 위반 |

## PUT /api/housing/me/active-room

```json
{ "roomId": "room_attic" }
```

응답은 `{ "activeRoomId": "room_attic" }`. 미보유 방이면 400 `NOT_OWNED`.

## GET /api/housing/shop

```json
{
  "items": [
    { "id": "shop_fn_chair_wood", "type": "furniture", "targetId": "fn_chair_wood", "price": { "coin": 100 }, "owned": false },
    { "id": "shop_wall_paper_blue", "type": "wall", "targetId": "wall_paper_blue", "price": { "coin": 300 }, "owned": false },
    { "id": "shop_room_attic", "type": "room", "targetId": "room_attic", "price": { "coin": 1000 }, "owned": false },
    { "id": "shop_av_dog", "type": "avatar", "targetId": "av_dog", "price": { "coin": 500 }, "owned": true }
  ]
}
```

- `type`: `background | wall | floor | room | avatar | furniture`. 이름·카테고리는 카탈로그에서 `targetId` 로 찾는다.
- `owned`: 보유 시 `true`. 모든 타입은 1회만 구매한다.
- 기본 지급 에셋은 상점에 없다. 가입 시 `owned` 에 넣는다.

## POST /api/housing/shop/purchase

```json
{ "itemId": "shop_fn_chair_wood" }
```

응답은 갱신된 `wallet` 과 `owned`. 방을 샀으면 `layouts` 에 빈 layout 이 추가되므로 함께 돌려준다.

```json
{
  "wallet": { "coin": 1100 },
  "owned": { "...": "GET /me 와 같은 구조" },
  "layouts": { "...": "GET /me 와 같은 구조" }
}
```

실패 시 400:

| code | 의미 |
|---|---|
| `INSUFFICIENT_COIN` | 재화 부족 |
| `ALREADY_OWNED` | 재구매 |

## 앱 에셋 정의

`mobile/src/housing/assets.ts`. 키는 서버 카탈로그 ID 와 같다.

```ts
export const rooms = {
  room_basic: {
    base: require("./room_basic_base.png"),
    size: { w: 1080, h: 1080 },
    surfaces: {
      wall_left:  { facing: "left",  x: 140, y: 120, w: 400, h: 560, z: 1 },
      wall_right: { facing: "right", x: 540, y: 120, w: 400, h: 560, z: 1 },
      floor:      { x: 140, y: 400, w: 800, h: 480, z: 2 },
    },
    slots: {
      s_floor_1: { surface: "floor",     x: 400, y: 760, z: 12 },
      s_floor_2: { surface: "floor",     x: 700, y: 700, z: 11 },
      s_wall_l1: { surface: "wall_left", x: 330, y: 300, z: 5 },
      s_wall_r1: { surface: "wall_right", x: 740, y: 300, z: 5 },
    },
    avatarSlot: { x: 540, y: 820, z: 13 },
  },
};

export const walls = {
  wall_brick: { left: require("./wall_brick_left.png"), right: require("./wall_brick_right.png") },
};

export const furniture = {
  fn_chair_wood: { images: { default: require("./chair_wood.png") }, w: 120, h: 140, anchor: { x: 0.5, y: 1 } },
  fn_frame_sun:  { images: { left: require("./frame_sun_left.png"), right: require("./frame_sun_right.png") }, w: 120, h: 100, anchor: { x: 0.5, y: 0.5 } },
};
```

- 벽 슬롯 가구는 면 `facing` 에 맞는 이미지를 쓴다. 바닥 가구는 `default` 하나.
- `anchor` 는 이미지 기준점 (0.5, 1 = 하단 중앙). 슬롯 좌표에 기준점을 맞춘다.
- zIndex 는 디자이너가 슬롯마다 고정한다. 아바타가 방 안을 걸어다니게 되면 아바타만 y-sort 로 바꾼다.

렌더 순서: background → room base → surfaces(z) → slots(z) → avatar.

## 미결

- 카탈로그·상점 데이터를 DB 로 관리할지 서버 리소스 JSON 으로 배포할지. 초기엔 JSON + `version` 이 관리가 쉽다.
- 인증이 없는 샘플 서비스라 `me` 의 유저 식별 방식.
