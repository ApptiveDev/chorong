# 인증 API

유저는 `app_user` 한 행이고, 인증 수단은 `user_auth` 에 유저당 여러 행으로 붙는다.
provider 는 `KAKAO` `APPLE` `GOOGLE` `NAVER` `PASSWORD` `GUEST`. 현재 열린 로그인 경로는 `GUEST` 와 `PASSWORD` 다.

| 테이블 | 용도 |
|---|---|
| `app_user` | 계정. `status` (ACTIVE/WITHDRAWN), `nickname`, `email` |
| `user_auth` | 인증 수단. `(provider, provider_uid)` 유니크. GUEST 의 uid 는 기기 UUID, PASSWORD 는 소문자 이메일, 소셜은 provider 가 준 sub/id (예정) |
| `user_password` | PASSWORD 전용. bcrypt 해시, 실패 횟수, 잠금 시각 |
| `user_oauth` | 소셜 전용. 이메일, 표시 이름, 원본 프로필(JSONB) |
| `user_refresh_token` | 리프레시 토큰의 SHA-256 해시. 기기별 폐기 가능 |

## 토큰

- 액세스 토큰: JWT HS256. `sub` = user_id, `iss` = `chorong`. 기본 30분 (`JWT_ACCESS_TTL`).
- 리프레시 토큰: 랜덤 32바이트. 기본 30일 (`JWT_REFRESH_TTL`). `/refresh` 에 쓰면 폐기되고 새 쌍이 나온다.
- 비밀키는 `JWT_SECRET` (32바이트 이상). dev 기본값은 `application.yml` 에 있다. 운영은 환경변수로 넣는다.

보호된 엔드포인트는 `Authorization: Bearer <accessToken>` 을 요구한다. 없거나 틀리면 401 `UNAUTHORIZED`.

## 엔드포인트

| 메서드 | 경로 | 인증 | 용도 |
|---|---|---|---|
| POST | `/api/auth/guest/signup` | 없음 | 기기 UUID 로 비회원 가입 후 로그인. 201. 중복 UUID 는 409 `DEVICE_ALREADY_REGISTERED` |
| POST | `/api/auth/guest/login` | 없음 | 비회원 로그인. 미등록 UUID 는 401 `GUEST_NOT_FOUND` |
| POST | `/api/auth/password/signup` | 없음 | 이메일·비밀번호 가입 후 로그인. 201. 중복 이메일은 409 `EMAIL_ALREADY_USED` |
| POST | `/api/auth/password/login` | 없음 | 로그인. 실패 401 `LOGIN_FAILED`. 5회 실패 시 10분 잠금 (`ACCOUNT_LOCKED`) |
| POST | `/api/auth/refresh` | 없음 | 리프레시 토큰 회전. 폐기·만료 토큰은 401 `REFRESH_TOKEN_INVALID` |
| POST | `/api/auth/logout` | Bearer | `refreshToken` 을 주면 그 토큰만, 없으면 전부 폐기. 204 |
| GET | `/api/auth/me` | Bearer | 내 계정과 연결된 provider 목록 |

요청·응답 필드는 `/docs` 의 OpenAPI 스펙을 본다.

```json
{ "accessToken": "eyJ...", "refreshToken": "Q2h...", "expiresIn": 1800, "created": true }
```

## TODO(auth)

코드 안의 `TODO(auth)` 주석이 남은 작업 위치다.

- 소셜 로그인: `AuthService.socialLogin` 이 연결 규칙을 갖는다. 이미 연결된 신원이면 그 유저로 로그인. 로그인 상태(비회원 포함)에서 호출하면 현재 유저에 수단 추가(비회원 → 회원 전환, 같은 `user_id` 라 자산 유지). 다른 유저에 연결된 신원이면 409 `SOCIAL_ALREADY_LINKED`. 유저당 provider 수 제한 없음.
- 인증 수단 연동: 로그인한 유저(a 수단)에 다른 수단(b)을 붙인다. `POST /api/auth/link/password`, `POST /api/auth/link/social/{provider}`, `DELETE /api/auth/link/{provider}`(마지막 수단은 해제 불가). 비회원 → 회원 전환이 이 경로다. 위치는 `AuthController` 의 TODO.
- 소셜 검증기: `SocialIdentity` 를 만드는 provider 별 검증기와 `POST /api/auth/social/{provider}`. Apple·Google 은 id_token JWKS 검증, Kakao·Naver 는 access_token 으로 userinfo 조회.
