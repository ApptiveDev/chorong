# Mock API 실행

`mobile/.env.local`에 다음 값을 저장하고 `mobile/`에서 `pnpm start`를 실행한다.

```dotenv
EXPO_PUBLIC_USE_MOCK=true
EXPO_PUBLIC_API_URL=http://localhost:8080
```

Mock 모드는 `src/integration/client.ts`의 요청 단계에서 응답한다. `integrationApi` 호출과 응답 스키마 검증은 Real 모드와 같다. 이메일 로그인 화면에서 임의의 이메일과 비밀번호를 입력하면 Mock 계정으로 로그인한다. 이전 `/api` 개발 도구 호출은 Mock 모드에서 요청 전에 오류를 반환한다. 네트워크 요청은 보내지 않는다. 웹에서는 게스트 로그인 버튼이 비활성화된다. 명세에 `WEB` 플랫폼 값이 없기 때문이다.

빈 목록을 시험하려면 `EXPO_PUBLIC_MOCK_SCENARIO=empty`를 추가한다. 오류를 시험하려면 `EXPO_PUBLIC_MOCK_SCENARIO=error`로 바꾼다. 환경변수 변경 뒤 Expo 서버를 재시작한다.

Real API 모드는 `EXPO_PUBLIC_USE_MOCK=false`로 전환한다. `EXPO_PUBLIC_API_URL`에는 실제 API origin을 넣는다. 현재 서버의 `/api` 계약과 프론트엔드 개발명세서의 `/api/v1` 계약은 다르다. Real 모드의 학습·소셜 등 신규 API 호출은 서버 계약이 배포되기 전까지 성공을 보장하지 않는다.

검사는 `pnpm typecheck`, `pnpm format:check`, `pnpm test:integration`을 실행한다. 프로젝트에는 ESLint 스크립트가 없다.

## 명세 확인 필요

Mock 응답은 `src/integration/models.ts`의 OpenAPI 0.2.0 타입을 따른다. 퀴즈 `options`의 실제 항목 구조와 `index` 의미는 확인이 필요하다. 공개 설정 API-703은 Mock에서도 호출한다. 아바타 설정 API-704는 화면에서 사용하지 않는다. 랭킹과 챌린지 API는 현재 명세와 화면에 없다.
