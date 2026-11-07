import type { ReactNode } from "react";

/** 导航图标：自己画的线条图标（emoji 在不同手机上长得不一样）。颜色跟随文字。 */
export type IconName = "rx" | "cabinet" | "basket" | "scale" | "leaf" | "book" | "brush" | "person";

const PATHS: Record<IconName, ReactNode> = {
  // 一张方子：折角的纸 + 两行字
  rx: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  // 中药柜：一格一格的小抽屉
  cabinet: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M4 9h16M4 15h16M12 3v18" />
      <path d="M7.5 6h1M15.5 6h1M7.5 12h1M15.5 12h1M7.5 18h1M15.5 18h1" />
    </>
  ),
  // 竹篮
  basket: (
    <>
      <path d="M3 9h18l-2 11H5z" />
      <path d="M8 9l4-6 4 6M9 13v4M15 13v4" />
    </>
  ),
  // 秤
  scale: (
    <>
      <path d="M12 4v16M8 20h8M5 7h14" />
      <path d="M5 7l-3 6h6zM19 7l-3 6h6z" />
    </>
  ),
  // 叶子
  leaf: (
    <>
      <path d="M5 19C5 11 10 5 20 5c0 10-6 15-14 15" />
      <path d="M5 19l8-8" />
    </>
  ),
  // 翻开的书
  book: (
    <>
      <path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z" />
      <path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </>
  ),
  // 毛笔（开方）
  brush: (
    <>
      <path d="M15 4l5 5-9 9-5 1 1-5z" />
      <path d="M13 6l5 5" />
    </>
  ),
  // 病人
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </>
  ),
};

export function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      data-icon={name}
    >
      {PATHS[name]}
    </svg>
  );
}
