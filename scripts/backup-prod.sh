#!/usr/bin/env bash
# 把生产数据库导出一份到本地 backups/（已在 .gitignore 里，里面有病人信息，不能提交）。
# 设计见 docs/design/0009 §4。
#
# 用法：
#   scripts/backup-prod.sh            导出一份，并删掉 KEEP_DAYS 天以前的
#   KEEP_DAYS=60 scripts/backup-prod.sh
#
# 连接串放在仓库外面：~/.config/my-chinese-medicine/backup.env（权限 600）
#   PROD_DB_URL='postgresql://postgres.<project-ref>:<密码>@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
# 密码在 Supabase → Project Settings → Database。用 5432（session 模式），不要用 6543。
#
# 恢复（先在本地试，不要直接恢复到线上）。导出用的是 pg_dump 18，恢复也要用 pg_restore 18+：
#   pg_restore --list backups/<文件>.dump          看里面有什么
#   pg_restore -d <本地库> --schema=public --schema=auth backups/<文件>.dump   （public 的外键指向 auth.users）
#
# 注意：拍照识别的原始照片在 Supabase Storage 里，不在数据库里，这个脚本不导出照片。
set -euo pipefail
umask 077

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CONF=${BACKUP_ENV:-$HOME/.config/my-chinese-medicine/backup.env}
OUT_DIR=${BACKUP_DIR:-$ROOT/backups}
KEEP_DAYS=${KEEP_DAYS:-30}
[[ $KEEP_DAYS =~ ^[1-9][0-9]*$ ]] || { echo "KEEP_DAYS 要是正整数：$KEEP_DAYS" >&2; exit 1; }

if [[ -z ${PROD_DB_URL:-} ]]; then
  [[ -f $CONF ]] || { echo "缺少 $CONF（里面写 PROD_DB_URL=...，见脚本开头）" >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$CONF"
fi
[[ -n ${PROD_DB_URL:-} ]] || { echo "$CONF 里没有 PROD_DB_URL" >&2; exit 1; }

mkdir -p "$OUT_DIR"
stamp=$(date +%Y-%m-%d_%H%M%S)
file="$OUT_DIR/prod-$stamp.dump"
# 中途失败时删掉半截文件（里面也有病人信息）
trap 'rm -f "$file.partial"' EXIT

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

find "$OUT_DIR" -maxdepth 1 -type f -name 'prod-*.dump' -mtime "+$KEEP_DAYS" -print -delete
echo "已导出：$file（$(du -h "$file" | cut -f1)）"
