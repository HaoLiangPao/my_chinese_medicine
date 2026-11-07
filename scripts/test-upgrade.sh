#!/usr/bin/env bash
# 带数据的升级测试（docs/design/0009 §3）。CI 平时只在空库上跑 migration，线上的库是有数据的：
#   1. 用 <base>（默认 origin/main，也就是线上的版本）的 migration + seed 建库
#   2. 灌一份像线上的造出来的数据（supabase/tests/upgrade/fixture.sql，不用真实数据），拍快照
#   3. 执行这个分支新增的 migration
#   4. compare.sql：数据一条不少、库存不变、成员关系和当前药柜不变
#   5. upgrade/<migration 文件名>：这个 migration 在有数据的库上的行为（旧代码还能用、迁移正确）。
#      只在这个 migration 是「新增的」时跑，上线以后自动不跑了；没有这个文件的 migration 只做第 4 步
# 用法：scripts/test-upgrade.sh [base]     需要本机装了 postgresql；不能用 root 跑
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${1:-origin/main}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
export PATH="${PGBIN:+$PGBIN:}$PATH"
command -v initdb >/dev/null || { echo "找不到 PostgreSQL（initdb）。Ubuntu 上安装：sudo apt install -y postgresql" >&2; exit 1; }
git -C "$ROOT" rev-parse --verify -q "$BASE^{commit}" >/dev/null || { echo "找不到 $BASE（先 git fetch）" >&2; exit 1; }

# fixture 用的是 base 上的函数和表；base 还没有 fixture 时用当前分支的
new=()
for f in "$ROOT"/supabase/migrations/*.sql; do
  name="supabase/migrations/$(basename "$f")"
  git -C "$ROOT" cat-file -e "$BASE:$name" 2>/dev/null || new+=("$f")
done
if (( ${#new[@]} == 0 )); then
  echo "升级测试：相对 $BASE 没有新的 migration，跳过"
  exit 0
fi

TMP="$(mktemp -d)"   # 用系统临时目录：Unix socket 路径不能超过 107 字节
PORT="${PGPORT_UPGRADE:-54330}"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
initdb -D "$TMP/data" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
psqlc() { psql -X -q -v ON_ERROR_STOP=1 -h "$TMP" -p "$PORT" -U postgres -d postgres "$@"; }

echo "升级测试：$BASE → 当前分支（新 migration：$(printf '%s ' "${new[@]##*/}")）"
psqlc -f "$ROOT/supabase/tests/auth_stub.sql"
for name in $(git -C "$ROOT" ls-tree --name-only "$BASE" supabase/migrations/ | sort); do
  git -C "$ROOT" show "$BASE:$name" | psqlc >/dev/null
done
git -C "$ROOT" show "$BASE:supabase/seed.sql" | psqlc >/dev/null

cd "$ROOT/supabase/tests/upgrade"
psqlc -f fixture.sql >/dev/null
psqlc -f snapshot.sql
for f in "${new[@]}"; do psqlc -f "$f" >/dev/null; done
psqlc -f compare.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
for f in "${new[@]}"; do
  b="$(basename "$f")"
  if [[ -f $b ]]; then psqlc -f "$b" >/dev/null; echo "  ✔ $b"; fi
done
echo "✔ 升级测试通过"
