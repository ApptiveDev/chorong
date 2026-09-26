# 로깅 규칙과 LGTM 연동 계획

상태: 반영 완료 (2026-09-26).

## 배경

백엔드에 로그 호출이 없다. 인증·구매처럼 되돌릴 수 없는 사건과 실패를 추적할 수단이 없다.
`bawi-cloud-core` 에 공용 옵저버빌리티 스택이 있다 (`grafana/otel-lgtm` 단일 태스크, `notes/2026-09-26-observability-lgtm.md`). 앱은 OTLP 를 `http://lgtm.bawi-observability.local:4318` 로 보낸다. 보안그룹은 기존 `ecs-tasks-sg` 그대로다.
dev·prod 는 둘 다 ECS Fargate. 환경 차이는 배포 워크플로우(`.github/workflows/deploy-backend-{dev,prod}.yml`) 가 태스크 정의에 넣는 환경변수만이다.

목표
1. 로그·트레이스·메트릭을 OTLP 로 LGTM 에 보낸다. stdout JSON 은 지금처럼 CloudWatch 에도 남는다.
2. 로그 양식은 로컬·dev·prod 모두 ECS JSON 한 가지. Spring 프로파일 분기 없음.
3. 무엇을 어느 레벨로 남기는지 규칙을 AGENTS.md 에 고정한다.

## 로깅 규칙 (AGENTS.md 에 넣을 내용)

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
- 식별자는 `userId` 만. `traceId`·`spanId` 는 Micrometer 가, `requestId` 는 필터가 MDC 에 넣는다. 코드에서 직접 쓰지 않는다.
- 도구: SLF4J `LoggerFactory.getLogger(javaClass)`. 출력은 ECS JSON 한 가지. 프로파일로 양식을 바꾸지 않는다.
- 장애 신고는 응답 헤더 `X-Request-Id` 값으로 받는다.

## 새 의존성

모두 Spring Boot BOM 이 버전을 관리한다. 마지막 하나만 버전을 명시한다.

| 의존성 | 용도 |
|---|---|
| `spring-boot-starter-actuator` | Observation·Tracing·OTLP 자동구성 전제 |
| `io.micrometer:micrometer-tracing-bridge-otel` | 트레이스 생성, MDC traceId/spanId |
| `io.opentelemetry:opentelemetry-exporter-otlp` | 트레이스·로그 OTLP 전송 |
| `io.micrometer:micrometer-registry-otlp` | 메트릭 OTLP 전송 |
| `io.opentelemetry.instrumentation:opentelemetry-logback-appender-1.0` (alpha) | Logback → OTel 로그 |

actuator HTTP 엔드포인트는 전부 끈다. 헬스는 `/api/health` 유지. 메트릭은 push 라 노출이 필요 없다.

## 변경 목록

### 설정 `backend/core/src/main/resources/application.yml`

```yaml
logging:
  structured:
    format.console: ecs
    ecs.service:
      name: chorong-api
      environment: ${APP_ENV:local}
  level.root: INFO

management:
  endpoints.web.exposure.exclude: "*"
  opentelemetry.resource-attributes:
    service.name: chorong-api
    deployment.environment: ${APP_ENV:local}
  tracing.sampling.probability: 1.0
  otlp:
    tracing:
      endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT:http://localhost:4318}/v1/traces
      export.enabled: ${OTEL_ENABLED:false}
    logging:
      endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT:http://localhost:4318}/v1/logs
      export.enabled: ${OTEL_ENABLED:false}
    metrics.export:
      url: ${OTEL_EXPORTER_OTLP_ENDPOINT:http://localhost:4318}/v1/metrics
      enabled: ${OTEL_ENABLED:false}
      step: 30s
```

환경변수는 `APP_ENV`, `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TENANT` 넷. 기본은 꺼짐이라 테스트와 bootRun 은 컬렉터 없이 돈다.
테스트는 `src/test/resources/logback-test.xml` 로 텍스트 로그를 본다.

### 테넌트 헤더

공용 스택의 Loki·Tempo 는 멀티테넌트 모드다. 트레이스·로그 OTLP 요청에 `X-Scope-OrgID: chorong` 헤더를 붙인다 (`management.otlp.{tracing,logging}.headers`). 값은 `OTEL_TENANT`, 기본 `chorong`. 메트릭은 Prometheus 를 공유하므로 헤더가 없다. Grafana 에서는 chorong 조직의 데이터소스가 같은 헤더를 붙여 조회한다.

메트릭 시간 단위는 `base-time-unit: seconds` 로 Prometheus 관례(`http_server_requests_seconds_count`)에 맞춘다. 기본값은 밀리초다.

### Logback `src/main/resources/logback-spring.xml`

Boot 기본 include (`defaults.xml`, `structured-console-appender.xml`) 에 `OpenTelemetryAppender` (`captureMdcAttributes=*`) 를 더해 root INFO 에 둘 다 붙인다.
`config/OpenTelemetryAppenderInitializer.kt` 가 `OpenTelemetry` 빈으로 `OpenTelemetryAppender.install()` 을 한 번 호출한다.

### MDC

- `config/RequestIdFilter.kt`: `X-Request-Id` 헤더가 있으면 쓰고 없으면 UUID 생성. `MDC.put("requestId")`, 응답 헤더 echo, `finally` 에서 제거.
- `CurrentUserIdResolver.resolveArgument` 에서 `MDC.put("userId")`.
- `SecurityConfig` CORS `exposedHeaders` 에 `X-Request-Id`.

### 로그 지점

| 위치 | 레벨 | 메시지 |
|---|---|---|
| `AuthService.guestSignUp`, `passwordSignUp` | INFO | `user.created userId= provider=` |
| `AuthService.passwordLogin` 잠금 | WARN | `auth.locked userId= until=` |
| `AuthService.passwordLogin` 실패 | DEBUG | `auth.login_failed provider=PASSWORD` |
| `AuthService.socialLogin` 연결 | INFO | `auth.linked userId= provider=` |
| `TokenService.rotate` 폐기·만료 토큰 재사용 | WARN | `auth.refresh_rejected userId=` |
| `TokenService.revoke` 전체 폐기 | INFO | `auth.logout_all userId= count=` |
| `HousingShopService.purchase` | INFO | `shop.purchased userId= itemId= price= balance=` |
| `HousingService.ensureProfile` 신규 | INFO | `housing.profile_created userId=` |
| `ApiExceptionHandler.handleApi` | WARN (UNAUTHORIZED 종류는 DEBUG) | `api.rejected code= path=` |
| `ApiExceptionHandler` `Exception::class` 핸들러 (신규) | ERROR + 스택 | `api.failed path=` → 500 `{"code":"INTERNAL"}` |

### 배포 환경변수 `.github/workflows/deploy-backend-{dev,prod}.yml`

```
APP_ENV=dev                       # prod 는 prod
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://lgtm.bawi-observability.local:4318
OTEL_TENANT=chorong
JWT_SECRET=${{ secrets.DEV_JWT_SECRET }}   # prod 는 PROD_JWT_SECRET
```

- `JWT_SECRET` 은 인증 도입 커밋(e7fc1d6)에서 빠져 있다. 없으면 `application.yml` 의 dev 기본값으로 뜬다. GitHub Secrets `DEV_JWT_SECRET`, `PROD_JWT_SECRET` 을 만들고 `DEPLOY.md` 표에 추가한다.
- `SPRING_PROFILES_ACTIVE=prod` 는 dev 워크플로우에도 있고 프로파일 파일이 없어 효과가 없다. 제거한다.
- 인프라 변경 없음.

### 로컬 `docker-compose.yml`, `scripts/`

- `lgtm` 서비스 (profile `obs`): `grafana/otel-lgtm:0.34.0`, 포트 3000·4318·3100·3200·9090, 익명 접근 허용. 운영과 같은 이미지, 같은 멀티테넌트 설정(`LOKI_EXTRA_ARGS`, `TEMPO_EXTRA_ARGS`, Collector 헤더 전달 overlay).
- `core` env: `APP_ENV=local`, `OTEL_ENABLED=${OTEL_ENABLED:-false}`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://lgtm:4318`.
- `dev-up.sh --obs`: `--profile stack --profile obs` 로 띄우고 `OTEL_ENABLED=true`. 완료 메시지에 `http://localhost:3000`.
- `scripts/logs.sh`: `docker compose logs -f core | jq -r '[."@timestamp", ."log.level", .requestId // "-", .message] | @tsv'`.

### 문서

- `ARCHITECTURE.md`: 로그·트레이스·메트릭 경로 (stdout→CloudWatch, OTLP→`grafana.bawibase.com`).
- `DEV_LOCAL.md`: `--obs`, `logs.sh`, Grafana 로컬 주소.
- `DEPLOY.md`: 새 env·secret.

## 건드리지 않는 것

`bawi-cloud-core` 인프라, Spring 프로파일 파일, OTel Java agent, CloudWatch 로그 그룹 보존 기간.

## 검증

1. `backend/`: `./gradlew spotlessApply test`. 기존 15개 + `RequestIdFilter` 테스트 1개. OTEL 꺼진 상태로 컨텍스트가 뜬다.
2. `./scripts/dev-up.sh --obs` 후 `curl -i localhost:8080/api/health` 응답에 `X-Request-Id`.
3. 비회원 가입 요청 후 `scripts/logs.sh` 에 `user.created userId=1 provider=GUEST` 한 줄. JSON 원문에 `traceId`, `requestId`, `service.environment=local`.
4. `http://localhost:3000` Explore → Loki `{service_name="chorong-api"}` 에 같은 줄. 로그의 Tempo 링크로 트레이스가 열린다. Prometheus 에 `http_server_requests_seconds_count` 가 있다. 로컬 Grafana 의 Loki·Tempo 데이터소스에는 Custom HTTP Header `X-Scope-OrgID: chorong` 을 먼저 추가한다. API 로 직접 볼 때도 같은 헤더: `curl -H 'X-Scope-OrgID: chorong' 'localhost:3100/loki/api/v1/query_range?query={service_name="chorong-api"}'`.
5. `docker compose logs core | grep -iE 'password|bearer|@test'` 결과 없음.
6. dev 배포 후 `grafana.bawibase.com` 에서 `deployment_environment="dev"` 로 같은 확인. 배포는 작업 전체 종료 후 1회.

## 참고

- [Structured logging in Spring Boot 3.4](https://spring.io/blog/2024/08/23/structured-logging-in-spring-boot-3-4/)
- [Spring Boot Reference: Tracing](https://docs.spring.io/spring-boot/reference/actuator/tracing.html)
- [Spring Boot Reference: Observability](https://docs.spring.io/spring-boot/reference/actuator/observability.html)
- [mhalbritter/spring-boot-with-otlp](https://github.com/mhalbritter/spring-boot-with-otlp/blob/main/README.md): Logback `OpenTelemetryAppender` + Boot OTLP logging 예제
- [IK.AM: Logback + OTLP 로그 전송](https://ik.am/entries/892/en)
- [spring.io: Let's use OpenTelemetry with Spring](https://spring.io/blog/2024/10/28/lets-use-opentelemetry-with-spring/)
- [Grafana: trace to logs correlation](https://grafana.com/docs/grafana/latest/datasources/tempo/configure-tempo-data-source/configure-trace-to-logs/)
- [AWS: awslogs 드라이버](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html)
