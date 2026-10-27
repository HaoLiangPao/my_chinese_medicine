#!/usr/bin/env bash
# 一键 E2E：启动本地 Supabase-lite → 用它的配置构建 Next.js → 跑 Playwright。
#   scripts/e2e.sh                 全部
#   scripts/e2e.sh --project=isolated   只跑某个 project（参数原样传给 playwright test）
# 第一次在自己电脑上跑之前：cd web && npx playwright install chromium
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/local-stack.sh" up
cd "$ROOT/web"
npx next build >"$ROOT/.local/logs/next-build.log" 2>&1 || { tail -30 "$ROOT/.local/logs/next-build.log"; exit 1; }
set +e
npx playwright test "$@"
code=$?
set -e
[[ "${KEEP_STACK:-}" == "1" ]] || "$ROOT/scripts/local-stack.sh" down >/dev/null
exit $code
