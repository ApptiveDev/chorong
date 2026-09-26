# 아키텍처

```
브라우저 ──▶ CloudFront (chorong[-dev].bawibase.com) ──▶ S3 (expo export -p web 산출물)
                                                            │
Expo Go / 네이티브 앱 ─────────────────────────────────────┤  EXPO_PUBLIC_API_URL
                                                            ▼
                       ALB (api-chorong[-dev].bawibase.com, host-header 룰 94/95)
                                                            │
                                                            ▼
                       ECS Fargate  bawibase-chorong-{dev,prod}  (core, :8080)
                                                            │
                                                            ▼
                       RDS bawi-sandbox-postgres / appdb / 스키마 chorong_{dev,prod}
```

## 구성 요소

- **mobile/** Expo 앱 한 벌로 iOS·Android·웹을 만든다. 웹에서는 `src/components/WebFrame.tsx` 가 화면을 480px 컬럼으로 중앙 정렬한다 (jimba-service `#root` 패턴). 하단 독은 `app/(tabs)/_layout.tsx` 의 `dockItems` 배열 (홈·퀴즈·소셜·더보기). 더보기 → `app/settings/*` 는 탭 밖 Stack 화면이라 독이 사라지고 뒤로가기 헤더가 붙는다. 웹 빌드는 `web.output: static` 이라 라우트별 HTML 이 나오고, CloudFront 가 403/404 를 `index.html` 로 돌려 클라이언트 라우팅을 받는다.
- **backend/core/** Spring Boot API. 인증 없음 (샘플). CORS 허용 오리진은 `CORS_ORIGINS` 환경변수. API 문서는 `/docs` (Scalar UI, 스펙은 springdoc 이 `/api-docs` 로 생성).
- **DB** 앱별 RDS 를 만들지 않는다. 공유 RDS 에 스키마·계정만 추가한다 (`bawi-cloud-core/infra/environments/core-db`).
- **ALB·ECS 클러스터·VPC** 는 `bawi-cloud-core/infra/environments/core` 의 공유 자원을 쓴다. 앱별로는 타깃 그룹·리스너 룰·태스크 정의·서비스만 만든다.

## 환경 분리

| | dev | prod |
|---|---|---|
| 브랜치 | `develop` | `main` |
| GitHub environment | `development` | `production` |
| ECR | `bawibase-chorong-backend-dev` | `bawibase-chorong-backend-prod` |
| ECS 서비스 | `bawibase-chorong-dev` | `bawibase-chorong-prod` |
| DB 스키마 | `chorong_dev` | `chorong_prod` |
| S3 버킷 | `bawibase-chorong-web-dev-frontend` | `bawibase-chorong-web-prod-frontend` |

Spring 프로파일은 나누지 않는다. `application.yml` 하나에 환경변수 기본값을 두고, 배포 시 GitHub Actions 가 값을 덮어쓴다.
