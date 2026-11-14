import type { CSSProperties, ReactNode } from "react";
import { motion as m } from "./motion";

/**
 * 小学徒（docs/design/0019 §2）：穿松绿长衫、系琥珀色腰带、戴黑色小帽（顶上一个朱砂红的结）的小药童。
 * 我们自己画的原创形象。所有动作、占位图都用这里的部件，保证是同一个角色。
 *
 * 颜色：长衫、腰带、线条用主题变量（浅色 / 深色模式自动换）；脸、帽子、鞋用固定颜色——深色模式下 --ink 是浅色，画在脸上看不清。
 */
export const SKIN = "#f2d3b1";
export const DARK = "#3b322b";

/** 头：脸、小帽、红结、腮红。原点是头的中心，半径 15。eyes：smile 眯眼笑（鞠躬），open 睁眼（干活时，会眨眼） */
export function ApprenticeHead({ eyes = "smile" }: { eyes?: "smile" | "open" }) {
  return (
    <>
      <circle r="15" fill={SKIN} stroke="var(--ink)" strokeWidth="1.2" />
      <path d="M-15 -2 A15 15 0 0 1 15 -2 Z" fill={DARK} stroke="var(--ink)" strokeWidth="1.2" />
      <circle cy="-16.5" r="3" fill="var(--cinnabar)" />
      {eyes === "smile" ? (
        <path d="M-8 3 q3 3 6 0 M2 3 q3 3 6 0" fill="none" stroke={DARK} strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <g className={m.blink}>
          <circle cx="-5" cy="3.5" r="1.8" fill={DARK} />
          <circle cx="5" cy="3.5" r="1.8" fill={DARK} />
        </g>
      )}
      <circle cx="-10" cy="7" r="2.5" fill="var(--cinnabar)" opacity="0.35" />
      <circle cx="10" cy="7" r="2.5" fill="var(--cinnabar)" opacity="0.35" />
      <path d="M-3 9 q3 2.5 6 0" fill="none" stroke={DARK} strokeWidth="1.2" strokeLinecap="round" />
    </>
  );
}

/** 袖子 + 手：从肩膀（x1, y1）伸到手（x2, y2） */
export function Sleeve({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--card)" strokeWidth="10" strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--jade)" strokeWidth="8" strokeLinecap="round" />
      <circle cx={x2 + Math.sign(x2 - x1) * 2} cy={y2} r="3.6" fill={SKIN} stroke="var(--ink)" strokeWidth="0.6" />
    </>
  );
}

/** 垂在身边的袖子（手露一点） */
export function RestingSleeve({ x, y }: { x: number; y: number }) {
  return (
    <>
      <ellipse cx={x} cy={y} rx="5" ry="9" fill="var(--jade)" stroke="var(--card)" strokeWidth="1.2" />
      <circle cx={x} cy={y + 10} r="3.2" fill={SKIN} stroke="var(--ink)" strokeWidth="0.6" />
    </>
  );
}

/**
 * 站着的小学徒，正面。cx 是身体中线，脚在 y = 105 左右（场景的 viewBox 是 0 0 160 120）。
 * headClass / headOrigin：头的动画（点头、转头），转动中心默认在脖子。children 画在身体前面（袖子、手里的东西）。
 */
export function StandingApprentice({
  cx,
  eyes = "open",
  headClass,
  children,
}: {
  cx: number;
  eyes?: "smile" | "open";
  headClass?: string;
  children?: ReactNode;
}) {
  const neck: CSSProperties = { transformOrigin: `${cx}px 50px` };
  return (
    <g>
      <ellipse cx={cx} cy="108" rx="22" ry="3.5" fill="var(--line)" />
      <path d={`M${cx - 12} 74 L${cx + 12} 74 L${cx + 17} 104 L${cx - 17} 104 Z`} fill="var(--jade)" />
      <path d={`M${cx} 76 L${cx} 104`} stroke="var(--card)" strokeWidth="1.5" opacity="0.6" />
      <ellipse cx={cx - 8} cy="105" rx="6" ry="2.6" fill={DARK} stroke="var(--ink)" strokeWidth="0.8" />
      <ellipse cx={cx + 8} cy="105" rx="6" ry="2.6" fill={DARK} stroke="var(--ink)" strokeWidth="0.8" />
      <rect x={cx - 12} y="49" width="24" height="29" rx="10" fill="var(--jade)" />
      <path d={`M${cx - 6} 51 L${cx} 59 L${cx + 6} 51`} fill="none" stroke="var(--card)" strokeWidth="2" strokeLinejoin="round" />
      <rect x={cx - 12} y="70" width="24" height="3.5" rx="1.75" fill="var(--amber)" />
      <g className={headClass} style={headClass ? neck : undefined}>
        <g transform={`translate(${cx} 35)`}>
          <ApprenticeHead eyes={eyes} />
        </g>
      </g>
      {children}
    </g>
  );
}

/** 鞠躬的小学徒（「暂时没有照片」占位图，docs/design/0010 §3.5）。2026-11-12 画的原稿，头换成共用的部件，样子不变 */
export function BowingApprentice({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 112" className={className} role="img" aria-label="鞠躬的小药童">
      {/* 影子 */}
      <ellipse cx="58" cy="104" rx="30" ry="4" fill="var(--line)" />
      {/* 长衫下摆和鞋 */}
      <path d="M44 70 L72 70 L80 101 L36 101 Z" fill="var(--jade)" />
      <path d="M58 72 L58 101" stroke="var(--card)" strokeWidth="1.5" opacity="0.6" />
      <ellipse cx="44" cy="102" rx="7" ry="3" fill={DARK} stroke="var(--ink)" strokeWidth="0.8" />
      <ellipse cx="72" cy="102" rx="7" ry="3" fill={DARK} stroke="var(--ink)" strokeWidth="0.8" />
      {/* 上半身往前鞠躬 */}
      <g transform="rotate(-28 58 72)">
        <rect x="44" y="42" width="28" height="32" rx="11" fill="var(--jade)" />
        <path d="M51 44 L58 54 L65 44" fill="none" stroke="var(--card)" strokeWidth="2" strokeLinejoin="round" />
        <rect x="44" y="64" width="28" height="4" rx="2" fill="var(--amber)" />
        {/* 拱手：两只袖子合在胸前 */}
        <ellipse cx="51" cy="57" rx="7" ry="5" fill="var(--jade)" stroke="var(--card)" strokeWidth="1.2" />
        <ellipse cx="65" cy="57" rx="7" ry="5" fill="var(--jade)" stroke="var(--card)" strokeWidth="1.2" />
        <circle cx="58" cy="56" r="4.5" fill={SKIN} />
        <g transform="translate(58 28)">
          <ApprenticeHead eyes="smile" />
        </g>
      </g>
      <Leaf x={92} y={26} />
    </svg>
  );
}

/** 一片叶子（装饰），(x, y) 是叶柄 */
export function Leaf({ x, y }: { x: number; y: number }) {
  return (
    <>
      <path d={`M${x} ${y} q10 -8 18 0 q-8 8 -18 0 Z`} fill="var(--jade)" opacity="0.7" />
      <path d={`M${x} ${y} L${x + 16} ${y}`} stroke="var(--card)" strokeWidth="1" opacity="0.8" />
    </>
  );
}
