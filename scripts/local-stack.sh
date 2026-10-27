#!/usr/bin/env bash
# 本地 Supabase-lite：Postgres + Supabase Auth + PostgREST + 极简存储网关，不需要 Docker。
#
#   scripts/local-stack.sh up      全新启动（清空旧数据）→ 跑 migration + seed → 写 web/.env.local
#   scripts/local-stack.sh down    停掉所有服务
#   scripts/local-stack.sh status
#
# 依赖：PostgreSQL 16+（initdb/pg_ctl/psql）、Node 20+、curl。不能用 root 跑（Postgres 的限制）。
# 第一次运行会把 PostgREST 和 Supabase Auth 的官方二进制下载到 .local/bin（仅支持 Linux x64）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
L="$ROOT/.local"
BIN="$L/bin"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
export PATH="${PGBIN:+$PGBIN:}$PATH"
if ! command -v initdb >/dev/null || ! command -v pg_ctl >/dev/null; then
  echo "找不到 PostgreSQL（initdb / pg_ctl）。Ubuntu 上安装：sudo apt install -y postgresql" >&2
  exit 1
fi

PG_PORT=54322 AUTH_PORT=9999 REST_PORT=3001 GW_PORT=54321
JWT_SECRET="local-dev-jwt-secret-at-least-32-characters-long"
POSTGREST_VERSION=v12.2.3
AUTH_VERSION=v2.180.0

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" -U postgres -d postgres)

download() {
  mkdir -p "$BIN"
  if [[ ! -x "$BIN/postgrest" ]]; then
    echo "下载 PostgREST $POSTGREST_VERSION …"
    curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar xJ -C "$BIN"
  fi
  if [[ ! -x "$BIN/auth/auth" ]]; then
    echo "下载 Supabase Auth $AUTH_VERSION …"
    mkdir -p "$BIN/auth"
    curl -fsSL "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" | tar xz -C "$BIN/auth"
  fi
}

jwt() { # $1 = role
  node -e '
    const c=require("crypto"),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const h=b({alg:"HS256",typ:"JWT"}),p=b({role:process.argv[1],iss:"supabase-lite",iat:1700000000,exp:2000000000});
    console.log(h+"."+p+"."+c.createHmac("sha256",process.argv[2]).update(h+"."+p).digest("base64url"));
  ' "$1" "$JWT_SECRET"
}

wait_http() { # $1 url, $2 name
  for _ in $(seq 1 60); do curl -fsS -o /dev/null "$1" 2>/dev/null && return 0; sleep 0.5; done
  echo "$2 启动超时，日志见 $L/logs/" >&2; exit 1
}

start_bg() { # $1 name, rest = command
  local name=$1; shift
  nohup "$@" >"$L/logs/$name.log" 2>&1 &
  echo $! >"$L/pids/$name"
}

down() {
  for f in "$L"/pids/*; do [[ -f $f ]] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
  [[ -d $L/pg ]] && pg_ctl -D "$L/pg" -m fast stop >/dev/null 2>&1 || true
}

up() {
  [[ $EUID -eq 0 ]] && { echo "请用普通用户运行（Postgres 不允许 root）" >&2; exit 1; }
  down
  download
  rm -rf "$L/pg" "$L/storage" "$L/logs" "$L/pids"
  mkdir -p "$L/logs" "$L/pids" "$L/storage"

  echo "启动 Postgres :$PG_PORT …"
  initdb -D "$L/pg" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
  pg_ctl -D "$L/pg" -o "-p $PG_PORT -c listen_addresses=127.0.0.1 -k $L" -l "$L/logs/postgres.log" -w start >/dev/null
  "${PSQL[@]}" -f "$ROOT/supabase/local/bootstrap.sql"

  echo "启动 Supabase Auth :$AUTH_PORT …"
  start_bg auth env \
    PORT=$AUTH_PORT API_EXTERNAL_URL="http://127.0.0.1:$GW_PORT/auth/v1" \
    GOTRUE_API_HOST=127.0.0.1 GOTRUE_SITE_URL=http://localhost:3000 \
    GOTRUE_DB_DRIVER=postgres \
    DATABASE_URL="postgres://supabase_auth_admin:local-auth-admin@127.0.0.1:$PG_PORT/postgres?sslmode=disable" \
    GOTRUE_DB_MIGRATIONS_PATH="$BIN/auth/migrations" \
    GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
    GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_DISABLE_SIGNUP=false \
    GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 GOTRUE_RATE_LIMIT_VERIFY=10000 \
    GOTRUE_LOG_LEVEL=warn \
    "$BIN/auth/auth"
  wait_http "http://127.0.0.1:$AUTH_PORT/health" "Auth"

  echo "执行 migration + seed …"
  for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
  "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"

  echo "启动 PostgREST :$REST_PORT …"
  start_bg postgrest env \
    PGRST_DB_URI="postgres://authenticator:local-authenticator@127.0.0.1:$PG_PORT/postgres" \
    PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
    PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=$REST_PORT PGRST_DB_MAX_ROWS=1000 \
    "$BIN/postgrest"
  wait_http "http://127.0.0.1:$REST_PORT/" "PostgREST"

  echo "启动网关 :$GW_PORT …"
  start_bg gateway env GATEWAY_PORT=$GW_PORT AUTH_URL="http://127.0.0.1:$AUTH_PORT" \
    REST_URL="http://127.0.0.1:$REST_PORT" STORAGE_DIR="$L/storage" JWT_SECRET="$JWT_SECRET" \
    node "$ROOT/scripts/local-gateway.mjs"
  wait_http "http://127.0.0.1:$GW_PORT/auth/v1/health" "gateway"
  sleep 0.5

  local anon service
  anon=$(jwt anon); service=$(jwt service_role)
  cat >"$L/env" <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$GW_PORT
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$service
DATABASE_URL=postgres://postgres@127.0.0.1:$PG_PORT/postgres
EOF
  if [[ ! -f "$ROOT/web/.env.local" ]] || grep -q "supabase-lite" "$ROOT/web/.env.local"; then
    { echo "# supabase-lite（scripts/local-stack.sh 自动生成，可覆盖）"; cat "$L/env"; } >"$ROOT/web/.env.local"
  fi
  echo "✅ 本地 stack 已启动：$L/env"
}

status() {
  for f in "$L"/pids/*; do [[ -f $f ]] && { n=$(basename "$f"); kill -0 "$(cat "$f")" 2>/dev/null && echo "$n: running" || echo "$n: dead"; }; done
  pg_ctl -D "$L/pg" status >/dev/null 2>&1 && echo "postgres: running" || echo "postgres: stopped"
}

case "${1:-}" in
  up) up ;;
  down) down; echo "已停止" ;;
  status) status ;;
  *) echo "用法：$0 up|down|status" >&2; exit 1 ;;
esac
