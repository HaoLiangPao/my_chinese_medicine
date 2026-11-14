import type { ReactNode } from "react";
import { ORIGIN_LABELS, PART_LABELS, UNCLASSIFIED_LABEL, type HerbKind, type HerbKindIconName } from "@/lib/herb-kinds";

/**
 * 药材来源 / 入药部位的图标（docs/design/0018 §4）：自己画的线条图标，和导航图标（nav-icons.tsx）同一个风格，
 * 24×24、颜色跟随文字。植物按部位用 8 个部位图标之一，「植物」本身是嫩芽。
 */
const PATHS: Record<HerbKindIconName, ReactNode> = {
  // ---- 来源 ----
  // 植物：两片叶的嫩芽
  plant: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 13C12 9 9.5 7 5 7c0 4 2.5 6 7 6z" />
      <path d="M12 11c0-4 2.5-6.5 7-6.5 0 4.5-2.5 6.5-7 6.5z" />
    </>
  ),
  // 菌藻：蘑菇
  fungus: (
    <>
      <path d="M3.5 12a8.5 7 0 0 1 17 0z" />
      <path d="M9.5 12v6.5a2.5 2.5 0 0 0 5 0V12" />
      <path d="M8 8.5h.01M12 6.5h.01M16 8.5h.01" />
    </>
  ),
  // 动物：爪印
  animal: (
    <>
      <circle cx="5.5" cy="10" r="1.8" />
      <circle cx="9.5" cy="5.5" r="1.8" />
      <circle cx="14.5" cy="5.5" r="1.8" />
      <circle cx="18.5" cy="10" r="1.8" />
      <path d="M7.5 17.5c0-3 2-5.5 4.5-5.5s4.5 2.5 4.5 5.5c0 2.2-2 3-4.5 2.2-2.5.8-4.5 0-4.5-2.2z" />
    </>
  ),
  // 矿物：切面的晶石
  mineral: (
    <>
      <path d="M7 4h10l4 5-9 11L3 9z" />
      <path d="M3 9h18M9.5 4L8 9l4 11 4-11-1.5-5" />
    </>
  ),
  // 加工品：药臼和杵
  manufactured: (
    <>
      <path d="M3.5 12h17c0 4.5-3.8 8-8.5 8s-8.5-3.5-8.5-8z" />
      <path d="M13 12l6-8.5" />
      <path d="M9 20.5h6" />
    </>
  ),
  // ---- 入药部位（植物） ----
  // 根及根茎：一条主根（像人参、胡萝卜），顶上留着茎，旁边有须根
  root: (
    <>
      <path d="M8.5 8h7c0 5-1.5 9-3.5 13-2-4-3.5-8-3.5-13z" />
      <path d="M10 8L8.5 3.5M12 8V3M14 8l1.5-4.5" />
      <path d="M9.4 12.5L6.5 13.5M14.4 15l2.6 1" />
    </>
  ),
  // 果实种子：带梗和小叶的圆果
  fruit_seed: (
    <>
      <circle cx="12" cy="14.5" r="6.5" />
      <path d="M12 8V4" />
      <path d="M12 6c1.2-2 3.2-2.8 5.5-2.3-1 2-3 2.8-5.5 2.3z" />
    </>
  ),
  // 全草：带根、茎、叶的整株
  whole: (
    <>
      <path d="M6 17h12" />
      <path d="M12 17V5" />
      <path d="M12 17v3.5M12 19l-2.2 2M12 19l2.2 2" />
      <path d="M12 13c-3.5 0-5.5-2-5.5-5 3.2 0 5.5 2 5.5 5z" />
      <path d="M12 10.5c3.5 0 5.5-2 5.5-5-3.2 0-5.5 2-5.5 5z" />
    </>
  ),
  // 叶：带叶脉的一片叶
  leaf: (
    <>
      <path d="M12 2.5c5 4 6.5 11 0 18.5C5.5 13.5 7 6.5 12 2.5z" />
      <path d="M12 6v17" />
      <path d="M12 10.5l-2.6-2M12 10.5l2.6-2M12 14.5l-3-2.4M12 14.5l3-2.4" />
    </>
  ),
  // 花：五瓣花
  flower: (
    <>
      <circle cx="12" cy="10" r="2" />
      <path d="M12 8c-1.6-1.6-1.6-4 0-5.5 1.6 1.5 1.6 3.9 0 5.5z" />
      <path d="M13.9 9.4c1.4-1.8 3.8-2.4 5.7-1.4-.9 2-3.2 2.9-5.7 1.4z" />
      <path d="M13.2 11.8c2.2.5 3.5 2.6 3.2 4.7-2.1-.1-3.6-2-3.2-4.7z" />
      <path d="M10.8 11.8c-2.2.5-3.5 2.6-3.2 4.7 2.1-.1 3.6-2 3.2-4.7z" />
      <path d="M10.1 9.4C8.7 7.6 6.3 7 4.4 8c.9 2 3.2 2.9 5.7 1.4z" />
      <path d="M12 12v9.5" />
    </>
  ),
  // 皮：卷起来的一片树皮（像肉桂）
  bark: (
    <>
      <ellipse cx="6" cy="12" rx="2.5" ry="7" />
      <path d="M6 5h12c1.4 0 2.5 3.1 2.5 7s-1.1 7-2.5 7H6" />
      <path d="M11 9h5M12 12h5.5M11 15h5" />
    </>
  ),
  // 茎木：一节一节的茎，节上有小枝
  stem: (
    <>
      <path d="M10 2.5v19M14 2.5v19" />
      <path d="M10 8h4M10 15h4" />
      <path d="M14 11.5l4.5-3.5M18.5 8l.5-2.5" />
    </>
  ),
  // 树脂及其他：一滴
  resin_other: (
    <>
      <path d="M12 3c3.2 4.5 6 7.8 6 11.5a6 6 0 0 1-12 0C6 10.8 8.8 7.5 12 3z" />
      <path d="M9.3 14.8a2.8 2.8 0 0 0 2.7 2.7" />
    </>
  ),
  // 未分类：虚线圆
  unclassified: <circle cx="12" cy="12" r="8" strokeDasharray="2.5 2.5" />,
};

/** 药材来源 / 部位的图标。size 是像素，默认 16（文字旁边用）；目录分组的标题用 20，和导航一样大 */
export function HerbKindIcon({ name, size = 16 }: { name: HerbKindIconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      data-kind-icon={name}
    >
      {PATHS[name]}
    </svg>
  );
}

/** 药材详情页名字下面的小标签：「〔嫩芽〕植物 · 〔根〕根及根茎」「〔爪印〕动物」「未分类」 */
export function HerbKindTag({ kind }: { kind: HerbKind }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ring-1 ring-line ${kind.origin ? "bg-paper" : "text-muted"}`}
      data-testid="herb-kind"
      title="来源 · 入药部位"
    >
      <HerbKindIcon name={kind.origin ?? "unclassified"} />
      {kind.origin ? ORIGIN_LABELS[kind.origin] : UNCLASSIFIED_LABEL}
      {kind.part && (
        <>
          {" · "}
          <HerbKindIcon name={kind.part} />
          {PART_LABELS[kind.part]}
        </>
      )}
    </span>
  );
}
