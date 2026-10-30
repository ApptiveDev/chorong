# API 공통 계약

신규 경로는 /api/v1이다. 기존 /api의 요청·응답·상태 코드는 유지한다. 인증 필터와 ApiExceptionHandler가 버전별 오류 형식을 선택한다. /api/v10은 v1 경로가 아니다.

## 응답

단일 결과는 common.api.ApiResponse<T>로 반환한다. 목록은 PagedResponse<T>에 도메인별 data 객체와 PageMeta를 넣는다. 컨트롤러가 타입을 명시하며 전역 응답 래퍼는 사용하지 않는다. 204는 본문을 만들지 않는다.

```json
{
  "data": { "rewards": [] },
  "meta": { "nextCursor": null }
}
```

마지막 페이지도 nextCursor를 null로 포함한다.

## 오류

신규 서비스는 ApiV1Exception을 던진다. ApiErrorCode가 HTTP 상태와 기본 메시지를 결정한다. 필요한 정보는 FieldViolation, retryAfter, unlocksAt으로 명시한다. 정답·요청 원문·내부 details는 넣지 않는다.

```kotlin
throw ApiV1Exception(
    ApiErrorCode.LESSON_LOCKED,
    unlocksAt = nextUnlock,
)
```

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "요청 값이 올바르지 않습니다.",
    "fields": [
      { "field": "size", "reason": "1부터 100까지의 정수를 입력하세요." }
    ]
  }
}
```

| 정보 | 형식 |
|---|---|
| fields | field·reason 객체 배열 |
| retryAfter | 잠금·요청 제한의 남은 초 |
| unlocksAt | UTC ISO 8601 Instant |

사용하지 않는 선택 필드는 생략한다. 기존 ApiException도 v1에서 명세 코드로 매핑한다. 구 경로에서는 기존 code·message·details를 유지한다. 예상하지 못한 예외는 500 INTERNAL로 응답하고 ApiExceptionHandler에서 스택트레이스를 기록한다.

인증 없음·잘못된 Bearer 토큰은 401 UNAUTHORIZED다. 검증기가 보고한 JWT 만료는 v1에서 AUTH_TOKEN_EXPIRED다. 회원 전용 경로의 게스트는 403 MEMBER_ONLY다. 나머지 권한 거절은 403 FORBIDDEN이다. 사용자 상태·기존 JWT 처리 규칙은 AUTH_API.md를 따른다.

## 커서 목록

CursorCodec은 URL-safe Base64로 버전·scope·정렬 타입·정렬값·유일 ID를 인코딩한다. CursorSort.INSTANT와 LONG을 지원한다. 날짜는 Instant로, 숫자는 Long으로 파싱해 쿼리에 넘긴다.

1. CursorPagination.size(size)로 1~100을 검사한다. 기본값은 20이다.
2. CursorCodec.decode(cursor, scope, sort)로 커서를 읽는다. 생략한 경우만 첫 페이지다. 빈 문자열은 오류다.
3. 사용자 범위·필터를 적용하고 정렬값 DESC, ID DESC로 size+1개를 조회한다.
4. CursorPagination.page(rows, size)에서 마지막 반환 행의 커서를 만든다.

다음 페이지 조건은 아래와 같다. 정렬값이 같을 때 ID 조건을 생략하지 않는다.

```sql
WHERE user_id = :currentUserId
  AND (sort_value < :cursorValue
       OR (sort_value = :cursorValue AND id < :cursorId))
ORDER BY sort_value DESC, id DESC
LIMIT :sizePlusOne
```

scope는 목록·정렬·필터를 식별한다. 예: explore:popular, rewards:me. 사용자에 묶인 목록은 사용자 ID도 scope에 결합한다. 커서는 서명·암호화·권한 검증 수단이 아니다. 쿼리는 사용자·가시성 조건을 별도로 검사한다.

다른 scope·정렬, 손상된 Base64/JSON, 중복·추가 필드, 지원하지 않는 버전·잘못된 ID·정렬값은 400 VALIDATION_FAILED다. 고정 데이터에서 같은 정렬값 경계는 보장하지만 페이지 사이 점수·공개 상태 변화를 스냅샷으로 고정하지 않는다.

각 도메인의 실제 쿼리·인덱스·가시성·scope는 해당 구현 단계에서 연결한다.
