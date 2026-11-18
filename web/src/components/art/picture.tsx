import { useId, type ReactNode, type SVGProps } from "react";
import { FRAME, PAPER_BG } from "./palette";

/**
 * 画片（docs/design/0019 §9）：素材库里每一张图都是一个 <Picture>。
 * - 底是一块宣纸色的圆角画片，浅色、深色模式都一样（深色模式下小学徒不会糊在深色背景上，2026-11-15 Hao 定的）。
 * - 里面的东西套一层「手绘线」滤镜：边缘轻轻地抖一点，像手画的。
 * 滤镜的 id 用 useId 生成，一页上有很多张画也不会互相引用错。
 */
export function Picture({
  viewBox,
  label,
  children,
  ...rest
}: { viewBox: string; label: string; children: ReactNode } & Omit<SVGProps<SVGSVGElement>, "viewBox" | "children">) {
  const id = `ap-rough-${useId().replace(/[^\w-]/g, "")}`;
  const [x, y, w, h] = viewBox.split(/[\s,]+/).map(Number);
  return (
    <svg viewBox={viewBox} role="img" aria-label={label} {...rest}>
      <defs>
        <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <rect
        x={x + 0.5}
        y={y + 0.5}
        width={w - 1}
        height={h - 1}
        rx={Math.min(w, h) * 0.07}
        fill={PAPER_BG}
        stroke={FRAME}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <g filter={`url(#${id})`} strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}
