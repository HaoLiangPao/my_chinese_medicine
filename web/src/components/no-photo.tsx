import type { ReactNode } from "react";

/**
 * 没有照片时的占位（docs/design/0010 §4.1）：一句「暂时没有照片」。对任何药材都能用（不带药名）；children 放在文字下面（比如「拍一张上传」）。
 * 不再画鞠躬的小学徒：详情页下面已经有干活的小学徒，没照片时页面上只留一个（docs/design/0019 §9.6）。
 */
export function NoPhoto({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-card px-3 py-2" data-testid="no-photo">
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-medium">暂时没有照片</p>
        <p className="text-xs text-muted">这味药还没有核对过的照片，见谅。</p>
        {children}
      </div>
    </div>
  );
}
