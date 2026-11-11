# OpenAPI 0.3.0 계약 점검

기준은 [`openapi.yaml`](openapi.yaml)이다. 이 문서는 앱과 백엔드에서 계약을 바꿀 때 확인할 차이를 기록한다.

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

| 항목 | 현재 상태와 남은 작업 |
|---|---|
| 런타임 명세 | `docs/openapi.yaml`과 동일한 파일을 사용한다. 계약 테스트가 파일 일치 여부를 확인한다. |
| 백엔드 학습·그림·퀴즈 | 레슨 구간, 퀴즈 상호작용, 결과 요약과 그림 목록을 구현했다. API별 전체 계약 검증은 계속한다. |
| 백엔드 상점·배치 | 수량 구매와 개별 배치를 구현했다. 배치는 `flippedX`를 사용한다. 고양이 인벤토리와 아바타 배치 참조의 직접 검증이 남았다. |
| 기존 좌표 데이터 | V36은 9보다 큰 레이어와 회전을 허용했다. 기존 값은 DB에 보존되지만 0.3.0은 레이어 0~9와 좌우 반전만 정의한다. 기존 값을 변환할 정책이 필요하다. |
| 학습 알림 | 대상자 조회만 구현했다. 공급자가 미정이므로 예약 발송, 중복 방지, 실패 재시도는 구현하지 않았다. |
| 앱 연동 | 앱 모델과 화면에 `wallet.star`와 배치 `rotation`이 남아 있다. 앱을 0.3.0 계약에 맞춰야 한다. |
| 기본 가구 이미지 | 고양이·책상·의자 데이터만 등록했다. 이미지 연결은 남았다. |

현재 서버와 앱의 모든 응답이 명세에 일치한다는 뜻은 아니다.

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
