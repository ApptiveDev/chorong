#!/usr/bin/env bash
# core 컨테이너의 ECS JSON 로그를 한 줄 텍스트로 본다: 시각, 레벨, requestId, 메시지
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose logs -f --no-log-prefix core |
  jq -r 'select(type == "object") | [."@timestamp", ."log.level", .requestId // "-", .message] | @tsv' 2>/dev/null
