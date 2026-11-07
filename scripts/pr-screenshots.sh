#!/usr/bin/env bash
# 把截图传到 pr-assets 分支，打印可以直接贴进 PR 正文的 Markdown（规则见 CLAUDE.md「前端改动的 PR 要有截图」）。
# 截图放在单独的孤立分支上，不进 main 的历史。
#
# 用法：scripts/pr-screenshots.sh <名字，通常是分支名> <图片>...
#   例：scripts/pr-screenshots.sh fix-inventory-mobile-inputs .local/screenshots/药柜-展开卡片.png
#
# 仓库是公开的：截图只能来自本地环境（scripts/local-stack.sh）的测试数据，不能有真实病人、真实账号。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
(( $# >= 2 )) || { sed -n '2,8p' "$0" >&2; exit 1; }
NAME="$1"; shift
[[ $NAME =~ ^[A-Za-z0-9._-]+$ ]] || { echo "名字只能用字母、数字、. _ -：$NAME" >&2; exit 1; }
for f in "$@"; do
  [[ -f $f ]] || { echo "找不到 $f" >&2; exit 1; }
  case "${f,,}" in *.png|*.jpg|*.jpeg|*.gif|*.webp) ;; *) echo "只收图片：$f" >&2; exit 1 ;; esac
done

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
BRANCH=pr-assets
WT="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"; git -C "$ROOT" branch -qD "$BRANCH-tmp-$$" 2>/dev/null || true' EXIT

git -C "$ROOT" fetch -q origin "$BRANCH" 2>/dev/null || true
if git -C "$ROOT" rev-parse -q --verify "origin/$BRANCH" >/dev/null; then
  git -C "$ROOT" worktree add -q --detach "$WT" "origin/$BRANCH"
else
  git -C "$ROOT" worktree add -q --detach "$WT"
  git -C "$WT" checkout -q --orphan "$BRANCH-tmp-$$"
  git -C "$WT" rm -rq --cached . && find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  printf '# PR 截图\n\n只放 PR 正文引用的截图（scripts/pr-screenshots.sh），不是代码。\n' > "$WT/README.md"
fi

mkdir -p "$WT/$NAME"
for f in "$@"; do cp "$f" "$WT/$NAME/$(basename "$f")"; done
git -C "$WT" add -A
git -C "$WT" diff --cached --quiet || git -C "$WT" commit -qm "截图：$NAME"
out="$(git -C "$WT" push -q origin "HEAD:refs/heads/$BRANCH" 2>&1)" || { echo "$out" >&2; echo "推送到 $BRANCH 失败" >&2; exit 1; }

echo
for f in "$@"; do
  b="$(basename "$f")"
  enc="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$b")"
  echo "![${b%.*}](https://raw.githubusercontent.com/$REPO/$BRANCH/$NAME/$enc)"
done
