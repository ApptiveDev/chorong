# API 연동 상태

기준: 10/30 개발명세서 OpenAPI 0.2.0, 2026-11-01. 총 46개 API를 대조했다. 경로는 /api/v1 기준 상대 경로다. 일반 화면은 `/`, `/quiz`, `/social`, `/room/*`, `/learn/*` 등이고, `/integration/*`는 개발자 기능 시험 화면이다.

내 우주 조회(API-701)는 홈에 연결했다. 배치 저장·상점·인벤토리(API-702, 901~903, 907)는 호출 함수만 남기고 일반 꾸미기 화면을 추후 구현 안내로 바꿨다. 하우징 이름·공개 설정과 아바타 설정(API-703,704)은 명세 변경 예정으로 보류했다. OAuth·Push 자동 SDK 연동은 부분 구현이다. 퀴즈 답안 의미는 명세 확인이 필요하다. 실제 기능 E2E 검증을 완료한 신규 API는 없다.

| API 번호 | 기능                         | Method | Endpoint                         | 연결 화면  | 구현 상태                      | 실제 서버 검증 | 확인된 문제·백엔드 확인 사항                                    |
| -------- | ---------------------------- | ------ | -------------------------------- | ---------- | ------------------------------ | -------------- | --------------------------------------------------------------- |
| API-101  | 게스트 로그인                | POST   | `/auth/guest`                    | account    | 구현 완료 / 서버 검증 대기     | 미검증         | WEB ENUM 없음; 기존 서버는 guest/signup·guest/login 분리        |
| API-102  | 이메일 인증코드 발송         | POST   | `/auth/email/signup`             | account    | 구현 완료 / 서버 검증 대기     | 미검증         | 전역 guest 보안과 신규 가입 설명 충돌; 익명 가입 허용 여부      |
| API-103  | 이메일 인증 확인             | POST   | `/auth/email/verify`             | account    | 구현 완료 / 서버 검증 대기     | 미검증         | 익명 가입 허용 여부와 이메일 연동 verificationId 사용 순서      |
| API-104  | 이메일 로그인                | POST   | `/auth/email/login`              | account    | 구현 완료 / 서버 검증 대기     | 미검증         | 기존 password/login의 deviceUuid·응답 envelope 차이             |
| API-105  | OAuth 로그인                 | POST   | `/auth/oauth/{provider}`         | account    | 부분 구현: 수동 API 시험       | 미검증         | SDK·client ID·redirect 설정 없음. 수동 자격 증명 입력만 구현    |
| API-106  | 토큰 갱신                    | POST   | `/auth/token/refresh`            | account    | 구현 완료 / 서버 검증 대기     | 미검증         | 기존 refresh 경로·deviceUuid·응답 envelope 차이                 |
| API-107  | 로그아웃                     | POST   | `/auth/logout`                   | account    | 구현 완료 / 서버 검증 대기     | 미검증         | 기존 서버는 refreshToken 본문, PDF는 all 본문                   |
| API-108  | 로그인 수단 연동             | POST   | `/auth/link/{provider}`          | account    | 구현 완료 / 서버 검증 대기     | 미검증         | 확인 완료 verificationId 재사용 가능 여부, OAuth 자격 증명 계약 |
| API-109  | 로그인 수단 해제             | DELETE | `/auth/link/{provider}`          | account    | 구현 완료 / 서버 검증 대기     | 미검증         | 마지막 수단 해제 거절은 서버 판정                               |
| API-110  | 회원 탈퇴                    | DELETE | `/users/me`                      | account    | 구현 완료 / 서버 검증 대기     | 미검증         | 실제 계정 탈퇴 미시험. 탈퇴 확인 입력 후 요청                   |
| API-201  | 내 정보 조회                 | GET    | `/users/me`                      | profile    | 구현 완료 / 서버 검증 대기     | 미검증         | 기존 /api/auth/me DTO와 PDF Me 차이                             |
| API-202  | 내 정보 수정                 | PATCH  | `/users/me`                      | profile    | 구현 완료 / 서버 검증 대기     | 미검증         | 닉네임·알림 변경 후 내 정보 재조회                              |
| API-301  | Push 토큰 등록·갱신          | PUT    | `/push/devices`                  | profile    | 부분 구현: 수동 API 시험       | 미검증         | Push SDK·플랫폼 설정 없음. 실제 네이티브 토큰 수동 입력만 구현  |
| API-302  | Push 토큰 삭제               | DELETE | `/push/devices/{deviceUuid}`     | profile    | 구현 완료 / 서버 검증 대기     | 미검증         | 실기기 Push 등록·삭제 검증 필요                                 |
| API-401  | 코스 목록 조회               | GET    | `/courses`                       | learning   | 구현 완료 / 서버 검증 대기     | 미검증         | 배포 서버에 PDF 경로가 공개되지 않음                            |
| API-402  | 코스 상세 조회               | GET    | `/courses/{courseId}`            | learning   | 구현 완료 / 서버 검증 대기     | 미검증         | GET이 일일 해금을 수행함. 해금은 서버 판정                      |
| API-403  | 레슨 상세 조회               | GET    | `/lessons/{lessonId}`            | learning   | 구현 완료 / 서버 검증 대기     | 미검증         | 배포 서버에 PDF 경로가 공개되지 않음                            |
| API-404  | 레슨 시작·이어하기·다시 하기 | POST   | `/lessons/{lessonId}/start`      | learning   | 구현 완료 / 서버 검증 대기     | 미검증         | resumeContentId·reviewRequired 실제 응답 확인                   |
| API-405  | 콘텐츠 완료                  | POST   | `/contents/{contentId}/complete` | learning   | 구현 완료 / 서버 검증 대기     | 미검증         | 마지막 콘텐츠 자동 완료·보상 및 replay 계약 확인                |
| API-406  | 퀴즈 답안 제출               | POST   | `/quizzes/{quizId}/answer`       | 학습       | 명세 확인 필요: 입력·호출 구현 | 미검증         | 선택지 구조·index 시작값·order 의미 미정. 확인된 형식만 UI 연결 |
| API-407  | 레슨 완료                    | POST   | `/lessons/{lessonId}/complete`   | learning   | 구현 완료 / 서버 검증 대기     | 미검증         | API-405와 중복 보상 방지 및 멱등 키 24시간 보장 확인            |
| API-408  | 전체 학습 진행도             | GET    | `/users/me/progress`             | learning   | 구현 완료 / 서버 검증 대기     | 미검증         | 배포 서버에 PDF 경로가 공개되지 않음                            |
| API-501  | 복습 조회                    | GET    | `/reviews/next`                  | review     | 구현 완료 / 서버 검증 대기     | 미검증         | 복습 선정·빈 세트·rewardEligible는 서버 판정                    |
| API-502  | 복습 답안 제출               | POST   | `/reviews/{reviewItemId}/answer` | review     | 명세 확인 필요: 입력·호출 구현 | 미검증         | QuizAnswer 의미는 API-406과 같은 확인 필요                      |
| API-503  | 복습 완료                    | POST   | `/reviews/complete`              | review     | 구현 완료 / 서버 검증 대기     | 미검증         | sessionId 없음. 재시작 후 재시도·일일 보상 중복 정책 확인       |
| API-601  | 온보딩 조회                  | GET    | `/onboarding`                    | onboarding | 구현 완료 / 서버 검증 대기     | 미검증         | 온보딩 콘텐츠의 options 구조 확인                               |
| API-602  | 온보딩 완료·건너뛰기         | POST   | `/onboarding/complete`           | onboarding | 구현 완료 / 서버 검증 대기     | 미검증         | 건너뛴 뒤 재진입 금지·1회 보상 검증 필요                        |
| API-701  | 내 우주 조회                 | GET    | `/housings/me`                   | 홈         | 구현 완료 / 서버 검증 대기     | 미검증         | 방 모양 중앙 배치, 배치 좌표는 임시 이름 표시                   |
| API-702  | 배치 전체 저장               | PUT    | `/housings/me/placements`        | 없음       | 호출 함수만 유지 / UI 보류     | 미검증         | 꾸미기 화면 추후 구현. 현재 화면에서 요청하지 않음              |
| API-703  | 하우징 이름·공개 설정        | PATCH  | `/housings/me`                   | housing    | 미구현: UI만 배치              | 대상 제외      | 명세 변경 예정. 요청 함수 없음                                  |
| API-704  | 아바타 설정                  | PATCH  | `/housings/me/avatar`            | housing    | 미구현: UI만 배치              | 대상 제외      | 명세 변경 예정. 요청 함수 없음                                  |
| API-801  | 공개 우주 탐색               | GET    | `/housings/explore`              | social     | 구현 완료 / 서버 검증 대기     | 미검증         | 하우징 공개 변경 보류. 공개된 회원 테스트 계정 필요             |
| API-802  | 다른 우주 방문               | GET    | `/housings/{housingId}`          | social     | 구현 완료 / 서버 검증 대기     | 미검증         | 소유자 userId 없음. 방문 화면에 이름·배치 수 표시               |
| API-803  | 좋아요 등록                  | POST   | `/housings/{housingId}/like`     | social     | 구현 완료 / 서버 검증 대기     | 미검증         | 좋아요 응답 후 방문 재조회                                      |
| API-804  | 좋아요 취소                  | DELETE | `/housings/{housingId}/like`     | social     | 구현 완료 / 서버 검증 대기     | 미검증         | 취소 응답 후 방문 재조회                                        |
| API-805  | 신고                         | POST   | `/reports`                       | social     | 구현 완료 / 서버 검증 대기     | 미검증         | 실제 신고 미시험. 사유 ENUM·상세 입력 구현                      |
| API-806  | 사용자 차단                  | POST   | `/blocks/{userId}`               | social     | 구현 완료 / 서버 검증 대기     | 미검증         | 방문 응답에 userId 없음. 확인된 사용자 ID 수동 입력             |
| API-807  | 차단 해제                    | DELETE | `/blocks/{userId}`               | social     | 구현 완료 / 서버 검증 대기     | 미검증         | 해제 후 차단 목록 재조회                                        |
| API-808  | 차단 목록 조회               | GET    | `/blocks`                        | social     | 구현 완료 / 서버 검증 대기     | 미검증         | meta.nextCursor로 페이지 조회                                   |
| API-901  | 상점 목록                    | GET    | `/shop/items`                    | 없음       | 호출 함수만 유지 / UI 보류     | 미검증         | 상점 화면 추후 구현. 현재 화면에서 요청하지 않음                |
| API-902  | 아이템 상세                  | GET    | `/shop/items/{itemId}`           | 없음       | 호출 함수만 유지 / UI 보류     | 미검증         | 옵션 화면 추후 구현                                             |
| API-903  | 아이템 구매                  | POST   | `/shop/purchases`                | 없음       | 호출 함수만 유지 / UI 보류     | 미검증         | 현재 화면에서 구매 요청하지 않음                                |
| API-904  | 지갑 조회                    | GET    | `/users/me/wallet`               | profile    | 구현 완료 / 서버 검증 대기     | 미검증         | 학습 보상 뒤 잔액 재조회                                        |
| API-905  | 보상 내역 조회               | GET    | `/users/me/rewards`              | profile    | 구현 완료 / 서버 검증 대기     | 미검증         | meta.nextCursor로 지급 내역 조회                                |
| API-906  | 별자리 조회                  | GET    | `/constellations`                | profile    | 구현 완료 / 서버 검증 대기     | 미검증         | 서버 별자리 획득 상태 표시                                      |
| API-907  | 인벤토리                     | GET    | `/users/me/inventory`            | 없음       | 호출 함수만 유지 / UI 보류     | 미검증         | 꾸미기 화면 추후 구현                                           |

## 배포 서버 확인

2026-11-01 https://api-chorong-dev.bawibase.com 에 읽기 요청만 전송했다. /api/health는 HTTP 200과 status=ok를 반환했다. /api-docs는 HTTP 200이며 22개 경로를 공개한다. /api/v1/courses 무인증 요청은 HTTP 401이다. 인증 필터가 존재하지 않는 경로도 차단할 수 있으므로 이 응답만으로 API 구현 여부를 판정하지 않는다.

공개된 인증 경로는 /api/auth/guest/signup, /api/auth/guest/login, /api/auth/password/signup, /api/auth/password/login, /api/auth/refresh, /api/auth/logout, /api/auth/me다. PDF의 /api/v1 경로는 없다. 현재 체크아웃의 Kotlin 컨트롤러도 기존 경로와 일치한다. 다른 팀원의 브랜치는 수정하지 않았다.

## 공통 계약 확인

- Base URL: 기존 origin과 PDF /api/v1을 구분한다. URL 외에 응답 형식을 바꿔 맞추지 않는다.
- 응답: PDF는 {data: ...}와 {error:{code,message}}, 기존 코드는 직접 DTO와 최상위 오류 필드를 사용한다. 필드 누락·타입 차이는 CONTRACT_MISMATCH 또는 오류 응답 형식 차이로 표시한다.
- 권한: PDF는 role=MEMBER를 설명하지만 Me에는 role이 없고 status=ACTIVE가 있다. UI는 ACTIVE로 회원 기능을 제한한다. 최종 접근 판정은 서버에 남긴다.
- 이메일: API-102·103은 전역 guest 보안이 적용되나 신규 가입도 설명한다. 현재 UI는 토큰이 있으면 첨부하고 없으면 익명 요청한다. 익명 허용 여부를 확정해야 한다.
- 퀴즈: 기존 interactionType·config·response와 PDF type·options·answer를 혼용하지 않는다. 일반 화면은 `{index,label}` 선택지에서만 버튼·정렬 UI를 연결한다. 다른 구조와 index·order의 의미는 확인이 필요하다.
- 다시 하기: API-404·406에는 replay가 있으나 405·407에는 없다. 다시 하기 중 완료 요청은 보내지 않는다.
- 멱등성: 레슨·온보딩은 동일 scope 키를 유지한다. 복습은 동일 세션의 같은 reviewItemIds에 같은 키를 쓴다. 앱 재시작 이후에도 동일 완료를 식별할 sessionId 또는 서버 중복 방지 계약이 필요하다.
- 플랫폼: ENUM-03에는 IOS·ANDROID만 있다. WEB·브라우저 Push·웹 인증 복원 정책을 확정해야 한다.
- CORS: Authorization·Idempotency-Key 요청 헤더와 X-Request-Id 응답 노출을 확인해야 한다.
- SDK: OAuth client ID·redirect·native 설정, Push 공급자·토큰 종류·실기기 설정이 필요하다. 자격 증명은 생성하지 않았다.

## 기능 식별자 대조

| 기능                              | 구현 위치            | 상태                               |
| --------------------------------- | -------------------- | ---------------------------------- |
| F-01 인증, F-02 회원              | 계정·마이페이지      | 명세 호출 연결. OAuth SDK 제외     |
| F-03 알림                         | 마이페이지           | 설정 저장·수동 토큰 등록/삭제      |
| F-04 학습, F-05 복습, F-06 온보딩 | 학습·복습·온보딩     | 서버 채점·완료·보상 호출           |
| F-07 하우징, F-08 아바타          | 홈·꾸미기 안내       | 내 우주 조회. 편집·아바타 보류     |
| F-09 커뮤니티                     | 소셜                 | 방문·좋아요·신고·차단·페이지네이션 |
| F-10 상점                         | 상점 안내            | 호출 함수 유지. UI 추후 구현       |
| F-11 보상, F-12 재화, F-13 별자리 | 완료 결과·마이페이지 | 서버 조회                          |
| F-14 인벤토리                     | 꾸미기 안내          | 호출 함수 유지. UI 추후 구현       |
| F-15 화면/설정 참조               | 마이페이지·상점      | PDF에 연결된 API 범위만 반영       |
