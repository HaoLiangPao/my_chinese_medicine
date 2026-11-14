import type { ReactNode } from "react";
import { RestingSleeve, SKIN, Sleeve, StandingApprentice } from "@/components/art/apprentice";
import {
  BronzeFigure,
  DengziBeam,
  DengziCord,
  Drawer,
  MedicineCabinet,
  Mortar,
  Needle,
  OpenScroll,
  Pestle,
  drawerAt,
} from "@/components/art/props";
import { motion as m } from "@/components/art/motion";
import { actionLabel, type ApprenticeAction } from "@/lib/apprentice";

/**
 * 小学徒的五个动作（docs/design/0019 §3）。每个场景是 viewBox 0 0 160 120 里的一组图形。
 * 加动作：lib/apprentice.ts 的 APPRENTICE_ACTIONS 加一行，这里写一个场景、在 SCENES 里加一行。
 */
const SCENES: Record<ApprenticeAction, () => ReactNode> = {
  read: Reading,
  pound: Pounding,
  weigh: Weighing,
  drawer: SearchingDrawers,
  needle: PracticingNeedles,
};

export function ApprenticeScene({ action, className }: { action: ApprenticeAction; className?: string }) {
  const Scene = SCENES[action];
  return (
    <svg
      viewBox="0 0 160 120"
      className={className}
      role="img"
      aria-label={`小学徒在${actionLabel(action)}`}
      data-testid="apprentice-scene"
      data-action={action}
    >
      <Scene />
    </svg>
  );
}

/** 读书：站在药柜前捧着书卷，一边看一边点头 */
function Reading() {
  return (
    <>
      <MedicineCabinet x={104} y={20} cols={3} rows={6} cell={13} />
      <StandingApprentice cx={62} headClass={m.nod}>
        <ellipse cx="47" cy="63" rx="6" ry="5" fill="var(--jade)" stroke="var(--card)" strokeWidth="1.2" />
        <ellipse cx="77" cy="63" rx="6" ry="5" fill="var(--jade)" stroke="var(--card)" strokeWidth="1.2" />
        <OpenScroll x={46} y={58} w={32} h={16} />
        <circle cx="44.5" cy="67" r="3.4" fill={SKIN} stroke="var(--ink)" strokeWidth="0.6" />
        <circle cx="79.5" cy="67" r="3.4" fill={SKIN} stroke="var(--ink)" strokeWidth="0.6" />
      </StandingApprentice>
    </>
  );
}

/** 捣药：双手握杵，在药臼里一下一下地捣 */
function Pounding() {
  return (
    <>
      <Mortar x={100} y={84} />
      <StandingApprentice cx={56}>
        <g className={m.pound} style={{ transformOrigin: "60px 57px" }}>
          <Pestle x={100} top={50} bottom={88} />
          <Sleeve x1={50} y1={58} x2={95} y2={68} />
          <Sleeve x1={63} y1={56} x2={95} y2={58} />
        </g>
      </StandingApprentice>
      <g className={m.puff}>
        <circle cx="90" cy="80" r="1.4" fill="var(--jade)" />
        <circle cx="110" cy="79" r="1.2" fill="var(--amber)" />
        <circle cx="106" cy="76" r="1" fill="var(--jade)" />
      </g>
    </>
  );
}

/** 称药：右手提着戥子，秤杆轻轻晃，眼睛看着秤星 */
function Weighing() {
  const px = 92;
  const py = 46;
  return (
    <>
      <StandingApprentice cx={52}>
        <RestingSleeve x={39} y={62} />
        <DengziCord x={px} y={py} />
        <g className={m.tilt} style={{ transformOrigin: `${px}px ${py}px` }}>
          <DengziBeam x={px} y={py} />
        </g>
        <Sleeve x1={58} y1={56} x2={88} y2={34} />
      </StandingApprentice>
    </>
  );
}

/** 翻药斗：伸手拉开百子柜的一个抽屉看看，再推回去 */
function SearchingDrawers() {
  const cab = { x: 84, y: 14, cell: 12 };
  const target = drawerAt(cab.x, cab.y, cab.cell, 0, 3);
  return (
    <>
      <MedicineCabinet {...cab} cols={5} rows={6} skip={[[0, 3]]} />
      <StandingApprentice cx={54} headClass={m.look}>
        <RestingSleeve x={41} y={62} />
        <g className={m.pull}>
          <Drawer {...target} />
          <Sleeve x1={60} y1={58} x2={target.x - 1} y2={target.y + target.size * 0.68} />
        </g>
      </StandingApprentice>
    </>
  );
}

/** 练针灸：对着铜人找穴位，手里的针一进一退，穴位一闪一闪 */
function PracticingNeedles() {
  const fig = { cx: 124, top: 16 };
  const target = { x: fig.cx - 11.75, y: fig.top + 30 };
  return (
    <>
      <BronzeFigure {...fig} />
      <circle className={m.glow} cx={target.x} cy={target.y} r="2.6" fill="var(--cinnabar)" />
      <StandingApprentice cx={58}>
        <RestingSleeve x={45} y={62} />
        <g className={m.poke}>
          <Sleeve x1={64} y1={57} x2={90} y2={target.y} />
          <Needle tipX={target.x - 5} y={target.y} />
        </g>
      </StandingApprentice>
    </>
  );
}
