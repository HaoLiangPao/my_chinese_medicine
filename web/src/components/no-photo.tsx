import type { ReactNode } from "react";
import { BowingApprentice } from "@/components/art/apprentice";

/**
 * 没有照片时的占位图（docs/design/0010 §4.1）：小学徒在鞠躬（素材库 components/art，docs/design/0019）。颜色跟着浅色 / 深色主题走。
 * 对任何药材都能用（不带药名）；children 放在文字下面（比如 PR 2 的「拍一张上传」）。
 */
export function NoPhoto({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-line bg-card px-3 py-2" data-testid="no-photo">
      <BowingApprentice className="h-20 w-20 shrink-0" />
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-medium">暂时没有照片</p>
        <p className="text-xs text-muted">这味药还没有核对过的照片，见谅。</p>
        {children}
      </div>
    </div>
  );
}
