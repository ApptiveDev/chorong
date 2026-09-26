# chorong

React Native(Expo) 앱 + Spring Boot Kotlin API 조합의 팀 표준 템플릿.

| 구성 | 경로 | 스택 |
|---|---|---|
| API | `backend/core/` | Spring Boot 3.4 · Kotlin 2.4 · JDK 21 · PostgreSQL · Flyway |
| 앱 | `mobile/` | Expo SDK 57 · expo-router · React Native 0.86 · react-native-web |

## 도메인

| 대상 | dev | prod |
|---|---|---|
| web (Expo 웹 빌드) | `chorong-dev.bawibase.com` | `chorong.bawibase.com` |
| API | `api-chorong-dev.bawibase.com` | `api-chorong.bawibase.com` |

iOS/Android 는 Expo Go(개발) 또는 EAS Build 로 배포한다. S3+CloudFront 에는 웹 빌드만 올라간다.

## 로컬 실행

```bash
./scripts/dev-up.sh        # Postgres + API 컨테이너, http://localhost:8080
cd mobile && pnpm install
pnpm web                   # 브라우저 http://localhost:8081
pnpm start                 # QR → Expo Go
```

자세히는 [docs/DEV_LOCAL.md](docs/DEV_LOCAL.md).

## 배포

dev 는 `develop` 푸시, prod 는 `main` 푸시. 워크플로우와 시크릿은 [docs/DEPLOY.md](docs/DEPLOY.md).
인프라는 [`bawibase/bawi-cloud-core`](https://github.com/bawibase/bawi-cloud-core) `infra/environments/apps/chorong/`.

## 화면 구조

- 하단 독 4개: 홈, 퀴즈, 소셜, 더보기
- 더보기 메뉴 5개: 프로필, 내 정보, 고객 문의, 앱 정보, 개발자 도구 (`app/settings/`). 개발자 도구에 메모 CRUD 샘플이 있다
- 웹은 480px 모바일 컬럼으로 중앙 정렬 (`src/components/WebFrame.tsx`)

## 샘플 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | `{"status":"ok"}` |
| GET | `/api/notes` | 메모 목록 (최신순) |
| POST | `/api/notes` | 메모 생성 `{title, body?}` |
| GET | `/api/notes/{id}` | 메모 조회 |
| PUT | `/api/notes/{id}` | 메모 수정 |
| DELETE | `/api/notes/{id}` | 메모 삭제 |
