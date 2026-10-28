#!/usr/bin/env bash
# CI 检查：已经合并到 main 的 migration 不能修改、删除或改名，只能新增；新增的文件名要排在已有文件之后。
# 用法：scripts/check-migrations.sh [基准分支，默认 origin/main]
set -euo pipefail
BASE="${1:-origin/main}"
cd "$(dirname "$0")/.."
MB="$(git merge-base "$BASE" HEAD)"

changed=$(git diff --name-only --diff-filter=MDRT "$MB" HEAD -- supabase/migrations)
if [[ -n $changed ]]; then
  echo "✘ 不能修改已上线的 migration（只能新增新文件）：" >&2
  echo "$changed" | sed 's/^/    /' >&2
  exit 1
fi

latest_old=$(git ls-tree --name-only "$MB" supabase/migrations/ | xargs -rn1 basename | sort | tail -1)
for f in $(git diff --name-only --diff-filter=A "$MB" HEAD -- supabase/migrations | xargs -rn1 basename | sort); do
  if [[ -n $latest_old && ! $f > $latest_old ]]; then
    echo "✘ 新 migration $f 排在已有的 $latest_old 前面，线上不会执行它。请改成更新的时间戳。" >&2
    exit 1
  fi
done
echo "✔ migration 检查通过（基准 ${BASE}）"
