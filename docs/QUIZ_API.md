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

조회 응답에 `answer`와 `explanation`을 포함하지 않는다. `FLIP_CARD`의 `config.back`은 공개 학습 내용이다. 저장된 설정이나 정답이 잘못되어 사용할 수 없는 퀴즈는 409를 반환한다. 목록에 해당 문제가 포함되면 목록 요청도 409를 반환한다.

## 개발자 도구에서 실행하기

기존 앱의 더보기 → 개발자 도구에서 DB에 등록된 학습 ID를 입력하고 `퀴즈 조회`를 누른다. 로그인 없이 문제를 선택해 답안을 조작하고 `채점하기`를 누르면 결과와 해설을 표시한다. FLIP_CARD는 `학습 완료 확인`을 누른다. 문제 변경·목록 재조회 시 답안과 결과를 초기화한다. 테스트 답안과 완료 상태는 저장하지 않는다.

앱은 `EXPO_PUBLIC_API_URL`로 지정된 API를 사용한다. 테스트 요청에 인증 토큰을 붙이지 않고 로그인·토큰 갱신 API도 호출하지 않는다. 앱의 학습 ID 입력 범위는 JavaScript가 정수로 정확히 표현하는 1~9007199254740991이다. DB와 API의 ID 타입은 BIGINT/Long이다.

슬라이더·스와이프·배치·정렬은 마우스와 터치로 조작한다. 슬라이더 증감, 좌우 선택, 카드 선택 후 배치, 위·아래 이동 버튼도 사용할 수 있다. 이미지는 HTTP(S) URL을 사용하며 상대 경로는 API 주소를 기준으로 해석한다. 이미지 파일이 없으면 로딩 실패를 표시한다.

## 저장 구조

`V7__quiz.sql`이 `quiz_item`과 `quiz_attempt`를 추가한다. `quiz_item.lesson_id`는 양의 BIGINT이며 현재 학습 테이블이 없어 외래 키를 두지 않는다. `quiz_attempt`는 문제와 사용자 테이블을 외래 키로 참조한다. 문제의 `config`·`answer`와 제출 `response`는 JSONB로 저장한다. 이 마이그레이션은 예제 문제를 추가하지 않는다.

## 사용자별 답안 제출

```json
{
  "response": {
    "selectedOptionIds": ["italy"]
  }
}
```

서버는 DB의 정답으로 채점한다. 사용자 ID·정답 여부를 클라이언트 입력으로 결정하지 않는다. 정상 제출은 정답·오답 모두 201을 반환하고 원본 `response` JSON, 사용자 ID, 퀴즈 ID, 채점 결과, 제출 시각을 저장한다. 형식 오류·데이터 오류는 제출 기록을 만들지 않는다.

```json
{
  "attemptId": 1,
  "graded": true,
  "correct": true,
  "completed": true,
  "explanation": "르네상스는 이탈리아에서 시작되었다."
}
```

채점형 문제의 `completed=true`는 유효한 답안을 제출했다는 뜻이다. 정답 여부는 `correct`로 확인한다. `FLIP_CARD`는 `graded=false`, `correct=null`이며 `completed`에 제출한 `flipped` 값을 넣는다.

## 유형별 response

| 유형 | JSON 예시 | 검증·채점 |
|---|---|---|
| SLIDER | `{ "value": 1760 }` | 숫자만 받는다. config의 최소·최대값과 step을 지켜야 한다. 정확한 정답 또는 양 끝을 포함한 정답 범위로 채점한다. |
| SWIPE | `{ "value": "TRUE" }` | 좌·우에 정의된 문자열 값만 받으며 correctValue와 비교한다. |
| TAP | `{ "selectedItemIds": ["humanism", "perspective"] }` | SINGLE은 하나, MULTIPLE은 하나 이상을 선택한다. 정답 ID 집합과 비교한다. |
| DRAG_DROP | `{ "placements": { "newton": "modern" } }` | 모든 item의 배치가 필요하다. target ID를 검증한 뒤 전체 배치를 비교한다. 여러 item을 같은 target에 배치할 수 있다. |
| SORT | `{ "order": ["renaissance", "industrial"] }` | 모든 item이 한 번씩 들어가야 한다. 순서까지 비교한다. |
| MATCHING | `{ "matches": { "newton": "gravity" } }` | 왼쪽·오른쪽 항목을 빠짐없이 1:1로 연결해야 한다. 전체 연결을 비교한다. |
| FLIP_CARD | `{ "flipped": true }` | Boolean만 받는다. 정오답 없이 뒤집기 완료 여부를 반환한다. |
| MULTIPLE_CHOICE | `{ "selectedOptionIds": ["italy"] }` | SINGLE/MULTIPLE 규칙을 적용하고 correctOptionIds 집합과 비교한다. |

표의 ID는 예시다. 실제 문제의 config에 있는 ID를 사용한다. 누락·중복·모르는 ID와 잘못된 타입은 400이다. 중복 JSON 필드도 거절하며 제출한 소수 값은 반올림 없이 판정한다. 인증된 제출 API는 원본 소수 값도 저장한다. response 객체에 유형과 무관한 필드를 추가해도 400이다. 이미지 TAP도 동일한 TAP 규칙을 사용한다.

## config와 선택 옵션

config와 answer는 JSON 객체로 저장한다. FLIP_CARD만 answer가 SQL NULL이다. 서버는 항목 ID의 유일성, 정답 참조, 선택 규칙, 슬라이더 범위·step과 정답의 도달 가능성을 확인한다. 설정 오류를 사용자 오답으로 처리하지 않는다.

| 옵션 | 처리 |
|---|---|
| `shuffle` | Boolean. 표시 순서를 위한 설정이며 채점은 ID를 기준으로 한다. SORT는 response.order의 순서를 비교한다. |
| `maxSelections` | TAP·MULTIPLE_CHOICE에서 양의 정수로 지정한다. SINGLE은 1만 허용한다. 서버가 최대 선택 수를 검사한다. 정답 개수가 한도를 넘는 설정은 오류다. |
| `allowRetry` | 생략하거나 true로 지정한다. 인증된 제출 API는 반복 제출마다 별도 기록을 만든다. 테스트 채점은 기록을 만들지 않는다. false에 해당하는 재시도 제한은 지원하지 않으므로 409로 처리한다. |
| `showHint` | 생략하거나 false로 지정한다. 힌트 데이터·기능이 없어 true는 409로 처리한다. |

## 유형별 config 예제

아래 config는 해당 유형의 화면을 구성한다. `items`·`options`·`targets`·`leftItems`·`rightItems`의 각 항목은 고유한 `id`와 `text` 또는 `imageUrl`을 가진다. `FLIP_CARD`의 앞·뒷면은 `title`·`text`·`imageUrl` 중 표시할 내용을 가진다.

TAP·MULTIPLE_CHOICE의 `selectionType`은 `SINGLE` 또는 `MULTIPLE`이다. `maxSelections`를 생략하면 SINGLE은 1개, MULTIPLE은 전체 항목 수까지 선택한다. 슬라이더는 `min`에서 시작해 `step` 간격으로 선택하며 `initialValue`를 생략하면 `min`을 사용한다. `max`가 간격에 맞지 않으면 그보다 작은 마지막 간격 값까지 선택할 수 있다.

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
  "front": {
    "text": "누구의 작품일까요?",
    "imageUrl": "/images/monalisa.jpg"
  },
  "back": {
    "title": "레오나르도 다빈치",
    "text": "모나리자는 레오나르도 다빈치의 대표적인 작품입니다."
  }
}
```

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

## 오류

| 상태 | 코드·원인 |
|---|---|
| 400 | `INVALID_QUIZ_REQUEST`: 양수가 아닌 ID. 형식 오류·누락된 ID도 400이다. |
| 400 | `INVALID_QUIZ_RESPONSE`: 답안 구조·타입·ID·선택 수·범위 오류. JSON 문법이나 요청 본문 형식 오류도 400이다. |
| 401 | `UNAUTHORIZED`: 유효한 인증이 없음. 제출 시 탈퇴한 사용자는 `USER_WITHDRAWN`이다. |
| 404 | `QUIZ_PREVIEW_DISABLED`: 해당 환경에서 테스트 API가 비활성화됨. |
| 404 | `QUIZ_NOT_FOUND`: 요청한 퀴즈가 없음. |
| 409 | `QUIZ_DATA_INVALID`: config·answer가 잘못되었거나 지원하지 않는 활성 옵션이 있음. 정답 데이터는 오류 응답에 넣지 않는다. |
