import { AMBER, CINNABAR, KNOB, LABEL, LINE, STEEL as STEEL_COLOR, STONE_DARK, TEXT, BRONZE as BRONZE_COLOR, paint } from "./palette";

/**
 * 道具（docs/design/0019 §2、§9）：药柜、书卷、药臼和杵、戥子、针灸铜人和针。都是我们自己画的，手绘温暖风，颜色见 palette.ts。
 * 全部用绝对坐标画（不用 transform），这样场景里可以把任意一部分包进带动画的 <g>（见 motion.css 开头）。
 */

/** 铜人的颜色 */
export const BRONZE = BRONZE_COLOR;
/** 针的颜色 */
export const STEEL = STEEL_COLOR;
/** 书卷的纸和字 */
export const SCROLL_PAPER = LABEL;
export const SCROLL_TEXT = TEXT;

/** 一个抽屉的位置（药柜的第 col 列、第 row 行） */
export function drawerAt(x: number, y: number, cell: number, col: number, row: number) {
  return { x: x + 3 + col * cell, y: y + 5 + row * cell, size: cell - 2 };
}

/** 一个抽屉：面板、标签、拉手 */
export function Drawer({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <>
      <rect x={x} y={y} width={size} height={size} rx="1" {...paint.drawer} />
      <rect x={x + size * 0.22} y={y + size * 0.16} width={size * 0.56} height={size * 0.26} {...paint.label} />
      <circle cx={x + size / 2} cy={y + size * 0.68} r={size * 0.1} fill={KNOB} />
    </>
  );
}

/**
 * 药柜（百子柜）：左上角 (x, y)，cols × rows 个抽屉，每格 cell。
 * skip 里的抽屉不画（场景要单独画它、给它加动画），只留一个深色的空格。
 */
export function MedicineCabinet({
  x,
  y,
  cols = 4,
  rows = 5,
  cell = 12,
  skip = [],
}: {
  x: number;
  y: number;
  cols?: number;
  rows?: number;
  cell?: number;
  skip?: [number, number][];
}) {
  const w = cols * cell + 4;
  const h = rows * cell + 8;
  const drawers = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const d = drawerAt(x, y, cell, c, r);
      drawers.push(
        skip.some(([sc, sr]) => sc === c && sr === r) ? (
          <rect key={`${c}-${r}`} x={d.x} y={d.y} width={d.size} height={d.size} fill={STONE_DARK} />
        ) : (
          <Drawer key={`${c}-${r}`} {...d} />
        ),
      );
    }
  return (
    <>
      <rect x={x + 2} y={y + h} width="4" height="6" {...paint.wood} />
      <rect x={x + w - 6} y={y + h} width="4" height="6" {...paint.wood} />
      <rect x={x} y={y} width={w} height={h} rx="1.5" {...paint.wood} />
      <rect x={x - 2} y={y - 3} width={w + 4} height="4" rx="1" {...paint.wood} />
      {drawers}
    </>
  );
}

/** 打开的书卷（竖排的字用虚线表示）：纸的左上角 (x, y)、宽 w、高 h，两头是卷轴 */
export function OpenScroll({ x, y, w = 34, h = 17 }: { x: number; y: number; w?: number; h?: number }) {
  const cols = [];
  for (let cx = x + 5; cx < x + w - 3; cx += 4.5)
    cols.push(<line key={cx} x1={cx} y1={y + 3} x2={cx} y2={y + h - 3} stroke={TEXT} strokeWidth="0.9" strokeDasharray="1.6 1.2" />);
  return (
    <>
      <rect x={x} y={y} width={w} height={h} {...paint.paper} />
      {cols}
      <rect x={x - 2.5} y={y - 2.5} width="3.5" height={h + 5} rx="1.5" {...paint.wood} />
      <rect x={x + w - 1} y={y - 2.5} width="3.5" height={h + 5} rx="1.5" {...paint.wood} />
    </>
  );
}

/** 卷起来的书卷（系一根红绳）：中心 (x, y) */
export function RolledScroll({ x, y, len = 24 }: { x: number; y: number; len?: number }) {
  return (
    <>
      <rect x={x - len / 2} y={y - 3.5} width={len} height="7" rx="3.5" {...paint.paper} />
      <rect x={x - len / 2 - 2} y={y - 4.5} width="3" height="9" rx="1" {...paint.wood} />
      <rect x={x + len / 2 - 1} y={y - 4.5} width="3" height="9" rx="1" {...paint.wood} />
      <line x1={x + 2} y1={y - 3.5} x2={x + 2} y2={y + 3.5} stroke={CINNABAR} strokeWidth="1.5" />
    </>
  );
}

/**
 * 药臼（石头的）：(x, y) 是臼口的中心。
 * part：back 只画臼口（杵插在里面时先画它）、front 只画臼身（画在杵前面）、all 都画。
 */
export function Mortar({ x, y, part = "all" }: { x: number; y: number; part?: "all" | "back" | "front" }) {
  const back = (
    <>
      <ellipse cx={x} cy={y} rx="14" ry="3.4" {...paint.stone} />
      <ellipse cx={x} cy={y} rx="11.5" ry="2.4" fill={STONE_DARK} />
    </>
  );
  const front = (
    <>
      <path
        d={`M${x - 14} ${y} Q${x - 13} ${y + 15} ${x - 6} ${y + 17} L${x + 6} ${y + 17} Q${x + 13} ${y + 15} ${x + 14} ${y} Q${x} ${y + 4.6} ${x - 14} ${y} Z`}
        {...paint.stone}
      />
      <rect x={x - 8} y={y + 16} width="16" height="4" rx="1" {...paint.stone} />
      <path d={`M${x - 10} ${y + 7} Q${x} ${y + 10.5} ${x + 10} ${y + 7}`} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
    </>
  );
  return (
    <>
      {part !== "front" && back}
      {part !== "back" && front}
    </>
  );
}

/** 杵（木头的）：从 (x, top) 竖直到 (x, bottom)，下头粗、上头一个圆头 */
export function Pestle({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  return (
    <>
      <rect x={x - 1.5} y={top} width="3" height={bottom - top - 2} rx="1.5" {...paint.wood} />
      <ellipse cx={x} cy={bottom - 1.5} rx="3.4" ry="2.8" {...paint.wood} />
      <circle cx={x} cy={top + 1} r="2.2" {...paint.wood} />
    </>
  );
}

/**
 * 戥子（称中药的小秤）：(x, y) 是提纽挂在秤杆上的点。提纽往上 12、秤盘在左、秤砣在右。
 * 不含提纽的那一段可以整体转（秤杆晃）。
 */
export function DengziBeam({ x, y }: { x: number; y: number }) {
  return (
    <>
      {/* 秤盘 */}
      <line x1={x - 10} y1={y} x2={x - 18} y2={y + 18} stroke={LINE} strokeWidth="0.5" />
      <line x1={x - 10} y1={y} x2={x - 2} y2={y + 18} stroke={LINE} strokeWidth="0.5" />
      <ellipse cx={x - 10} cy={y + 19} rx="9" ry="2.5" fill={AMBER} stroke={LINE} strokeWidth="0.6" />
      <circle cx={x - 12} cy={y + 16.8} r="1.3" {...paint.herb} />
      <circle cx={x - 8.5} cy={y + 17} r="1.1" {...paint.herb2} />
      <circle cx={x - 10} cy={y + 16} r="1" {...paint.herb} />
      {/* 秤杆和秤星 */}
      <line x1={x - 12} y1={y} x2={x + 44} y2={y} stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />
      {[8, 14, 20, 26, 32, 38].map((d) => (
        <circle key={d} cx={x + d} cy={y} r="0.6" fill={AMBER} />
      ))}
      {/* 秤砣 */}
      <line x1={x + 34} y1={y} x2={x + 34} y2={y + 7} stroke={LINE} strokeWidth="0.5" />
      <path d={`M${x + 31.5} ${y + 7} L${x + 36.5} ${y + 7} L${x + 38} ${y + 14} L${x + 30} ${y + 14} Z`} {...paint.stone} />
    </>
  );
}

/** 戥子的提纽（手捏着的那根绳） */
export function DengziCord({ x, y }: { x: number; y: number }) {
  return <line x1={x} y1={y - 12} x2={x} y2={y} stroke={CINNABAR} strokeWidth="1" />;
}

/** 针灸铜人：(cx, top) 是头顶。高 78，最下面是底座 */
export function BronzeFigure({ cx, top }: { cx: number; top: number }) {
  const t = top;
  return (
    <>
      <rect x={cx - 15} y={t + 72} width="30" height="6" rx="1.5" {...paint.wood} />
      <rect x={cx - 7.5} y={t + 44} width="6.5" height="29" rx="3" {...paint.bronze} />
      <rect x={cx + 1} y={t + 44} width="6.5" height="29" rx="3" {...paint.bronze} />
      <rect x={cx - 14.5} y={t + 18} width="5.5" height="27" rx="2.75" {...paint.bronze} />
      <rect x={cx + 9} y={t + 18} width="5.5" height="27" rx="2.75" {...paint.bronze} />
      <rect x={cx - 9} y={t + 15} width="18" height="33" rx="7" {...paint.bronze} />
      <circle cx={cx} cy={t + 8} r="7.5" {...paint.bronze} />
      {/* 经络线和穴位 */}
      <line x1={cx} y1={t + 18} x2={cx} y2={t + 46} stroke={CINNABAR} strokeWidth="0.6" strokeDasharray="1.5 1.5" />
      <line x1={cx - 11.75} y1={t + 21} x2={cx - 11.75} y2={t + 43} stroke={CINNABAR} strokeWidth="0.6" strokeDasharray="1.5 1.5" />
      {[22, 30, 38].map((d) => (
        <circle key={d} cx={cx} cy={t + d} r="1.2" fill={CINNABAR} />
      ))}
      <circle cx={cx - 11.75} cy={t + 38} r="1.2" fill={CINNABAR} />
      <circle cx={cx + 11.75} cy={t + 28} r="1.2" fill={CINNABAR} />
    </>
  );
}

/** 针灸针：针尖在 (tipX, y)，朝右；左边是缠着的针柄 */
export function Needle({ tipX, y, len = 14 }: { tipX: number; y: number; len?: number }) {
  return (
    <>
      <line x1={tipX - len} y1={y} x2={tipX} y2={y} stroke={STEEL_COLOR} strokeWidth="0.9" strokeLinecap="round" />
      <rect x={tipX - len - 1} y={y - 1.4} width="6" height="2.8" rx="1" fill={AMBER} stroke={LINE} strokeWidth="0.4" />
    </>
  );
}
