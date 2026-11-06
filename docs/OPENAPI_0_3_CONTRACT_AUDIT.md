# OpenAPI 0.3.0 계약 점검

기준은 [`openapi2.yaml`](openapi2.yaml)이다. 이 문서는 앱과 백엔드에서 계약을 바꿀 때 확인할 차이를 기록한다.

## 점검 결과

| 항목 | 결과 |
|---|---|
| 경로·메서드·`operationId` | 47개 작업. ID 중복 없음. 앱 API 목록과 47개 모두 일치 |
| YAML과 `$ref` | 파싱 오류와 끊어진 참조 없음 |
| 경로 변수 | 모든 `{...}`에 필수 경로 매개변수 선언 있음 |
| 요청 필수 필드 | `required`에 지정된 이름이 해당 요청 스키마에 존재 |
| 성공 응답 | JSON 본문이 있는 200 응답은 `data`로 감쌈. 204 응답은 본문 없음 |
| 커서 목록 | API-801·808·905·908에 `meta.nextCursor` 있음 |
| 오류 응답 | 선언된 4xx는 `error` 본문 사용. 구매 오류는 `error.items[]` 추가 |

`required`로 선언되지 않은 필드는 선택 사항으로 취급한다. 예를 들어 `Wallet.stardust`는 스키마에 있으나 `required`에는 없다. 앱에서 필수값으로 취급할 필드가 더 필요하면 0.3.0 명세를 먼저 수정해야 한다.

## 구현 차이

| 차이 | 후속 작업 |
|---|---|
| 백엔드에 `GET /users/me/artworks`가 없음 | 08 |
| 레슨 `segments`, 퀴즈 `interactionType/config`, 결과 `quizSummary`가 기존 응답과 다름 | 04~08 |
| 앱의 기존 목 데이터와 모델에 `wallet.star`, 배치 `rotation`, 상점 옵션 `owned`가 남아 있음 | 09·12·13과 앱 연동 |
| 기존 구매 요청은 옵션별 `quantity`를 보내지 않음 | 11과 앱 연동 |
| 별가루만 쓰는 지갑·보상·상점 응답은 아직 백엔드와 앱에 적용되지 않음 | 09 |

위 차이는 0.3.0 구현 작업에 속한다. 현재 서버 응답이 이 명세를 모두 만족한다는 뜻은 아니다.

## 앱 요청·응답 예시

아래 예시는 0.3.0 형식이다. 시간은 UTC이며 `/api/v1` 아래 경로를 사용한다.

```http
GET /api/v1/courses?category=SCIENCE&topic=%EC%9A%B0%EC%A3%BC
Authorization: Bearer <accessToken>
```

```json
{
  "data": {
    "courses": [
      {
        "courseId": 1,
        "title": "우주",
        "category": "SCIENCE",
        "topic": "우주",
        "totalLessons": 3,
        "completedLessons": 1,
        "constellation": null
      }
    ]
  }
}
```

```http
POST /api/v1/shop/purchases
Authorization: Bearer <accessToken>
Idempotency-Key: 12345678-1234-4234-8234-123456789abc
Content-Type: application/json

{"items":[{"itemId":1,"optionId":11,"quantity":2}]}
```

```json
{
  "data": {
    "inventoryItems": [
      {
        "itemId": 1,
        "optionId": 11,
        "itemType": "FURNITURE",
        "name": "의자",
        "option": {"color": "blue", "shape": "round", "assetKey": "chair-blue"},
        "ownedCount": 2,
        "placedCount": 0,
        "availableCount": 2,
        "copies": [
          {"inventoryId": "copy-1", "acquiredVia": "PURCHASE", "acquiredAt": "2026-11-06T00:00:00Z", "placed": false},
          {"inventoryId": "copy-2", "acquiredVia": "PURCHASE", "acquiredAt": "2026-11-06T00:00:00Z", "placed": false}
        ]
      }
    ],
    "wallet": {"stardust": 80}
  }
}
```

```http
GET /api/v1/users/me/artworks?size=20
Authorization: Bearer <accessToken>
```

```json
{
  "data": {
    "artworks": [
      {"artworkId": 1, "lessonId": 10, "imageUrl": "https://example.com/moon.png", "completedAt": "2026-11-06T00:00:00Z"}
    ]
  },
  "meta": {"nextCursor": null}
}
```

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "별가루가 부족합니다.",
    "items": [{"itemId": 1, "optionId": 11, "code": "INSUFFICIENT_BALANCE"}]
  }
}
```
