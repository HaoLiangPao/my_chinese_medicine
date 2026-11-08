#!/usr/bin/env bash
# 把生产数据库导出一份到本地 backups/（已在 .gitignore 里，里面有病人信息，不能提交）。
# 设计见 docs/design/0009 §4。
#
# 用法：
#   scripts/backup-prod.sh            导出一份，并删掉 KEEP_DAYS 天以前的
#   KEEP_DAYS=60 scripts/backup-prod.sh
#
# 两种方式，自动选：
# 1) 有连接串（环境变量 PROD_DB_URL，或 ~/.config/my-chinese-medicine/backup.env，权限 600）→ pg_dump，得到 prod-<时间>.dump
#      PROD_DB_URL='postgresql://postgres.<project-ref>:<密码>@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
#    密码在 Supabase → Project Settings → Database。用 5432（session 模式），不要用 6543。
# 2) 没有连接串 → 用已经登录、已经 link 到线上项目的 Supabase CLI（`supabase login` + `supabase link`，不用数据库密码），
#    得到 prod-<时间>-schema.sql 和 prod-<时间>-data.sql。需要 Docker（CLI 在容器里跑 pg_dump）。
#    在 crontab 里跑时，cron 的 PATH 很短，可能找不到 npx / docker，CLI 的登录也可能读不到：先手动在 cron 环境试一次，或者用方式 1。
#
# 恢复（先在本地试，不要直接恢复到线上）：
#   .dump：导出用的是 pg_dump 18，恢复也要用 pg_restore 18+
#     pg_restore --list backups/<文件>.dump          看里面有什么
#     pg_restore -d <本地库> --schema=public --schema=auth backups/<文件>.dump   （public 的外键指向 auth.users）
#   .sql：恢复到一个新建的空库（普通 Postgres 就行），用超级用户按顺序跑：
#     psql -d <本地空库> -f scripts/backup-restore-prep.sql    补上 Supabase 自带的角色、schema、扩展
#     psql -d <本地空库> -f backups/<文件>-schema.sql           public、auth、storage 三个 schema 的结构
#     psql -d <本地空库> -f backups/<文件>-data.sql             数据（开头关掉了外键检查：herbs 表有指向自己的外键）
#
# 注意：拍照识别的原始照片在 Supabase Storage 里，不在数据库里，这个脚本不导出照片。
set -euo pipefail
umask 077

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CONF=${BACKUP_ENV:-$HOME/.config/my-chinese-medicine/backup.env}
OUT_DIR=${BACKUP_DIR:-$ROOT/backups}
KEEP_DAYS=${KEEP_DAYS:-30}
[[ $KEEP_DAYS =~ ^[1-9][0-9]*$ ]] || { echo "KEEP_DAYS 要是正整数：$KEEP_DAYS" >&2; exit 1; }

if [[ -z ${PROD_DB_URL:-} && -f $CONF ]]; then
  # shellcheck disable=SC1090
  source "$CONF"
  [[ -n ${PROD_DB_URL:-} ]] || { echo "$CONF 里没有 PROD_DB_URL" >&2; exit 1; }
fi

mkdir -p "$OUT_DIR"
stamp=$(date +%Y-%m-%d_%H%M%S)
# 中途失败时删掉半截文件（里面也有病人信息）
partials=()
trap 'rm -f "${partials[@]}"' EXIT

if [[ -n ${PROD_DB_URL:-} ]]; then
  file="$OUT_DIR/prod-$stamp.dump"
  partials=("$file.partial")
  # public：业务数据；auth：账号（业务表的 user_id 指向它）；storage：照片的元数据
  pg_dump "$PROD_DB_URL" \
    --format=custom --no-owner --no-privileges \
    --schema=public --schema=auth --schema=storage \
    --file="$file.partial"
  mv "$file.partial" "$file"

  # 检查导出的文件能读、里面有业务表
  # 先存下来再 grep：grep -q 提前退出会让 pg_restore 收到 SIGPIPE，pipefail 下误报失败
  toc=$(pg_restore --list "$file")
  grep -q "TABLE DATA public prescriptions" <<<"$toc" \
    || { echo "导出的文件里没有 prescriptions 表的数据，检查一下：$file" >&2; exit 1; }
  outputs=("$file")
else
  # 线上项目的 ref 以 CI 配置为准；CLI link 到别的项目时不能当成线上备份
  prod_ref=$(sed -n 's/^ *SUPABASE_PROJECT_REF: *//p' "$ROOT/.github/workflows/ci-cd.yml")
  linked_ref=$(cat "$ROOT/supabase/.temp/project-ref" 2>/dev/null || true)
  [[ -n $linked_ref ]] \
    || { echo "没有连接串（$CONF），Supabase CLI 也没有 link 到项目。二选一：写 $CONF，或者跑 supabase login && supabase link --project-ref $prod_ref" >&2; exit 1; }
  [[ -n $prod_ref && $linked_ref == "$prod_ref" ]] \
    || { echo "Supabase CLI link 的是 $linked_ref，不是线上项目（${prod_ref:-ci-cd.yml 里没找到}）" >&2; exit 1; }
  command -v docker >/dev/null || { echo "用 Supabase CLI 导出需要 Docker" >&2; exit 1; }
  echo "没有 $CONF，改用 Supabase CLI 导出（项目 $linked_ref）" >&2
  schema="$OUT_DIR/prod-$stamp-schema.sql"
  data="$OUT_DIR/prod-$stamp-data.sql"
  partials=("$schema.partial" "$data.partial")
  supabase=(npx -y supabase@2.122.0 --workdir "$ROOT")
  # 三个 schema 的结构放在一个文件里：storage 的 RLS 用到 public.is_member，pg_dump 会排好先后顺序
  "${supabase[@]}" db dump --linked --schema public,auth,storage -f "$schema.partial"
  "${supabase[@]}" db dump --linked --data-only --schema public,auth,storage -f "$data.partial"
  mv "$schema.partial" "$schema"
  mv "$data.partial" "$data"

  grep -q 'CREATE TABLE IF NOT EXISTS "public"."prescriptions"' "$schema" \
    && grep -q 'CREATE TABLE IF NOT EXISTS "auth"."users"' "$schema" \
    || { echo "导出的结构里没有 prescriptions 或 auth.users 表，检查一下：$schema" >&2; exit 1; }
  grep -q 'INSERT INTO "public"."prescriptions"' "$data" \
    || { echo "导出的数据里没有 prescriptions 表的数据，检查一下：$data" >&2; exit 1; }
  outputs=("$schema" "$data")
fi

find "$OUT_DIR" -maxdepth 1 -type f \( -name 'prod-*.dump' -o -name 'prod-*-schema.sql' -o -name 'prod-*-data.sql' \) \
  -mtime "+$KEEP_DAYS" -print -delete
for f in "${outputs[@]}"; do
  echo "已导出：$f（$(du -h "$f" | cut -f1)）"
done
