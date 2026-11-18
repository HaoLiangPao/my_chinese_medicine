import type { ReactNode } from "react";
import { Hand, RestingSleeve, Sleeve, StandingApprentice, shoulders } from "@/components/art/apprentice";
import { CINNABAR, paint } from "@/components/art/palette";
import { Picture } from "@/components/art/picture";
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
 * 小学徒的五个动作（docs/design/0019 §3）。每个场景是 viewBox 0 0 160 120 里的一组图形，画在宣纸色的画片上（Picture）。
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
    <Picture
      viewBox="0 0 160 120"
      className={className}
      label={`小学徒在${actionLabel(action)}`}
      data-testid="apprentice-scene"
      data-action={action}
    >
      <Scene />
    </Picture>
  );
}

/** 读书：站在药柜前双手捧着书卷，眼睛往下看，一边看一边点头 */
function Reading() {
  const cx = 60;
  const { left, right } = shoulders(cx);
  const scroll = { x: cx - 13, y: 64, w: 26, h: 13 };
  const hands = { y: scroll.y + 7, l: scroll.x - 2, r: scroll.x + scroll.w + 2 };
  return (
    <>
      <MedicineCabinet x={104} y={20} cols={3} rows={6} cell={13} />
      <StandingApprentice cx={cx} face="focus" headClass={m.nod}>
        <Sleeve x1={left.x} y1={left.y} x2={hands.l} y2={hands.y} cuff={4.6} hand={false} />
        <Sleeve x1={right.x} y1={right.y} x2={hands.r} y2={hands.y} cuff={4.6} hand={false} />
        <OpenScroll {...scroll} />
        <Hand x={hands.l} y={hands.y} />
        <Hand x={hands.r} y={hands.y} />
      </StandingApprentice>
    </>
  );
}

/** 捣药：站在药臼后面，双手握杵一下一下地捣，药末飞起来；旁边一盘药材 */
function Pounding() {
  const cx = 66;
  const { left, right } = shoulders(cx);
  const px = cx + 2.5;
  const low = { x: px - 1, y: 74 };
  const high = { x: px + 1, y: 67 };
  return (
    <>
      <ellipse cx="124" cy="101" rx="18" ry="4.5" {...paint.wood} />
      <ellipse cx="117" cy="98.5" rx="4" ry="2" {...paint.herb} />
      <ellipse cx="126" cy="98" rx="3.5" ry="1.8" {...paint.herb2} />
      <ellipse cx="132" cy="99.2" rx="3.2" ry="1.6" {...paint.herb} />
      <StandingApprentice cx={cx} face="focus">
        <Mortar x={px} y={84} part="back" />
        <g className={m.pound}>
          <Sleeve x1={left.x} y1={left.y} x2={low.x} y2={low.y} cuff={4.2} hand={false} />
          <Sleeve x1={right.x} y1={right.y} x2={high.x} y2={high.y} cuff={4.2} hand={false} />
          <Pestle x={px} top={62} bottom={86} />
          <Hand {...low} />
          <Hand {...high} />
        </g>
        <Mortar x={px} y={84} part="front" />
      </StandingApprentice>
      <g className={m.puff}>
        <circle cx="60" cy="80" r="1.3" {...paint.herb} />
        <circle cx="77" cy="79" r="1.1" {...paint.herb2} />
        <circle cx="73" cy="76" r="0.9" {...paint.herb} />
      </g>
    </>
  );
}

/** 称药：右手提着戥子，秤杆轻轻晃，眼睛看着秤星 */
function Weighing() {
  const cx = 52;
  const { left, right } = shoulders(cx);
  const px = 84;
  const py = 50;
  return (
    <StandingApprentice cx={cx} look={1}>
      <RestingSleeve {...left} side="left" />
      <DengziCord x={px} y={py} />
      <g className={m.tilt} style={{ transformOrigin: `${px}px ${py}px` }}>
        <DengziBeam x={px} y={py} />
      </g>
      <Sleeve x1={right.x} y1={right.y} x2={px} y2={py - 13} />
    </StandingApprentice>
  );
}

/** 翻药斗：伸手拉开百子柜的一个抽屉看看，再推回去；头和眼睛跟着转过去 */
function SearchingDrawers() {
  const cx = 54;
  const { left, right } = shoulders(cx);
  const cab = { x: 84, y: 14, cell: 12 };
  const target = drawerAt(cab.x, cab.y, cab.cell, 0, 3);
  return (
    <>
      <MedicineCabinet {...cab} cols={5} rows={6} skip={[[0, 3]]} />
      <StandingApprentice cx={cx} look={1} headClass={m.look}>
        <RestingSleeve {...left} side="left" />
        <g className={m.pull}>
          <Drawer {...target} />
          <Sleeve x1={right.x} y1={right.y} x2={target.x - 1} y2={target.y + target.size * 0.68} />
        </g>
      </StandingApprentice>
    </>
  );
}

/** 练针灸：对着铜人找穴位，手里的针一进一退，穴位一闪一闪 */
function PracticingNeedles() {
  const cx = 58;
  const { left, right } = shoulders(cx);
  const fig = { cx: 124, top: 16 };
  const target = { x: fig.cx - 11.75, y: fig.top + 30 };
  return (
    <>
      <BronzeFigure {...fig} />
      <circle className={m.glow} cx={target.x} cy={target.y} r="2.6" fill={CINNABAR} />
      <StandingApprentice cx={cx} face="focus" look={1}>
        <RestingSleeve {...left} side="left" />
        <g className={m.poke}>
          <Sleeve x1={right.x} y1={right.y} x2={92} y2={target.y + 1} />
          <Needle tipX={target.x - 5} y={target.y} />
        </g>
      </StandingApprentice>
    </>
  );
}
