#!/usr/bin/env bash
# 在一次性的本地 Postgres 上跑 SQL 测试（不需要 Supabase/Docker）。
# 每个 supabase/tests/*_test.sql 都在一个全新的数据库里跑（从已执行 migration + seed 的模板库复制）。
# 用法：scripts/test-db.sh [文件名过滤]     需要本机装了 postgresql；不能用 root 跑
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
FILTER="${1:-}"

TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

psqlc() { local db=$1; shift; psql -X -q -v ON_ERROR_STOP=1 -h "$TMP" -p "$PORT" -U postgres -d "$db" "$@"; }

psqlc postgres -c "create database tmpl"
psqlc tmpl -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do psqlc tmpl -f "$f"; done
psqlc tmpl -f "$ROOT/supabase/seed.sql"
psqlc tmpl -f "$ROOT/supabase/seed.sql"   # 种子可重复执行

pass=0; fail=0
for t in "$ROOT"/supabase/tests/*_test.sql; do
  name=$(basename "$t" .sql)
  [[ -n $FILTER && $name != *$FILTER* ]] && continue
  db="t_$pass$fail$RANDOM"
  psqlc postgres -c "create database $db template tmpl"
  if out=$(cd "$ROOT/supabase/tests" && psqlc "$db" -f "$t" 2>&1); then
    echo "✔ $name"; pass=$((pass+1))
  else
    echo "✘ $name"; { echo "$out" | grep -iE "ERROR|FAIL" || echo "$out" | tail -5; } | head -5 | sed 's/^/    /'; fail=$((fail+1))
  fi
done
echo "SQL tests: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
