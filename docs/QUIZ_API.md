# 퀴즈 API

개발자 도구는 로그인 없이 테스트용 경로를 사용한다. 테스트 채점은 DB 문제를 읽고 결과·해설만 반환하며 사용자와 풀이 기록을 만들지 않는다.

## 로그인 없는 퀴즈 테스트

| 메서드·경로 | 결과 |
|---|---|
| `GET /api/dev/quizzes?lessonId=...` | 학습별 문제 목록. 정답과 해설을 포함하지 않는다. |
| `GET /api/dev/quizzes/{quizId}` | 문제 하나를 조회한다. |
| `POST /api/dev/quizzes/{quizId}/check` | 답안을 검증·채점하고 결과와 해설을 반환한다. 정답·오답 모두 200이다. |

`QUIZ_PREVIEW_ENABLED`의 기본값은 `true`다. 현재 개발환경의 DB 스키마인 `chorong_dev`에서만 테스트 API를 연다. Hibernate 기본 스키마가 `chorong_prod` 등 다른 값이면 설정이 true여도 차단한다. 개발환경에서 끄려면 `QUIZ_PREVIEW_ENABLED=false`로 지정한다. 비활성 상태의 테스트 요청은 404와 `QUIZ_PREVIEW_DISABLED`를 반환하고 API 문서에서도 테스트 경로를 숨긴다.

개발·운영 서버는 같은 실행 프로필을 사용하므로 프로필 이름을 기준으로 열지 않는다. 기존 `DB_SCHEMA`가 Hibernate 기본 스키마에 반영되며, 개발환경 `chorong_dev`와 운영환경 `chorong_prod`를 구분한다.

테스트 요청은 아래 제출 예제와 같은 `{ "response": { ... } }` 구조다. 응답에는 제출 기록 ID가 없다.

```json
{
  "graded": true,
  "correct": true,
  "completed": true,
  "explanation": "르네상스는 이탈리아에서 시작되었다."
}
```

## 인증된 사용자별 풀이 기록

아래 기존 경로는 `Authorization: Bearer <accessToken>`이 필요하다. 제출자는 토큰의 사용자 ID로 결정한다. 테스트 API의 활성 여부가 이 경로의 인증 조건을 바꾸지 않는다.

| 메서드·경로 | 결과 |
|---|---|
| `GET /api/quizzes?lessonId=...` | 학습별 퀴즈 목록. `quizOrder`, `quizId` 순으로 정렬하며 없으면 빈 배열을 반환한다. |
| `GET /api/quizzes/{quizId}` | 퀴즈 하나를 조회한다. |
| `POST /api/quizzes/{quizId}/attempts` | 답안을 검증·채점하고 제출 기록을 생성한다. |

학습·퀴즈 ID는 양의 정수다. 조회 결과의 필드는 `quizId`, `lessonId`, `question`, `instruction`, `interactionType`, `config`, `difficulty`, `quizOrder`다. `difficulty`는 최대 30자의 문자열이며 고정된 값 목록은 없다.

조회 응답에 `answer`와 `explanation`을 포함하지 않는다. `FLIP_CARD`의 카드 내용은 config에 포함하지만 정답 짝은 포함하지 않는다. 저장된 설정이나 정답이 잘못되어 사용할 수 없는 퀴즈는 409를 반환한다. 목록에 해당 문제가 포함되면 목록 요청도 409를 반환한다.

## 개발자 도구에서 실행하기

기존 앱의 더보기 → 개발자 도구에서 DB에 등록된 학습 ID를 입력하고 `퀴즈 조회`를 누른다. 로그인 없이 문제를 선택해 답안을 조작하고 `채점하기`를 누르면 결과와 해설을 표시한다. FLIP_CARD는 모든 카드를 가린 상태에서 시작한다. 두 장을 선택하면 서버에 누적된 짝을 자동 확인한다. 맞는 짝은 열린 상태로 유지하며, 오답은 0.9초 후 다시 가린다. 모든 짝을 맞추면 완료 결과와 해설을 표시한다. 확인 중에는 다른 카드를 뒤집을 수 없다. 통신 실패 시 맞춘 짝을 보존하고 다시 선택할 수 있다. `다시 시작`은 진행 상태를 초기화한다. 문제 변경·목록 재조회 시 답안과 결과를 초기화한다. 테스트 답안과 완료 상태는 저장하지 않는다.

앱은 `EXPO_PUBLIC_API_URL`로 지정된 API를 사용한다. 테스트 요청에 인증 토큰을 붙이지 않고 로그인·토큰 갱신 API도 호출하지 않는다. 앱의 학습 ID 입력 범위는 JavaScript가 정수로 정확히 표현하는 1~9007199254740991이다. DB와 API의 ID 타입은 BIGINT/Long이다.

슬라이더·스와이프·배치·정렬은 마우스와 터치로 조작한다. 슬라이더 증감, 좌우 선택, 카드 선택 후 배치, 위·아래 이동 버튼도 사용할 수 있다. 이미지는 HTTP(S) URL을 사용하며 상대 경로는 API 주소를 기준으로 해석한다. 이미지 파일이 없으면 로딩 실패를 표시한다.

## 저장 구조

`V7__quiz.sql`이 `quiz_item`과 `quiz_attempt`를 추가한다. `quiz_item.lesson_id`는 양의 BIGINT이며 현재 학습 테이블이 없어 외래 키를 두지 않는다. `quiz_attempt`는 문제와 사용자 테이블을 외래 키로 참조한다. 문제의 `config`·`answer`와 제출 `response`는 JSONB로 저장한다. `V8__flip_card_pairs.sql`은 FLIP_CARD의 정답 객체를 허용한다. 마이그레이션은 예제 문제를 추가하거나 기존 문제 내용을 바꾸지 않는다.

## 사용자별 답안 제출

```json
{
  "response": {
    "selectedOptionIds": ["italy"]
  }
}
```

서버는 DB의 정답으로 채점한다. 사용자 ID·정답 여부를 클라이언트 입력으로 결정하지 않는다. 정상 제출은 정답·오답 모두 201을 반환하고 검증한 `response`의 필드·값을 JSONB에 저장하고 사용자 ID, 퀴즈 ID, 채점 결과, 제출 시각을 함께 기록한다. 형식 오류·데이터 오류는 제출 기록을 만들지 않는다.

```json
{
  "attemptId": 1,
  "graded": true,
  "correct": true,
  "completed": true,
  "explanation": "르네상스는 이탈리아에서 시작되었다."
}
```

채점형 문제의 `completed=true`는 유효한 답안을 제출했다는 뜻이다. 정답 여부는 `correct`로 확인한다. `FLIP_CARD`는 `graded=true`이며 제출한 짝이 전부 맞으면 `correct=true`다. 일부 짝만 맞춘 상태는 `completed=false`다. 모든 카드가 올바르게 짝지어져야 `completed=true`가 된다. 미완료 상태의 해설은 빈 문자열이다.

## 유형별 객체 계약

조회 `config`는 interactionType에 해당하는 설정 객체다. 사용자 `response`는 URL의 quizId로 조회한 DB 문제 유형에 맞는 답안 객체다. 요청에 interactionType을 추가할 필요가 없다. OpenAPI는 config와 response에 각각 8가지 구체 구조를 표시한다. FLIP_CARD는 `front`·`back`·`flipped`에서 `cards`·`pairs` 구조로 변경한다. 나머지 유형의 JSON 필드와 계층은 유지한다.

| 유형 | config 필수 필드 | config 선택 필드 | response 필수 필드 |
|---|---|---|---|
| SLIDER | min·max·step: 숫자 | initialValue: 숫자, unit: 문자열, showValue: Boolean | value: 숫자 |
| SWIPE | left·right: 선택지 객체 | 없음 | value: 문자열 |
| TAP | selectionType: SINGLE/MULTIPLE, items: 항목 배열 | maxSelections: 정수 | selectedItemIds: 문자열 배열 |
| MULTIPLE_CHOICE | selectionType: SINGLE/MULTIPLE, options: 항목 배열 | maxSelections: 정수 | selectedOptionIds: 문자열 배열 |
| DRAG_DROP | items·targets: 항목 배열 | 없음 | placements: 항목 ID → 영역 ID 객체 |
| SORT | items: 항목 배열 | 없음 | order: 문자열 배열 |
| MATCHING | leftItems·rightItems: 항목 배열 | 없음 | matches: 왼쪽 ID → 오른쪽 ID 객체 |
| FLIP_CARD | cards: 카드 항목 배열 | 없음 | pairs: 카드 짝 객체 배열 |

모든 config는 공통 선택 옵션 shuffle·allowRetry·showHint도 받는다. 선택 필드는 생략할 수 있지만 명시적 null은 허용하지 않는다. 조회 시 생략된 필드를 null이나 기본값으로 추가하지 않는다. 지정한 false·빈 단위 문자열은 그대로 반환한다.

항목은 필수 id와 선택 text·imageUrl로 구성하며, text·imageUrl 중 하나 이상이 필요하다. 스와이프 선택지는 value·label이 모두 필요하다. 카드 짝 객체는 firstCardId·secondCardId 문자열이 모두 필요하다. 지정한 표시 문자열과 ID는 공백만 있을 수 없으며 앞뒤 공백을 자동 제거하지 않는다. SLIDER의 unit은 빈 문자열·공백 문자열도 허용한다.

config·answer·response 및 하위 객체에는 정해진 필드만 허용한다. placements·matches의 키는 문제에 정의된 ID다. 요청 바깥의 userId·isCorrect 같은 추가 값은 무시하고, response 내부의 추가 값은 거절한다. 숫자 문자열·숫자형 Boolean 등 타입 자동 변환을 하지 않는다.

### 서버가 보관하는 정답

아래 구조는 DB의 answer다. 조회 응답에는 포함하지 않는다.

| 유형 | answer 구조 |
|---|---|
| SLIDER | `{ "value": 1760 }` 또는 `{ "min": 1750, "max": 1780 }`. 두 형태를 섞지 않는다. |
| SWIPE | `{ "correctValue": "TRUE" }` |
| TAP | `{ "correctItemIds": ["humanism", "perspective"] }` |
| MULTIPLE_CHOICE | `{ "correctOptionIds": ["italy"] }` |
| DRAG_DROP | `{ "placements": { "newton": "modern" } }` |
| SORT | `{ "correctOrder": ["renaissance", "industrial"] }` |
| MATCHING | `{ "matches": { "newton": "gravity" } }` |
| FLIP_CARD | `{ "pairs": [{ "firstCardId": "c1", "secondCardId": "c5" }] }` |

ID는 예시다. 정답·답안에는 실제 config의 ID와 선택 개수·전체 배치 규칙을 적용한다. 서버는 소수를 BigDecimal로 비교·저장한다. `0.3`과 `0.30`은 같은 값이다. 앱은 JavaScript number를 사용하므로 표시할 수 있는 간격·정밀도를 별도로 확인한다.

## 유형별 response

| 유형 | JSON 예시 | 검증·채점 |
|---|---|---|
| SLIDER | `{ "value": 1760 }` | 숫자만 받는다. config의 최소·최대값과 step을 지켜야 한다. 정확한 정답 또는 양 끝을 포함한 정답 범위로 채점한다. |
| SWIPE | `{ "value": "TRUE" }` | 좌·우에 정의된 문자열 값만 받으며 correctValue와 비교한다. |
| TAP | `{ "selectedItemIds": ["humanism", "perspective"] }` | SINGLE은 하나, MULTIPLE은 하나 이상을 선택한다. 정답 ID 집합과 비교한다. |
| DRAG_DROP | `{ "placements": { "newton": "modern" } }` | 모든 item의 배치가 필요하다. target ID를 검증한 뒤 전체 배치를 비교한다. 여러 item을 같은 target에 배치할 수 있다. |
| SORT | `{ "order": ["renaissance", "industrial"] }` | 모든 item이 한 번씩 들어가야 한다. 순서까지 비교한다. |
| MATCHING | `{ "matches": { "newton": "gravity" } }` | 왼쪽·오른쪽 항목을 빠짐없이 1:1로 연결해야 한다. 전체 연결을 비교한다. |
| FLIP_CARD | `{ "pairs": [{ "firstCardId": "c1", "secondCardId": "c5" }] }` | 한 쌍 이상을 제출한다. 같은 카드의 중복 사용·모르는 ID는 400이다. 짝 안의 순서와 짝 배열의 순서는 무관하다. 모든 짝이 맞으면 완료다. |
| MULTIPLE_CHOICE | `{ "selectedOptionIds": ["italy"] }` | SINGLE/MULTIPLE 규칙을 적용하고 correctOptionIds 집합과 비교한다. |

표의 ID는 예시다. 실제 문제의 config에 있는 ID를 사용한다. 누락·중복·모르는 ID와 잘못된 타입은 400이다. 중복 JSON 필드도 거절하며 제출한 소수 값은 반올림 없이 판정한다. 인증된 제출 API는 원본 소수 값도 저장한다. response 객체에 유형과 무관한 필드를 추가해도 400이다. 이미지 TAP도 동일한 TAP 규칙을 사용한다.

## config와 선택 옵션

config와 answer는 JSON 객체로 저장한다. 새 FLIP_CARD의 cards는 2개 이상의 짝수 개 카드이며, answer.pairs는 각 카드를 정확히 한 번씩 포함해야 한다. 기존 FLIP_CARD의 `front`·`back`과 SQL NULL 답안은 읽기 호환 대상으로 남긴다. 새 서버는 기존 앞·뒷면을 카드 두 장과 정답 한 쌍으로 변환해 응답하며 저장된 값을 수정하지 않는다. 서버는 항목 ID의 유일성, 정답 참조, 선택 규칙, 슬라이더 범위·step과 정답의 도달 가능성을 확인한다. 설정 오류를 사용자 오답으로 처리하지 않는다.

| 옵션 | 처리 |
|---|---|
| `shuffle` | Boolean. 표시 순서를 위한 설정이며 채점은 ID를 기준으로 한다. SORT는 response.order의 순서를 비교한다. |
| `maxSelections` | TAP·MULTIPLE_CHOICE에서 1~2147483647의 JSON 정수로 지정한다. `1.0`과 문자열 숫자는 거절한다. SINGLE은 1만 허용한다. 서버가 최대 선택 수를 검사한다. 정답 개수가 한도를 넘는 설정은 오류다. |
| `allowRetry` | 생략하거나 true로 지정한다. 인증된 제출 API는 반복 제출마다 별도 기록을 만든다. 테스트 채점은 기록을 만들지 않는다. false에 해당하는 재시도 제한은 지원하지 않으므로 409로 처리한다. |
| `showHint` | 생략하거나 false로 지정한다. 힌트 데이터·기능이 없어 true는 409로 처리한다. |

## 유형별 config 예제

아래 config는 해당 유형의 화면을 구성한다. `items`·`options`·`targets`·`leftItems`·`rightItems`·`cards`의 각 항목은 고유한 `id`와 `text` 또는 `imageUrl`을 가진다. FLIP_CARD의 정답 짝은 config에 넣지 않는다.

TAP·MULTIPLE_CHOICE의 `selectionType`은 `SINGLE` 또는 `MULTIPLE`이다. `maxSelections`를 생략하면 SINGLE은 1개, MULTIPLE은 전체 항목 수까지 선택한다. SLIDER는 `min < max`, `step > 0`이어야 한다. 슬라이더는 `min`에서 시작해 `step` 간격으로 선택하며 `initialValue`를 생략하면 `min`을 사용한다. `max`가 간격에 맞지 않으면 그보다 작은 마지막 간격 값까지 선택할 수 있다.

### SLIDER

```json
{
  "min": 1700,
  "max": 1900,
  "step": 10,
  "initialValue": 1800,
  "unit": "년",
  "showValue": true
}
```

### SWIPE

```json
{
  "left": {
    "value": "FALSE",
    "label": "아니다"
  },
  "right": {
    "value": "TRUE",
    "label": "맞다"
  }
}
```

### TAP

```json
{
  "selectionType": "MULTIPLE",
  "items": [
    {
      "id": "humanism",
      "text": "인간 중심"
    },
    {
      "id": "perspective",
      "text": "원근법"
    },
    {
      "id": "abstract",
      "text": "추상 미술"
    },
    {
      "id": "realism",
      "text": "사실적 묘사"
    }
  ]
}
```

### DRAG_DROP

```json
{
  "items": [
    {
      "id": "newton",
      "text": "뉴턴"
    },
    {
      "id": "einstein",
      "text": "아인슈타인"
    },
    {
      "id": "aristotle",
      "text": "아리스토텔레스"
    }
  ],
  "targets": [
    {
      "id": "ancient",
      "text": "고대"
    },
    {
      "id": "modern",
      "text": "근대"
    },
    {
      "id": "contemporary",
      "text": "현대"
    }
  ]
}
```

### SORT

```json
{
  "items": [
    {
      "id": "renaissance",
      "text": "르네상스"
    },
    {
      "id": "industrial",
      "text": "산업혁명"
    },
    {
      "id": "french_revolution",
      "text": "프랑스 혁명"
    }
  ]
}
```

### MATCHING

```json
{
  "leftItems": [
    {
      "id": "newton",
      "text": "뉴턴"
    },
    {
      "id": "einstein",
      "text": "아인슈타인"
    },
    {
      "id": "darwin",
      "text": "다윈"
    }
  ],
  "rightItems": [
    {
      "id": "gravity",
      "text": "만유인력"
    },
    {
      "id": "relativity",
      "text": "상대성 이론"
    },
    {
      "id": "evolution",
      "text": "진화론"
    }
  ]
}
```

### FLIP_CARD

```json
{
  "cards": [
    {
      "id": "c1",
      "text": "뉴턴"
    },
    {
      "id": "c2",
      "text": "진화론"
    },
    {
      "id": "c3",
      "text": "상대성이론"
    },
    {
      "id": "c4",
      "text": "다윈"
    },
    {
      "id": "c5",
      "text": "만유인력"
    },
    {
      "id": "c6",
      "text": "아인슈타인"
    }
  ],
  "shuffle": true
}
```

카드 내용을 가리는 동작은 UI에서 처리한다. 정답 짝은 서버의 answer에만 저장한다. 두 장을 고를 때마다 이미 맞춘 짝과 새 짝을 함께 제출하므로 서버가 완료 여부를 다시 계산한다.

### MULTIPLE_CHOICE

```json
{
  "selectionType": "SINGLE",
  "options": [
    {
      "id": "italy",
      "text": "이탈리아"
    },
    {
      "id": "france",
      "text": "프랑스"
    },
    {
      "id": "england",
      "text": "영국"
    },
    {
      "id": "germany",
      "text": "독일"
    }
  ],
  "shuffle": true
}
```

예제의 `/images/monalisa.jpg`는 실제 이미지 파일을 가리키도록 바꿔야 한다. 이미지 TAP과 복수 객관식을 포함한 저장용 예제의 config·answer·response는 [테스트 데이터](../backend/core/src/test/resources/quiz/quiz-items.json)를 참고한다. 정답 예제는 테스트 데이터이며 조회 API에 정답 필드를 추가하지 않는다.

SLIDER의 범위 정답은 설정 범위 안에 있고 선택 가능한 값이 하나 이상 있어야 한다. 범위 끝점 자체가 step에 맞을 필요는 없다. step이 전체 범위보다 크면 min 하나만 선택할 수 있다. MULTIPLE의 maxSelections는 항목 수보다 커도 되지만 실제 항목 ID를 중복 선택할 수는 없다.

## 오류

| 상태 | 코드·원인 |
|---|---|
| 400 | `BAD_REQUEST`: JSON 문법·중복 키·response 필드 누락·필수 파라미터 누락·ID 타입 불일치·Long 범위 초과. |
| 400 | `INVALID_QUIZ_REQUEST`: 숫자로 받은 ID가 0 이하임. |
| 400 | `INVALID_QUIZ_RESPONSE`: response 객체의 구조·타입·ID·선택 수·범위 오류. |
| 401 | `UNAUTHORIZED`: 유효한 인증이 없음. 제출 시 탈퇴한 사용자는 `USER_WITHDRAWN`이다. |
| 404 | `QUIZ_PREVIEW_DISABLED`: 해당 환경에서 테스트 API가 비활성화됨. |
| 404 | `QUIZ_NOT_FOUND`: 요청한 퀴즈가 없음. |
| 409 | `QUIZ_DATA_INVALID`: config·answer가 잘못되었거나 지원하지 않는 활성 옵션이 있음. 정답 데이터는 오류 응답에 넣지 않는다. |

## 카드 짝 맞추기 배포 순서

백엔드의 V8 마이그레이션과 새 앱을 배포한 뒤 FLIP_CARD 샘플을 새 형식으로 교체한다. 기존 서버는 새 cards·pairs 형식을 지원하지 않는다. 기존 데이터는 새 서버에서도 읽을 수 있으므로 샘플 교체 전 조회를 유지한다. 이전 앱의 flipped 답안은 새 서버에서 400으로 거절한다. 배포 후 앱을 새로고침한다.
