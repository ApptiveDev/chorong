# 인증 API

유저는 `app_user` 한 행이고, 인증 수단은 `user_auth` 에 유저당 여러 행으로 붙는다.
provider 는 `KAKAO` `APPLE` `GOOGLE` `NAVER` `PASSWORD` `GUEST`. `GUEST`와 `PASSWORD` 로그인이 열려 있다. `GOOGLE`은 client ID 설정 후 사용할 수 있다.

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
| POST | `/api/v1/auth/token/refresh` | 없음 | 기기 UUID 확인 후 refresh 회전. 200. 폐기 토큰 재사용 시 전체 refresh 폐기 |
| POST | `/api/v1/auth/logout` | Bearer | 현재 기기의 refresh·Push 삭제. all=true면 사용자 전체 기기 삭제. 204 |
| PUT | `/api/v1/push/devices` | Bearer | 현재 세션 기기의 Push 토큰 등록·갱신. 204 |
| DELETE | `/api/v1/push/devices/{deviceUuid}` | Bearer | 내 기기의 Push 토큰 삭제. 204 |
| DELETE | `/api/v1/users/me` | 회원 Bearer | 탈퇴 사유(선택, 255자)를 저장하고 계정·인증·Push 접근을 즉시 차단. 204 |
| POST | `/api/v1/auth/email/signup` | 게스트 Bearer | 이메일 인증 세션 생성·코드 발송 요청. 실제 발송기 미연결 |
| POST | `/api/v1/auth/email/verify` | 게스트 Bearer | 인증코드 확인 후 기존 계정을 회원으로 전환 |
| POST | `/api/v1/auth/email/login` | 없음 | 이메일 로그인. 5회 실패 시 15분 잠금. 423과 retryAfter |
| POST | `/api/v1/auth/oauth/google` | 선택적 게스트 Bearer | Google ID 토큰 검증 후 로그인 또는 게스트 전환 |
| POST | `/api/v1/auth/oauth/kakao` | 선택적 게스트 Bearer | Kakao access token 확인 후 로그인 또는 게스트 전환 |
| POST | `/api/v1/auth/link/{provider}` | 회원 Bearer | 검증된 이메일·OAuth 수단 연동 |
| DELETE | `/api/v1/auth/link/{provider}` | 회원 Bearer | 로그인 수단 해제. 마지막 수단은 유지 |
| POST | `/api/auth/guest/signup` | 없음 | 기기 UUID 로 비회원 가입 후 로그인. 201. 중복 UUID 는 409 `DEVICE_ALREADY_REGISTERED` |
| POST | `/api/auth/guest/login` | 없음 | 비회원 로그인. 미등록 UUID 는 401 `GUEST_NOT_FOUND` |
| POST | `/api/auth/password/signup` | 없음 | 이메일·비밀번호 가입 후 로그인. 201. 중복 이메일은 409 `EMAIL_ALREADY_USED` |
| POST | `/api/auth/password/login` | 없음 | 로그인. 실패 401 `LOGIN_FAILED`. 5회 실패 시 15분 잠금 (`ACCOUNT_LOCKED`) |
| POST | `/api/auth/refresh` | 없음 | 리프레시 토큰 회전. 폐기·만료 토큰은 401 `REFRESH_TOKEN_INVALID` |
| POST | `/api/auth/logout` | Bearer | `refreshToken` 을 주면 그 토큰만, 없으면 전부 폐기. 204 |
| GET | `/api/auth/me` | Bearer | 내 계정과 연결된 provider 목록 |

### v1 게스트 가입·자동 로그인

요청은 `deviceUuid`(8-4-4-4-12 자리 UUID)와 `platform`(`IOS` 또는 `ANDROID`)이다. 공백·잘못된 UUID·지원하지 않는 플랫폼은 400 VALIDATION_FAILED다.

성공 응답의 `data`는 `accessToken`, `refreshToken`, `expiresIn`, `user`, `isNew`를 담는다. `user`는 `userId`, `nickname`, `status`다. 기존 null 닉네임은 유지한다. 새 계정이면 `isNew=true`, 기존 계정이면 false다. 토큰 유효시간은 JWT_ACCESS_TTL 설정을 따른다.

같은 UUID는 대소문자를 구분하지 않는다. 구 가입 경로와 v1은 같은 기기 잠금을 쓴다. 동시 요청에도 계정은 하나만 생성한다. 과거 데이터에 대소문자만 다른 복수 계정이 있으면 임의로 합치지 않고 409 CONFLICT를 반환한다. 탈퇴 계정은 401 UNAUTHORIZED다.

신규 가입은 계정·인증·플랫폼·기본 하우징·아바타·지갑·토큰을 한 트랜잭션에서 생성한다. 기본 방·배경·아바타·벽·바닥이 없으면 409 CONFLICT로 전체 취소한다. 기존 계정은 없는 하우징과 지갑만 초기화한다. 기존 자산·잔액·닉네임·회원 상태는 바꾸지 않는다. 이미 하우징이 있으면 현재 기본 에셋 누락으로 로그인을 막지 않는다.

지갑은 신규 계정에 coin·STAR·STARDUST 잔액을 0으로 만든다. 기존 coin 잔액은 유지하며 STAR·STARDUST로 환산하지 않는다. API-904는 STAR·STARDUST만 반환한다. V10은 플랫폼 테이블과 UUID 조회 인덱스만 추가한다. 기존 UUID·계정·퀴즈를 수정하지 않는다.

### v1 토큰 회전·로그아웃

토큰 갱신에는 refreshToken과 정규 UUID 형식의 deviceUuid가 필요하다. 저장된 기기와 일치하지 않거나 알 수 없는 토큰이면 401 UNAUTHORIZED다. 미폐기 토큰이 만료되면 401 AUTH_TOKEN_EXPIRED다. 폐기된 토큰을 재사용하면 401 AUTH_TOKEN_REUSED를 반환하고 해당 계정의 모든 refresh 토큰을 폐기한다. 기기가 다르면 재사용으로 처리하지 않는다. 구 refresh 경로도 회전과 재사용 보안을 공유하고 기존 오류 형식을 유지한다.

새 액세스 토큰의 sid는 발급된 refresh 세션의 ID다. 로그아웃 all=false는 검증된 액세스 토큰의 세션과 사용자로 기기를 확인하고 해당 기기의 refresh 토큰과 Push 등록을 삭제한다. all=true는 사용자 전체 refresh와 Push 등록을 삭제한다. 이미 발급된 액세스 토큰은 만료까지 사용할 수 있다. sid가 없는 이전 토큰이나 기기 정보가 없는 세션은 현재 기기를 식별할 수 없어 all=false 요청이 401이다. 기기 UUID로 재로그인하거나 기기 정보가 있는 refresh를 갱신한 뒤 사용한다. all=true는 이전 토큰으로도 가능하다.

### Push 기기 관리

`PUT /api/v1/push/devices`는 로그인한 사용자의 현재 access token `sid`가 가리키는 유효 refresh 세션과 같은 `deviceUuid`만 등록할 수 있다. 같은 deviceUuid는 한 행으로 upsert한다. 다른 계정으로 로그인한 뒤 같은 기기에서 등록하면 기기 소유자를 새 계정으로 옮기고 push token·platform을 교체한다. Push token은 로그에 남기지 않는다.

`DELETE /api/v1/push/devices/{deviceUuid}`는 현재 사용자 소유 행만 지운다. 다른 계정 기기나 이미 삭제한 기기는 존재 여부를 노출하지 않고 204를 반환한다. 로그아웃 all=false는 현재 기기만, all=true는 해당 사용자의 모든 Push 등록을 함께 삭제한다. Push 발송 자체는 이 단계 범위에 없다.

### 회원 탈퇴

`DELETE /api/v1/users/me`는 회원만 호출할 수 있다. 요청 사유는 선택이며 최대 255자로 저장한다. 한 트랜잭션에서 status를 WITHDRAWN으로 바꾸고 refresh token을 폐기한다. 로그인 수단, 이메일 인증 세션, Push 등록을 삭제하고 하우징을 비공개로 바꾼다. 기존 access token도 다음 요청부터 거절한다.

email·nickname과 하우징·학습 등 계정 데이터는 유지한다. `withdrawn_at`과 `deletion_after`에 탈퇴 시각과 90일 뒤 삭제 기준을 저장한다. 실제 삭제 배치는 33단계에서 구현한다. 하우징 공개 여부의 기본값은 false다.

### 이메일 인증코드 발송

`POST /api/v1/auth/email/signup`은 게스트 Bearer와 email·password를 받는다. 비밀번호는 8~64자이며 영문과 숫자를 포함한다. 이메일은 소문자로 정규화한다. PASSWORD 인증 수단에 이미 등록된 이메일은 409 EMAIL_ALREADY_REGISTERED다. 같은 이메일의 발송은 계정과 관계없이 60초에 한 번이다. 제한 응답은 429 RATE_LIMITED와 retryAfter를 담는다.

성공 시 data.verificationId와 expiresAt을 반환한다. 코드는 6자리이고 10분 유효하다. 재발송은 해당 이메일의 이전 미사용 세션을 무효화한다. 세션은 요청한 게스트 userId에 연결한다. 비밀번호와 코드는 해시만 저장한다. 요청 본문이나 코드는 로그에 남기지 않는다.

메일 발송 인터페이스만 준비되어 있다. 실제 공급자 설정과 발송기는 없다. 현재 기본 발송기는 실패를 반환하며 인증 세션과 발송 제한 기록을 롤백한다. 공급자를 연결한 뒤 실제 발송과 장애 복구를 검증해야 한다.

세션의 비밀번호 해시는 `{pbkdf2-base64}` 접두사와 PBKDF2-SHA256 Base64 값이다. 기존 user_password의 bcrypt와 구분하여 검증한다. 코드는 bcrypt 해시다.

### 이메일 인증 확인

`POST /api/v1/auth/email/verify`는 게스트 Bearer, verificationId와 6자리 code를 받는다. 세션의 소유자·유효기간·무효화·사용 여부를 확인한다. 코드를 5회 틀리면 세션을 무효화한다. 오입력 횟수와 무효화는 오류 응답 이후에도 보존한다. 재발송하면 이전 코드는 사용할 수 없다.

확인에 성공하면 기존 userId와 자산을 유지하고 PASSWORD 인증 수단을 연결한다. 외부 명세의 EMAIL은 내부 PASSWORD에 대응한다. 계정 상태는 ACTIVE가 된다. 응답에는 새 토큰과 user, isNew=false가 들어간다. 기존 GUEST 인증 수단은 유지한다. 중복 이메일은 409 ACCOUNT_EXISTS_FOR_PROVIDER다. 구 가입 경로와 같은 이메일 잠금을 사용한다.

새 토큰을 현재 기기에 연결하려면 게스트 액세스 토큰에 sid와 해당 기기의 세션이 있어야 한다. 이전 토큰에 sid가 없으면 재로그인 또는 기기 정보가 있는 refresh 토큰 갱신이 필요하다. 실제 인증 메일 수신 검증은 발송기 연결 이후 가능하다.

### 이메일 로그인

`POST /api/v1/auth/email/login`은 email·password·deviceUuid를 받는다. 이메일 대소문자를 구분하지 않는다. 성공하면 data에 토큰·user·isNew=false를 반환한다. 신규 토큰은 요청한 기기에 연결된다. 미등록 이메일·비밀번호 불일치·탈퇴 계정은 401 UNAUTHORIZED다.

5회 연속 실패하면 다섯 번째 요청부터 15분 동안 423 ACCOUNT_LOCKED와 retryAfter를 반환한다. retryAfter는 남은 시간을 초 단위로 올림한 값이다. 잠금이 만료되면 다음 시도부터 다시 검사한다. 성공은 실패 횟수와 잠금을 초기화한다. 같은 계정의 동시 요청과 구 로그인은 실패 횟수·잠금을 공유한다.

구 로그인은 기존 401 LOGIN_FAILED·ACCOUNT_LOCKED 응답을 유지한다. 구 경로로 잠금을 우회하지 못하도록 새 잠금의 기간도 10분에서 15분으로 변경했다. 이미 저장된 잠금 만료 시각은 변경하지 않는다.

### Google 로그인

`POST /api/v1/auth/oauth/google`은 Google idToken과 deviceUuid를 받는다. Google의 고정 공개키 주소에서 RS256 서명을 확인한다. 허용 issuer, audience, 발급·만료 시각과 sub도 검사한다. 계정 식별에는 검증된 sub만 사용한다. 이메일이 같아도 기존 계정을 합치지 않는다.

토큰 없이 요청하면 Google 계정을 로그인하거나 새 회원을 만든다. 새 회원의 기본 하우징·아바타·지갑과 인증 수단을 함께 생성한다. 게스트 Bearer가 있으면 같은 userId와 자산을 유지하고 회원으로 전환한다. Google 계정이 다른 사용자에게 연결되어 있으면 409다. 탈퇴 계정은 로그인할 수 없다. 동시 요청은 Google sub 기준으로 직렬화한다.

환경변수 `GOOGLE_OAUTH_CLIENT_IDS`에 허용할 Google OAuth client ID를 쉼표로 구분해 넣는다. `aud`와 `azp`에 등장할 수 있는 허용 웹·Android·iOS client ID를 포함한다. dev와 prod에는 각 환경의 허용 ID만 설정한다. 현재 실환경 client ID는 확인되지 않았다. 설정이 없거나 Google 공개키를 조회할 수 없으면 요청을 실패시킨다. Google 실제 계정·client ID를 사용한 검증은 아직 하지 않았다.

### Kakao 로그인

`POST /api/v1/auth/oauth/kakao`는 Kakao accessToken과 deviceUuid를 받는다. 서버는 access token을 Kakao `GET https://kapi.kakao.com/v2/user/me`에 전달하고 성공 응답의 앱 사용자 `id`를 계정 식별자로 쓴다. access token과 이메일은 저장하지 않는다. 게스트 Bearer가 있으면 기존 userId와 자산을 보존해 회원으로 전환한다. 이메일로 계정을 합치지 않는다.

`KAKAO_OAUTH_APP_ID`가 비어 있거나 숫자가 아니면 Kakao 로그인을 거절한다. 서버는 먼저 `/v1/user/access_token_info`의 `app_id`가 설정값과 같은지 확인한 뒤 `/v2/user/me`의 사용자 ID가 일치하는지 검사한다. 실 앱 ID와 Kakao 개발자 설정은 아직 확인되지 않았다. 잘못된 토큰은 401, 외부 장애는 500이다.

### 인증 수단 연동·해제

API-108은 회원만 호출한다. Google·Kakao·Apple은 로그인과 같은 검증기를 통과해야 연결된다. 다른 회원에게 이미 연결된 providerUid면 409를 반환하며 계정 정보는 노출하지 않는다. 이메일은 API-102 발송·API-103 코드 확인 뒤 API-108에 같은 `verificationId`를 보내 소유자와 소비 상태를 확인한다. API-102·103은 회원도 사용할 수 있어 기존 회원에게 이메일 수단을 추가한다. 응답에서는 PASSWORD를 EMAIL로 표시한다.

API-109는 이메일·Google·Kakao·Apple 수단을 해제한다. 회원 행 잠금 안에서 수단 수를 검사해 마지막 수단 해제를 막는다. 게스트 기기 인증 수단은 유지한다. 구 `/api/auth/me`의 PASSWORD 응답은 호환성을 위해 그대로 둔다.

### 구 API 응답

구 API는 data 래퍼 없이 기존 응답을 유지한다. 요청·응답 필드는 `/docs`의 OpenAPI 스펙을 본다.

```json
{ "accessToken": "eyJ...", "refreshToken": "Q2h...", "expiresIn": 1800, "created": true }
```

기존 `/api/auth/social/{provider}`는 계속 닫혀 있다. OAuth 검증과 인증 수단 연결은 `/api/v1` 경로를 사용한다. NAVER 수단은 기존 데이터 호환 대상으로 두며 API-108·109에서는 연결·해제하지 않는다.
