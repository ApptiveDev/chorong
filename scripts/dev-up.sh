#!/usr/bin/env bash
# 로컬 스택(Postgres + core)을 docker compose 로 띄우고 API 헬스를 기다린다.
#
# 사용법:
#   ./scripts/dev-up.sh          # Postgres + core 컨테이너
#   ./scripts/dev-up.sh --bare   # Postgres 만. core 는 `./backend/gradlew -p backend :core:bootRun`
#   ./scripts/dev-up.sh --obs    # + Grafana/Loki/Tempo (otel-lgtm). 로그·트레이스를 http://localhost:3000 에서 본다
#   ./scripts/dev-up.sh --down   # 전부 내린다

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="stack"
OBS="false"
for arg in "$@"; do
  case "$arg" in
    --bare) MODE="bare" ;;
    --obs) OBS="true" ;;
    --down) MODE="down" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -20
      exit 0
      ;;
  esac
done

if [[ "$MODE" == "down" ]]; then
  echo "▸ 스택 종료"
  docker compose --profile stack --profile obs down
  exit 0
fi

echo "▸ Docker: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'NOT RUNNING')"

if [[ "$MODE" == "bare" ]]; then
  echo "▸ Postgres 만 기동"
  docker compose up -d postgres
  echo
  echo "✔  Postgres :5432 (dev/dev/appdb)."
  echo "   백엔드는 호스트에서: ./backend/gradlew -p ./backend :core:bootRun"
  exit 0
fi

if [[ "$OBS" == "true" ]]; then
  echo "▸ 빌드 + 기동 (postgres + core + lgtm)"
  OTEL_ENABLED=true docker compose --profile stack --profile obs up -d --build
else
  echo "▸ 빌드 + 기동 (postgres + core)"
  docker compose --profile stack up -d --build
fi

echo -n "▸ API 헬스 대기"
for i in $(seq 1 40); do
  if curl -fs http://localhost:8080/api/health >/dev/null 2>&1; then
    echo " ✔"
    break
  fi
  echo -n "."
  sleep 1
  if [[ "$i" == "40" ]]; then
    echo " ✗"
    echo "   API 가 뜨지 않았다. 최근 로그:"
    docker compose logs --tail=40 core
    exit 1
  fi
done

echo
echo "──────────────────────────────────────────────────────────"
echo " 로컬 스택 준비 완료"
echo "──────────────────────────────────────────────────────────"
echo " API      : http://localhost:8080"
echo " Postgres : localhost:5432 (dev/dev/appdb, 스키마 chorong_dev)"
if [[ "$OBS" == "true" ]]; then
  echo " Grafana  : http://localhost:3000 (Loki·Tempo 데이터소스에 X-Scope-OrgID: chorong 헤더를 추가한다)"
  echo " 로그     : ./scripts/logs.sh"
fi
echo
echo " 앱 실행:"
echo "   cd mobile && pnpm install"
echo "   pnpm web        → http://localhost:8081 (브라우저)"
echo "   pnpm start      → QR 로 Expo Go (실기기는 .env 의 EXPO_PUBLIC_API_URL 을 LAN IP 로)"
echo
echo " 내리기: ./scripts/dev-up.sh --down"
echo "──────────────────────────────────────────────────────────"
