#!/usr/bin/env bash
# 全部测试：类型检查 → lint → 单元测试 → SQL 测试 → E2E。任何一步失败就停。
# 不能用 root 跑（Postgres 的限制）。第一次在自己电脑上跑之前：cd web && npm install && npx playwright install chromium
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

cd "$ROOT/web"
step "类型检查";   npx tsc --noEmit
step "Lint";       npm run lint --silent
step "单元测试";   npx vitest run
step "SQL 测试";   "$ROOT/scripts/test-db.sh"
step "E2E";        "$ROOT/scripts/e2e.sh" "$@"
printf '\n\033[32m✅ 全部通过\033[0m\n'
