# 인증 API

유저는 `app_user` 한 행이고, 인증 수단은 `user_auth` 에 유저당 여러 행으로 붙는다.
provider 는 `KAKAO` `APPLE` `GOOGLE` `NAVER` `PASSWORD` `GUEST`. 현재 열린 로그인 경로는 `GUEST` 와 `PASSWORD` 다.

| 테이블 | 용도 |
|---|---|
| `app_user` | 계정. `status` (GUEST/ACTIVE/WITHDRAWN), `nickname`, `email`, 설정·학습 집계 |
| `user_auth` | 인증 수단. `(provider, provider_uid)` 유니크. GUEST 의 uid 는 기기 UUID, PASSWORD 는 소문자 이메일, 소셜은 provider 가 준 sub/id (예정) |
| `auth_guest` | GUEST 인증의 기기 플랫폼. IOS/ANDROID. 기존 계정은 v1 로그인 때 생성 |
| `user_password` | PASSWORD 전용. bcrypt 해시, 실패 횟수, 잠금 시각 |
| `user_oauth` | 소셜 전용. 이메일, 표시 이름, 원본 프로필(JSONB) |
| `user_refresh_token` | 리프레시 토큰의 SHA-256 해시. 기기별 폐기 가능 |

## 토큰

- 액세스 토큰: JWT HS256. `sub` = user_id, `iss` = `chorong`, `role` = GUEST/MEMBER. 기본 30분 (`JWT_ACCESS_TTL`).
- 리프레시 토큰: 랜덤 32바이트. 기본 365일 (`JWT_REFRESH_TTL`, 기본값 `P365D`). `/refresh` 에 쓰면 폐기되고 새 쌍이 나온다.
- 비밀키는 `JWT_SECRET` (32바이트 이상). dev 기본값은 `application.yml` 에 있다. 운영은 환경변수로 넣는다.

1년은 발급 시점부터 365일이다. 갱신할 때 새 리프레시 토큰에 다시 365일이 부여된다. 이미 발급된 토큰의 만료일은 변경하지 않는다.
`JWT_REFRESH_TTL` 환경변수가 있으면 기본값보다 우선한다. 365일 정책을 적용하는 환경에서는 이 값을 `P365D`로 맞춘다.

보호된 엔드포인트는 `Authorization: Bearer <accessToken>` 을 요구한다. 없거나 틀리면 401 `UNAUTHORIZED`.

## 사용자 상태·권한

| DB status | 현재 권한 | 인증 |
|---|---|---|
| GUEST | ROLE_GUEST | 허용 |
| ACTIVE | ROLE_MEMBER | 허용 |
| WITHDRAWN | 없음 | 거절 |

JWT의 role은 발급 당시 값이다. 요청마다 DB에서 현재 상태를 읽어 권한을 결정한다. role이 없는 기존 JWT도 사용할 수 있다. 회원 전환은 기존 토큰에도 다음 요청부터 반영한다. 탈퇴·삭제된 계정은 기존 JWT로 접근하거나 토큰을 새로 발급받을 수 없다.

신규 v1의 회원 전용 경로는 로그인 수단 연동·해제, 탈퇴, 커뮤니티다. 게스트는 403 MEMBER_ONLY, 미인증 요청은 401 UNAUTHORIZED다. 내 하우징 조회는 게스트도 허용한다. 공개 여부 변경의 회원 제한은 하우징 서비스 단계에서 연결한다. 구 API의 탈퇴 계정 오류는 USER_WITHDRAWN을 유지한다.

V9는 ACTIVE 중 GUEST 수단만 가진 계정을 GUEST로 이관한다. PASSWORD·소셜 수단이 하나라도 있는 계정과 WITHDRAWN은 유지한다. 수단이 없는 기존 계정은 분류 근거가 없어 기존 상태를 유지한다. userId·인증·지갑·보유 자산·퀴즈 데이터는 바꾸지 않는다.

| 새 사용자 필드 | 초기값 |
|---|---|
| pushEnabled | false |
| onboardingCompleted | false |
| lastStudyDate | null |
| streakDays | 0 |

알림 동의·온보딩·학습 기록이 없는 기존 계정에도 같은 초기값을 적용한다. 이 값의 갱신은 해당 업무 단계에서 구현한다. streakDays 음수는 DB에서 거절한다.

기존 nickname VARCHAR(40)와 null·저장값은 유지한다. 새 닉네임 변경에는 UserNicknamePolicy를 사용한다. 공백만인 값은 거절하고 Unicode 코드 포인트 2~12자로 검사한다. 앞뒤 공백이나 기존 긴 닉네임을 자동으로 자르지 않는다. 닉네임 수정 API는 후속 단계에서 연결한다.

## 엔드포인트

| 메서드 | 경로 | 인증 | 용도 |
|---|---|---|---|
| POST | `/api/v1/auth/guest` | 없음 | 기기 UUID로 가입 또는 자동 로그인. 200. 공통 data 응답 |
| POST | `/api/auth/guest/signup` | 없음 | 기기 UUID 로 비회원 가입 후 로그인. 201. 중복 UUID 는 409 `DEVICE_ALREADY_REGISTERED` |
| POST | `/api/auth/guest/login` | 없음 | 비회원 로그인. 미등록 UUID 는 401 `GUEST_NOT_FOUND` |
| POST | `/api/auth/password/signup` | 없음 | 이메일·비밀번호 가입 후 로그인. 201. 중복 이메일은 409 `EMAIL_ALREADY_USED` |
| POST | `/api/auth/password/login` | 없음 | 로그인. 실패 401 `LOGIN_FAILED`. 5회 실패 시 10분 잠금 (`ACCOUNT_LOCKED`) |
| POST | `/api/auth/refresh` | 없음 | 리프레시 토큰 회전. 폐기·만료 토큰은 401 `REFRESH_TOKEN_INVALID` |
| POST | `/api/auth/logout` | Bearer | `refreshToken` 을 주면 그 토큰만, 없으면 전부 폐기. 204 |
| GET | `/api/auth/me` | Bearer | 내 계정과 연결된 provider 목록 |

### v1 게스트 가입·자동 로그인

요청은 `deviceUuid`(8-4-4-4-12 자리 UUID)와 `platform`(`IOS` 또는 `ANDROID`)이다. 공백·잘못된 UUID·지원하지 않는 플랫폼은 400 VALIDATION_FAILED다.

성공 응답의 `data`는 `accessToken`, `refreshToken`, `expiresIn`, `user`, `isNew`를 담는다. `user`는 `userId`, `nickname`, `status`다. 기존 null 닉네임은 유지한다. 새 계정이면 `isNew=true`, 기존 계정이면 false다. 토큰 유효시간은 JWT_ACCESS_TTL 설정을 따른다.

같은 UUID는 대소문자를 구분하지 않는다. 구 가입 경로와 v1은 같은 기기 잠금을 쓴다. 동시 요청에도 계정은 하나만 생성한다. 과거 데이터에 대소문자만 다른 복수 계정이 있으면 임의로 합치지 않고 409 CONFLICT를 반환한다. 탈퇴 계정은 401 UNAUTHORIZED다.

신규 가입은 계정·인증·플랫폼·기본 하우징·아바타·지갑·토큰을 한 트랜잭션에서 생성한다. 기본 방·배경·아바타·벽·바닥이 없으면 409 CONFLICT로 전체 취소한다. 기존 계정은 없는 하우징과 지갑만 초기화한다. 기존 자산·잔액·닉네임·회원 상태는 바꾸지 않는다. 이미 하우징이 있으면 현재 기본 에셋 누락으로 로그인을 막지 않는다.

지갑은 현재 coin 구조의 기본값을 쓴다. STAR·STARDUST와 coin 이관 정책은 15단계에서 구현한다. V10은 플랫폼 테이블과 UUID 조회 인덱스만 추가한다. 기존 UUID·계정·퀴즈를 수정하지 않는다.

### 구 API 응답

구 API는 data 래퍼 없이 기존 응답을 유지한다. 요청·응답 필드는 `/docs`의 OpenAPI 스펙을 본다.

```json
{ "accessToken": "eyJ...", "refreshToken": "Q2h...", "expiresIn": 1800, "created": true }
```

## TODO(auth)

코드 안의 `TODO(auth)` 주석이 남은 작업 위치다.

- 소셜 로그인: `AuthService.socialLogin` 이 연결 규칙을 갖는다. 이미 연결된 신원이면 그 유저로 로그인. 로그인 상태(비회원 포함)에서 호출하면 현재 유저에 수단 추가(비회원 → 회원 전환, 같은 `user_id` 라 자산 유지). 다른 유저에 연결된 신원이면 409 `SOCIAL_ALREADY_LINKED`. 유저당 provider 수 제한 없음.
- 인증 수단 연동: 로그인한 유저(a 수단)에 다른 수단(b)을 붙인다. `POST /api/auth/link/password`, `POST /api/auth/link/social/{provider}`, `DELETE /api/auth/link/{provider}`(마지막 수단은 해제 불가). 비회원 → 회원 전환이 이 경로다. 위치는 `AuthController` 의 TODO.
- 소셜 검증기: `SocialIdentity` 를 만드는 provider 별 검증기와 `POST /api/auth/social/{provider}`. Apple·Google 은 id_token JWKS 검증, Kakao·Naver 는 access_token 으로 userinfo 조회.
