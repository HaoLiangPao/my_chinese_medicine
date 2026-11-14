import type { ReactNode } from "react";

/**
 * 没有照片时的占位图（docs/design/0010 §4.1）：一个穿长衫、戴小帽的药童在鞠躬。我们自己画的，颜色跟着浅色 / 深色主题走。
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

function BowingApprentice({ className }: { className?: string }) {
  // 脸、帽子、鞋用固定颜色：深色模式下 --ink 是浅色，画在脸上看不清
  const skin = "#f2d3b1";
  const dark = "#3b322b";
  return (
    <svg viewBox="0 0 120 112" className={className} role="img" aria-label="鞠躬的小药童">
      {/* 影子 */}
      <ellipse cx="58" cy="104" rx="30" ry="4" fill="var(--line)" />
      {/* 长衫下摆和鞋 */}
      <path d="M44 70 L72 70 L80 101 L36 101 Z" fill="var(--jade)" />
      <path d="M58 72 L58 101" stroke="var(--card)" strokeWidth="1.5" opacity="0.6" />
      <ellipse cx="44" cy="102" rx="7" ry="3" fill={dark} stroke="var(--ink)" strokeWidth="0.8" />
      <ellipse cx="72" cy="102" rx="7" ry="3" fill={dark} stroke="var(--ink)" strokeWidth="0.8" />
      {/* 上半身往前鞠躬 */}
      <g transform="rotate(-28 58 72)">
        <rect x="44" y="42" width="28" height="32" rx="11" fill="var(--jade)" />
        <path d="M51 44 L58 54 L65 44" fill="none" stroke="var(--card)" strokeWidth="2" strokeLinejoin="round" />
        <rect x="44" y="64" width="28" height="4" rx="2" fill="var(--amber)" />
        {/* 拱手：两只袖子合在胸前 */}
        <ellipse cx="51" cy="57" rx="7" ry="5" fill="var(--jade)" stroke="var(--card)" strokeWidth="1.2" />
        <ellipse cx="65" cy="57" rx="7" ry="5" fill="var(--jade)" stroke="var(--card)" strokeWidth="1.2" />
        <circle cx="58" cy="56" r="4.5" fill={skin} />
        {/* 头 */}
        <circle cx="58" cy="28" r="15" fill={skin} stroke="var(--ink)" strokeWidth="1.2" />
        {/* 小帽 */}
        <path d="M43 26 A15 15 0 0 1 73 26 Z" fill={dark} stroke="var(--ink)" strokeWidth="1.2" />
        <circle cx="58" cy="11.5" r="3" fill="var(--cinnabar)" />
        {/* 闭着眼笑 */}
        <path d="M50 31 q3 3 6 0 M60 31 q3 3 6 0" fill="none" stroke={dark} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="48" cy="35" r="2.5" fill="var(--cinnabar)" opacity="0.35" />
        <circle cx="68" cy="35" r="2.5" fill="var(--cinnabar)" opacity="0.35" />
        <path d="M55 37 q3 2.5 6 0" fill="none" stroke={dark} strokeWidth="1.2" strokeLinecap="round" />
      </g>
      {/* 一片叶子 */}
      <path d="M92 26 q10 -8 18 0 q-8 8 -18 0 Z" fill="var(--jade)" opacity="0.7" />
      <path d="M92 26 L108 26" stroke="var(--card)" strokeWidth="1" opacity="0.8" />
    </svg>
  );
}
