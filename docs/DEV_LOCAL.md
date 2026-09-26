# 로컬 개발

## 준비물

- Docker Desktop
- JDK 21 (호스트에서 백엔드를 직접 돌릴 때)
- Node 22+, pnpm 10+
- iOS 시뮬레이터 또는 Android 에뮬레이터, 또는 실기기의 Expo Go (선택)

## 백엔드

```bash
./scripts/dev-up.sh          # Postgres + core 컨테이너. http://localhost:8080/api/health
./scripts/dev-up.sh --bare   # Postgres 만. 백엔드는 IDE 나 ./backend/gradlew -p backend :core:bootRun
./scripts/dev-up.sh --obs    # + Grafana/Loki/Tempo/Prometheus (otel-lgtm). http://localhost:3000
./scripts/dev-up.sh --down
```

`--obs` 는 운영과 같은 이미지·멀티테넌트 설정이다. Explore 전에 Grafana 의 Loki·Tempo 데이터소스에 Custom HTTP Header `X-Scope-OrgID: chorong` 을 추가한다 (익명 Admin 이라 바로 편집된다). 로그를 텍스트로 보려면 `./scripts/logs.sh`.

테스트는 Docker 가 떠 있어야 한다 (Testcontainers):

```bash
cd backend && ./gradlew :core:test
```

## 앱

```bash
cd mobile
pnpm install
pnpm web       # 브라우저 http://localhost:8081
pnpm ios       # iOS 시뮬레이터
pnpm android   # Android 에뮬레이터
pnpm start     # QR 코드 → Expo Go
```

`mobile/.npmrc` 의 `node-linker=hoisted` 는 지우지 않는다. pnpm 기본 레이아웃이면 웹 에셋 경로에 `.pnpm/@expo+vector-icons@...` 가 들어가고, S3 가 `+` 를 공백으로 읽어 아이콘 폰트가 404 난다.

API 주소는 `EXPO_PUBLIC_API_URL`. 기본값 `http://localhost:8080`.
실기기에서 로컬 API 를 부르려면 `mobile/.env` 에 PC 의 LAN IP 를 넣는다 (`.env.example` 참고). 백엔드 `CORS_ORIGINS` 는 웹에서만 의미가 있다.

웹 빌드 확인:

```bash
pnpm build:web   # mobile/dist/
```

## 포트

| 서비스 | 포트 |
|---|---|
| API | 8080 |
| Postgres | 5432 |
| Expo Metro / 웹 | 8081 |
| Grafana (`--obs`) | 3000 |
| OTLP HTTP / Loki / Tempo / Prometheus (`--obs`) | 4318 / 3100 / 3200 / 9090 |
