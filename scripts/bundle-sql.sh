#!/usr/bin/env bash
# 把所有 migration + seed 按顺序合并成一个 SQL 文件，方便粘贴到 Supabase 的 SQL Editor 一次执行。
#   scripts/bundle-sql.sh            → 输出到 .local/supabase-all.sql
# 只用于「全新的」Supabase 项目。以后新增的 migration 单独执行那一个文件即可。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/.local/supabase-all.sql}"
mkdir -p "$(dirname "$OUT")"
{
  echo "-- 由 scripts/bundle-sql.sh 生成于 $(date -Iseconds)。在全新的 Supabase 项目里一次执行。"
  echo "begin;"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo; echo "-- ===== $(basename "$f") ====="; cat "$f"
  done
  echo; echo "-- ===== seed.sql ====="; cat "$ROOT/supabase/seed.sql"
  echo; echo "commit;"
} >"$OUT"
echo "已生成 $OUT（$(wc -l <"$OUT") 行）。打开 Supabase → SQL Editor → New query，粘贴全部内容，点 Run。"
