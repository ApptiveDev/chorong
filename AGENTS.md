# chorong

React Native(Expo) 앱 + Spring Boot Kotlin API.

- 설명: [`README.md`](README.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 인프라: [`bawibase/bawi-cloud-core`](https://github.com/bawibase/bawi-cloud-core) `infra/environments/apps/chorong/`
- 도메인: `chorong.bawibase.com` (web), `api-chorong.bawibase.com` (API). dev 는 `-dev` 접미사.
- DB: 공유 RDS `bawi-sandbox-postgres` 의 `chorong_{dev,prod}` 스키마

# Rules

- 커밋 메세지는 한글. `기능:` `수정:` `설정:` `문서:` `머지:` 프리픽스.
- 로컬 개발은 `./scripts/dev-up.sh`. 자세히는 `docs/DEV_LOCAL.md`.
- 백엔드 작업 시 스텝마다 dev 배포하지 않는다. 로컬 빌드·테스트만 (전체 종료 후 배포).
- 백엔드 코드 포맷은 Spotless(ktlint) 가 정한다. 커밋 전에 `backend/` 에서 `./gradlew spotlessApply` 를 실행한다.
- 앱 코드 포맷은 Prettier 가 정한다. 커밋 전에 `mobile/` 에서 `pnpm format` 을 실행한다.
- 앱의 API 주소는 `EXPO_PUBLIC_API_URL` 하나로만 주입한다. 코드에 도메인을 하드코딩하지 않는다.
- 새 외부 의존성은 사전 논의.

# 로깅 규칙

기준: 이 로그가 없으면 장애를 못 추적하는가. 아니면 남기지 않는다. 정상 요청 하나에 로그 0~1줄.

| 레벨 | 남기는 것 |
|---|---|
| ERROR | 예상 못 한 예외. 5xx. 스택트레이스 포함. 알람 대상 |
| WARN | 예상했지만 비정상. 계정 잠금, 폐기된 리프레시 토큰 재사용, 외부 API 실패, 유니크 충돌 재시도 |
| INFO | 되돌릴 수 없거나 돈·계정이 바뀌는 사건. 유저 생성, 인증 수단 연동·해제, 탈퇴, 구매, 전체 로그아웃 |
| DEBUG | 로컬 전용. 로그인 실패(비밀번호 틀림) 포함 |

- 형식: `도메인.사건 key=value key=value`. 한 줄. 문장 금지. 예: `user.created userId=42 provider=GUEST`.
- 위치: 서비스 계층. 컨트롤러·레포지토리·반복문 안에는 남기지 않는다. 4xx·5xx 는 `ApiExceptionHandler` 한 곳에서만.
- 금지: 비밀번호, 토큰 원문·해시, 이메일, 기기 UUID, 요청 본문 덤프, `printStackTrace`, 예외를 잡고 로그만 남기고 삼키기.
- 식별자는 `userId` 만. `traceId`·`spanId` 는 Micrometer 가, `requestId` 는 `RequestIdFilter` 가 MDC 에 넣는다. 코드에서 직접 쓰지 않는다.
- 도구: SLF4J `LoggerFactory.getLogger(javaClass)`. 출력은 ECS JSON 한 가지. 프로파일로 양식을 바꾸지 않는다.
- 장애 신고는 응답 헤더 `X-Request-Id` 값으로 받는다.

# 글쓰기 규칙 (문서·주석·커밋·PR·UI 카피 공통)

목적: 독자가 처음 읽고 바로 실행하게 쓴다. 감명 주려 쓰지 않는다.

## 금지
- **마케팅 형용사**: 강력한, 혁신적인, 견고한, 유연한, 확장 가능한, 엔터프라이즈급, 업계 표준, 직관적인, 원활한, seamless, robust
- **흐림 어투**: ~것 같다, ~라고 볼 수 있다, ~에 대한 논의가 이루어졌다, ~하도록 해준다
- **빈 동사구**: 활용하다·leverage, 제공하다·enable, ~을 통해, ~에 있어서
- **AI 상투어**: "궁극적으로", "결론적으로", "in today's world", "it's important to note"
- **아부 오프닝**: "좋은 질문입니다", "훌륭한 지적입니다"
- **근거 없는 수식**: "매우 빠른", "대폭 개선" (구체 수치 없으면 삭제)
- **em-dash 남발**, 이모지 (명시 요청 없는 한).

## 강제
- 능동태·현재형·평서문.
- 한 문장 = 한 사실. 접속사 3개 이상 = 문장 쪼갠다.
- 각 문장마다 자문: **"이 문장 지우면 독자가 뭘 못 하나?"** 답 없으면 삭제.
- 목록 3개 이상만 bullet, 2개는 문장.
- 전문가가 읽는다고 가정. 코드/설정 보면 알 수 있는 내용은 쓰지 않는다.

## UI 카피 특화
- 버튼 라벨은 **행동 동사** ("추가", "삭제", "저장").
- 상태 문구는 사실만 ("연결됨", "연결 실패").
