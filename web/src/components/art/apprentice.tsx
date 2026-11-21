import type { ReactNode } from "react";
import { motion as m } from "./motion";
import { CHEEK, CINNABAR, CREAM, FEATURE, LINE, MOUTH, SHADOW, SHOE, SKIN as SKIN_COLOR, TONGUE, paint } from "./palette";
import { Picture } from "./picture";

/**
 * 小学徒（docs/design/0019 §9）：手绘温暖风的小药童。头顶两个发髻、各系一根朱砂红的发带；
 * 松绿交领长衫（左襟压右襟），米色内领和宽袖口镶边；琥珀色腰带，结垂在左边，右边挂一个小药囊。
 * 头身比约 1 : 2.4（头和眼睛故意画大一点，详情页的小图里也看得清表情）。我们自己画的原创形象。
 * 所有动作、占位图都用这里的部件，保证是同一个角色。颜色见 palette.ts（固定颜色，画在宣纸色的画片上）。
 */
export const SKIN = SKIN_COLOR;
export const DARK = SHOE;

/** 身体的尺寸（以脚底中点为原点）：头的中心、半径，肩、腰的高度，肩宽、下摆宽的一半 */
const B = { hy: -63, hr: 17, sh: -48, wy: -30, sw: 11, hw: 17 } as const;
/** 脚底在场景里的 y（场景的 viewBox 是 0 0 160 120） */
const GROUND = 105;
/** 头的中心在场景里的 y */
export const HEAD_Y = GROUND + B.hy;
/** 左、右肩在场景里的位置（cx 是身体中线） */
export const shoulders = (cx: number) => ({ left: { x: cx - 8, y: GROUND + B.sh + 3 }, right: { x: cx + 8, y: GROUND + B.sh + 3 } });

const f = (n: number) => Math.round(n * 100) / 100;
const widthAt = (y: number) => B.sw + ((B.hw - B.sw) * (y - (B.sh + 5))) / (-3 - (B.sh + 5));

/** 表情：neutral 平常、happy 开心（眯眼笑）、focus 认真（眼睛往下看）、confused 困惑、sorry 鞠躬抱歉（闭眼、眉头往上） */
export type ApprenticeFace = "neutral" | "happy" | "focus" | "confused" | "sorry";

function Face({ face, look }: { face: ApprenticeFace; look: number }) {
  const r = B.hr;
  const ex = 0.38 * r;
  const ey = 0.14 * r;
  const by = -0.13 * r;
  const my = 0.5 * r;
  const lw = f(0.06 * r);
  const blw = f(0.051 * r);
  const line = { fill: "none", stroke: FEATURE, strokeLinecap: "round" as const };
  const arc = (x: number, y: number, w: number, h: number, sw = lw) => (
    <path d={`M${f(x - w)} ${f(y)} Q${f(x)} ${f(y + h)} ${f(x + w)} ${f(y)}`} {...line} strokeWidth={sw} />
  );
  /** 睁着的眼睛：深色的椭圆 + 两个高光。look 往左右看（-1 … 1） */
  const eye = (x: number, s = 1, dy = 0) => {
    const cx = x + look * 0.05 * r;
    const cy = ey + dy;
    const rx = 0.14 * r * s;
    const ry = 0.19 * r * s;
    return (
      <>
        <ellipse cx={f(cx)} cy={f(cy)} rx={f(rx)} ry={f(ry)} fill={FEATURE} />
        <circle cx={f(cx - rx * 0.3)} cy={f(cy - ry * 0.38)} r={f(rx * 0.38)} fill="#fff" />
        <circle cx={f(cx + rx * 0.32)} cy={f(cy + ry * 0.35)} r={f(rx * 0.16)} fill="#fff" opacity="0.8" />
      </>
    );
  };
  const brow = (s: number, kind: "flat" | "up" | "down" | "worried" | "raised") => {
    const xo = s * (ex + 0.13 * r);
    const xi = s * (ex - 0.13 * r);
    const xm = s * ex;
    if (kind === "flat")
      return <path d={`M${f(xi)} ${f(by)} Q${f(xm)} ${f(by - 0.06 * r)} ${f(xo)} ${f(by)}`} {...line} strokeWidth={blw} />;
    if (kind === "up")
      return (
        <path d={`M${f(xi)} ${f(by - 0.05 * r)} Q${f(xm)} ${f(by - 0.13 * r)} ${f(xo)} ${f(by - 0.05 * r)}`} {...line} strokeWidth={blw} />
      );
    if (kind === "raised")
      return (
        <path d={`M${f(xi)} ${f(by - 0.06 * r)} Q${f(xm)} ${f(by - 0.2 * r)} ${f(xo)} ${f(by - 0.07 * r)}`} {...line} strokeWidth={blw} />
      );
    if (kind === "down") return <path d={`M${f(xo)} ${f(by - 0.04 * r)} L${f(xi)} ${f(by + 0.03 * r)}`} {...line} strokeWidth={blw} />;
    return <path d={`M${f(xo)} ${f(by + 0.03 * r)} L${f(xi)} ${f(by - 0.07 * r)}`} {...line} strokeWidth={blw} />;
  };
  const cheeks = [-1, 1].map((s) => (
    <ellipse key={s} cx={f(s * 0.62 * r)} cy={f(0.38 * r)} rx={f(0.15 * r)} ry={f(0.09 * r)} fill={CHEEK} opacity="0.4" />
  ));
  const nose = (
    <path
      d={`M${f(-0.03 * r)} ${f(0.33 * r)} q${f(0.04 * r)} ${f(0.04 * r)} ${f(0.07 * r)} 0`}
      {...line}
      stroke={LINE}
      strokeWidth={f(0.04 * r)}
      opacity="0.7"
    />
  );
  return (
    <>
      {face === "neutral" && (
        <g className={m.blink}>
          {eye(-ex)}
          {eye(ex)}
        </g>
      )}
      {face === "focus" && (
        <g className={m.blink}>
          {eye(-ex, 0.85, 0.08 * r)}
          {eye(ex, 0.85, 0.08 * r)}
        </g>
      )}
      {face === "confused" && (
        <g className={m.blink}>
          {eye(-ex, 1.12)}
          {eye(ex, 0.82)}
        </g>
      )}
      {face === "happy" && (
        <>
          {arc(-ex, ey + 0.04 * r, 0.15 * r, -0.17 * r)}
          {arc(ex, ey + 0.04 * r, 0.15 * r, -0.17 * r)}
        </>
      )}
      {face === "sorry" && (
        <>
          {arc(-ex, ey, 0.14 * r, 0.11 * r)}
          {arc(ex, ey, 0.14 * r, 0.11 * r)}
        </>
      )}
      {face === "neutral" && (
        <>
          {brow(-1, "flat")}
          {brow(1, "flat")}
        </>
      )}
      {face === "focus" && (
        <>
          {brow(-1, "flat")}
          {brow(1, "flat")}
        </>
      )}
      {face === "happy" && (
        <>
          {brow(-1, "up")}
          {brow(1, "up")}
        </>
      )}
      {face === "confused" && (
        <>
          {brow(-1, "raised")}
          {brow(1, "down")}
        </>
      )}
      {face === "sorry" && (
        <>
          {brow(-1, "worried")}
          {brow(1, "worried")}
        </>
      )}
      {cheeks}
      {nose}
      {face === "neutral" && arc(0, my, 0.12 * r, 0.1 * r)}
      {face === "happy" && (
        <>
          <path d={`M${f(-0.17 * r)} ${f(my - 0.03 * r)} Q0 ${f(my + 0.3 * r)} ${f(0.17 * r)} ${f(my - 0.03 * r)} Z`} fill={MOUTH} />
          <ellipse cy={f(my + 0.12 * r)} rx={f(0.08 * r)} ry={f(0.04 * r)} fill={TONGUE} />
        </>
      )}
      {face === "focus" && <ellipse cy={f(my + 0.02 * r)} rx={f(0.05 * r)} ry={f(0.035 * r)} fill={FEATURE} />}
      {face === "confused" && (
        <path
          d={`M${f(-0.14 * r)} ${f(my)} Q${f(-0.07 * r)} ${f(my - 0.07 * r)} 0 ${f(my)} Q${f(0.07 * r)} ${f(my + 0.07 * r)} ${f(0.14 * r)} ${f(my)}`}
          {...line}
          strokeWidth={lw}
        />
      )}
      {face === "sorry" && arc(0, my + 0.04 * r, 0.1 * r, -0.06 * r)}
    </>
  );
}

/**
 * 头：发髻和发带、耳朵、脸、刘海、五官。原点是头的中心，半径 17。
 * eyes（旧的写法，还能用）：smile 眯眼笑，open 睁眼。face 指定表情时以 face 为准；look 眼睛往左右看（-1 … 1）。睁眼的表情会眨眼。
 */
export function ApprenticeHead({ eyes = "smile", face, look = 0 }: { eyes?: "smile" | "open"; face?: ApprenticeFace; look?: number }) {
  const r = B.hr;
  return (
    <>
      {[-1, 1].map((s) => (
        <circle key={s} cx={f(s * 0.72 * r)} cy={f(-0.86 * r)} r={f(0.36 * r)} {...paint.hair} />
      ))}
      {[-1, 1].map((s) => (
        <g key={s}>
          <path
            d={`M${f(s * 0.5 * r)} ${f(-0.62 * r)} q${f(s * 0.22 * r)} ${f(0.18 * r)} ${f(s * 0.16 * r)} ${f(0.48 * r)}`}
            fill="none"
            stroke={CINNABAR}
            strokeWidth={f(0.11 * r)}
            strokeLinecap="round"
          />
          <circle cx={f(s * 0.5 * r)} cy={f(-0.62 * r)} r={f(0.14 * r)} {...paint.red} />
        </g>
      ))}
      {[-1, 1].map((s) => (
        <circle key={s} cx={f(s * 0.97 * r)} cy={f(0.14 * r)} r={f(0.17 * r)} {...paint.skin} />
      ))}
      <circle r={r} {...paint.skin} />
      {/* 头发：从耳朵上面绕过头顶，前面是刘海 */}
      <path
        d={`M${-r} ${f(0.12 * r)} A${f(1.02 * r)} ${f(1.02 * r)} 0 1 1 ${r} ${f(0.12 * r)} L${f(0.9 * r)} ${f(0.02 * r)} Q${f(0.84 * r)} ${f(-0.3 * r)} ${f(0.52 * r)} ${f(-0.42 * r)} Q${f(0.32 * r)} ${f(-0.2 * r)} ${f(0.1 * r)} ${f(-0.38 * r)} Q${f(-0.14 * r)} ${f(-0.2 * r)} ${f(-0.38 * r)} ${f(-0.42 * r)} Q${f(-0.62 * r)} ${f(-0.24 * r)} ${f(-0.84 * r)} ${f(-0.32 * r)} Q${f(-0.92 * r)} ${f(-0.1 * r)} ${f(-0.9 * r)} ${f(0.02 * r)} Z`}
        {...paint.hair}
      />
      <path
        d={`M${f(-0.2 * r)} ${f(-0.85 * r)} q${f(0.25 * r)} ${f(0.15 * r)} ${f(0.3 * r)} ${f(0.45 * r)} M${f(0.35 * r)} ${f(-0.8 * r)} q${f(0.15 * r)} ${f(0.2 * r)} ${f(0.15 * r)} ${f(0.38 * r)}`}
        fill="none"
        stroke="#6a5444"
        strokeWidth={f(0.04 * r)}
        strokeLinecap="round"
      />
      <Face face={face ?? (eyes === "smile" ? "happy" : "neutral")} look={look} />
    </>
  );
}

/** 下半身：影子、鞋、下摆（有褶）。cx 是身体中线 */
function LowerBody({ cx }: { cx: number }) {
  const w = widthAt(B.wy - 1);
  return (
    <g transform={`translate(${cx} ${GROUND})`}>
      <ellipse cy="1.5" rx={B.hw + 4} ry="3" fill={SHADOW} />
      {[-1, 1].map((s) => (
        <ellipse key={s} cx={s * 6.5} cy="-1.6" rx="5" ry="2.6" {...paint.shoe} />
      ))}
      <path d={`M${f(-w)} ${B.wy - 1} L${f(w)} ${B.wy - 1} L${B.hw} -3 Q0 0 ${-B.hw} -3 Z`} {...paint.robe} />
      <path d={`M3 ${B.wy - 1} L${f(w)} ${B.wy - 1} L${B.hw} -3 Q10 -1.6 5 -1.6 Z`} fill="#000" opacity="0.1" />
      <path d={`M-4 ${B.wy + 4} Q-5.5 ${B.wy + 16} -8 -4 M5 ${B.wy + 4} Q6 ${B.wy + 15} 8.5 -4 M0.5 ${B.wy + 8} L1 -2.5`} {...paint.fold} />
    </g>
  );
}

/** 上半身：脖子、上衣、交领、腰带和结、药囊。cx 是身体中线 */
function Torso({ cx }: { cx: number }) {
  const { sh, wy, sw, hy, hr } = B;
  const w3 = widthAt(wy + 3);
  const wb = widthAt(wy);
  return (
    <g transform={`translate(${cx} ${GROUND})`}>
      <rect x="-3.2" y={f(hy + hr * 0.6)} width="6.4" height={f(sh + 4 - (hy + hr * 0.6))} {...paint.skin} />
      <path
        d={`M${-sw} ${sh + 5} Q${-sw} ${sh} ${-sw + 5} ${sh - 1} L${sw - 5} ${sh - 1} Q${sw} ${sh} ${sw} ${sh + 5} L${f(w3)} ${wy + 3} L${f(-w3)} ${wy + 3} Z`}
        {...paint.robe}
      />
      <path
        d={`M3 ${sh - 1} L${sw - 5} ${sh - 1} Q${sw} ${sh} ${sw} ${sh + 5} L${f(w3)} ${wy + 3} L3 ${wy + 3} Z`}
        fill="#000"
        opacity="0.08"
      />
      {/* 交领：米色内领 + 左襟压右襟 */}
      <path d={`M-4.6 ${sh - 0.8} L4.6 ${sh - 0.8} L-1.2 ${sh + 7} Z`} {...paint.cream} />
      <path d={`M4.6 ${sh - 0.8} L-6.5 ${sh + 13}`} stroke={CREAM} strokeWidth="2.4" strokeLinecap="round" />
      <path d={`M-4.6 ${sh - 0.8} L-1.6 ${sh + 5}`} stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" />
      <rect x={f(-wb)} y={wy - 2} width={f(2 * wb)} height="4" rx="1.5" {...paint.belt} />
      <path
        d={`M-4 ${wy + 1.5} l-1.2 7 M-2.6 ${wy + 1.5} l1.4 6`}
        fill="none"
        stroke={paint.belt.fill}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d={`M8.5 ${wy + 2} q-3.6 2.6 -2.8 7.4 q3.2 2.6 6.4 0 q0.8 -4.8 -3.6 -7.4 Z`} {...paint.pouch} />
      <circle cx="8.5" cy={wy + 2.6} r="1" {...paint.red} />
    </g>
  );
}

/** 手（从袖口伸出来）：中心 (x, y) */
export function Hand({ x, y }: { x: number; y: number }) {
  return <circle cx={f(x)} cy={f(y)} r="3.1" {...paint.skin} />;
}

/**
 * 袖子 + 手：从肩膀（x1, y1）伸到手（x2, y2）。宽袖，下沿因为重力多垂一点，袖口有米色镶边。
 * cuff：袖口的半宽；hand={false} 时不画手（场景要把手画在别的东西前面，比如捧着的书卷）。
 */
export function Sleeve({
  x1,
  y1,
  x2,
  y2,
  cuff = 5.4,
  hand = true,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cuff?: number;
  hand?: boolean;
}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  let nx = -uy;
  let ny = ux;
  if (ny < 0) [nx, ny] = [-nx, -ny]; // n 朝下
  const cx = x2 - ux * 2.4;
  const cy = y2 - uy * 2.4;
  const a = 3.6;
  const mx = (x1 + cx) / 2;
  const my = (y1 + cy) / 2;
  const p = (x: number, y: number) => `${f(x)} ${f(y)}`;
  const d = [
    `M${p(x1 + nx * a, y1 + ny * a)}`,
    `Q${p(mx + nx * (a + cuff) * 0.8, my + ny * (a + cuff) * 0.8)} ${p(cx + nx * cuff, cy + ny * cuff)}`,
    `L${p(cx - nx * cuff, cy - ny * cuff)}`,
    `Q${p(mx - nx * (a + cuff) * 0.55, my - ny * (a + cuff) * 0.55)} ${p(x1 - nx * a, y1 - ny * a)} Z`,
  ].join(" ");
  return (
    <>
      {hand && <Hand x={x2} y={y2} />}
      <path d={d} {...paint.robe} />
      <path
        d={`M${p(cx + nx * cuff, cy + ny * cuff)} L${p(cx - nx * cuff, cy - ny * cuff)}`}
        stroke={CREAM}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  );
}

/** 垂在身边的袖子：(x, y) 是肩膀，side 是在身体的哪一边（看图的人的左 / 右） */
export function RestingSleeve({ x, y, side = "left" }: { x: number; y: number; side?: "left" | "right" }) {
  const s = side === "left" ? -1 : 1;
  return <Sleeve x1={x} y1={y} x2={x + s * 6.5} y2={y + 22} />;
}

/**
 * 站着的小学徒，正面。cx 是身体中线，脚在 y = 105（场景的 viewBox 是 0 0 160 120）。
 * face / look：表情和眼睛往哪边看；headClass：头的动画（点头、转头，转动中心是头的下沿，见 motion.css）。
 * children 画在身体前面（袖子、手里的东西），用场景的坐标；肩膀的位置用 shoulders(cx)。
 */
export function StandingApprentice({
  cx,
  eyes = "open",
  face,
  look,
  headClass,
  children,
}: {
  cx: number;
  eyes?: "smile" | "open";
  face?: ApprenticeFace;
  look?: number;
  headClass?: string;
  children?: ReactNode;
}) {
  return (
    <g>
      <LowerBody cx={cx} />
      <Torso cx={cx} />
      <g transform={`translate(${cx} ${HEAD_Y})`}>
        <g className={headClass}>
          <ApprenticeHead eyes={eyes} face={face} look={look} />
        </g>
      </g>
      {children}
    </g>
  );
}

/** 鞠躬的小学徒（拱手、闭眼，眉头有点抱歉）。以前是「暂时没有照片」的占位图（docs/design/0010 §3.5），现在只在素材库里（0019 §9.6） */
export function BowingApprentice({ className }: { className?: string }) {
  const cx = 56;
  const { left, right } = shoulders(cx);
  const hy = GROUND + B.sh + 11;
  return (
    <Picture viewBox="0 0 120 112" className={className} label="鞠躬的小药童">
      <LowerBody cx={cx} />
      {/* 上半身绕腰往前倾 */}
      <g transform={`rotate(-22 ${cx} ${GROUND + B.wy})`}>
        <Torso cx={cx} />
        <g transform={`translate(${cx} ${HEAD_Y + 2})`}>
          <ApprenticeHead face="sorry" />
        </g>
        <Sleeve x1={left.x} y1={left.y} x2={cx - 1.5} y2={hy} cuff={4.6} hand={false} />
        <Sleeve x1={right.x} y1={right.y} x2={cx + 1.5} y2={hy} cuff={4.6} hand={false} />
        <ellipse cx={cx} cy={hy} rx="4.1" ry="3.1" {...paint.skin} />
      </g>
      <Leaf x={92} y={26} />
    </Picture>
  );
}

/** 一片叶子（装饰），(x, y) 是叶柄 */
export function Leaf({ x, y }: { x: number; y: number }) {
  return (
    <>
      <path d={`M${x} ${y} q10 -8 18 0 q-8 8 -18 0 Z`} {...paint.herb} />
      <path d={`M${x} ${y} L${x + 16} ${y}`} stroke={CREAM} strokeWidth="0.8" opacity="0.8" />
    </>
  );
}
