# 배포

## 워크플로우

| 파일 | 트리거 | 하는 일 |
|---|---|---|
| `backend-test.yml` | `develop`/`main` 푸시, PR (`backend/**`) | `./gradlew :core:test` (Testcontainers) |
| `deploy-backend-dev.yml` | `develop` 푸시 (`backend/**`) | Docker 이미지 → ECR → ECS `bawibase-chorong-dev` 롤링 |
| `deploy-backend-prod.yml` | `main` 푸시 (`backend/**`) | 위와 같음, prod |
| `deploy-mobile-web-dev.yml` | `develop` 푸시 (`mobile/**`) | `expo export -p web` → S3 sync → CloudFront 무효화 |
| `deploy-mobile-web-prod.yml` | `main` 푸시 (`mobile/**`) | 위와 같음, prod |

모두 `workflow_dispatch` 로 수동 실행 가능.
모든 job 은 `if: github.repository == 'bawibase/bawibase-chorong'` 로 막혀 있다. 미러 레포(`ApptiveDev/chorong`)에서는 워크플로우가 실행되지 않는다.

## GitHub Secrets

레포 `bawibase/bawibase-chorong` 의 Actions Secrets. 값은 `bawi-cloud-core/infra/environments/apps/chorong` 에서 `terraform output` 으로 확인한다. 문서에 평문으로 옮기지 않는다.

| 이름 | 출처 |
|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | output `github_actions_access_key_id` / `github_actions_secret_access_key` |
| `DB_HOST` | `core` 스택 output `db_host` |
| `DEV_DB_USER`, `PROD_DB_USER` | `svc_chorong_dev`, `svc_chorong_prod` |
| `DEV_DB_PASSWORD`, `PROD_DB_PASSWORD` | `core-db/terraform.tfvars` 에 넣은 값 |
| `DEV_CORS_ORIGINS`, `PROD_CORS_ORIGINS` | `https://chorong-dev.bawibase.com` / `https://chorong.bawibase.com` |
| `DEV_EXPO_PUBLIC_API_URL`, `PROD_EXPO_PUBLIC_API_URL` | `https://api-chorong-dev.bawibase.com` / `https://api-chorong.bawibase.com` |
| `DEV_WEB_S3_BUCKET`, `PROD_WEB_S3_BUCKET` | output `frontend_web_{dev,prod}_bucket` |
| `DEV_WEB_CF_DISTRIBUTION_ID`, `PROD_WEB_CF_DISTRIBUTION_ID` | output `frontend_web_{dev,prod}_cf_id` |

GitHub environments `development`, `production` 을 만든다. prod 는 required reviewer 를 붙여도 된다.

## 인프라 변경

```bash
cd /Users/gilteunchoi/bawibase/bawi-cloud-core/infra/environments/apps/chorong
AWS_PROFILE=bawi terraform plan
AWS_PROFILE=bawi terraform apply
```

태스크 정의 리비전은 GitHub Actions 가 만든다. Terraform 은 `task_definition` 변경을 무시한다.

## 네이티브 앱

S3/CloudFront 에는 웹 빌드만 간다. iOS/Android 바이너리는 `mobile/` 에서 EAS Build 로 만든다 (별도 설정 필요, 이 템플릿 범위 밖).
