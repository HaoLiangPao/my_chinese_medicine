import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import {
  ApprenticeHead,
  BowingApprentice,
  RestingSleeve,
  StandingApprentice,
  shoulders,
  type ApprenticeFace,
} from "@/components/art/apprentice";
import { Picture } from "@/components/art/picture";
import {
  BronzeFigure,
  DengziBeam,
  DengziCord,
  MedicineCabinet,
  Mortar,
  Needle,
  OpenScroll,
  Pestle,
  RolledScroll,
} from "@/components/art/props";
import { ApprenticeScene } from "@/components/apprentice/scenes";
import { APPRENTICE_ACTIONS, DISCLAIMER } from "@/lib/apprentice";

/**
 * 认识小学徒 / 素材库（docs/design/0019 §2）：所有动作和道具都摆出来，方便看效果、以后加素材时对照。
 * 只有画，不读数据库。
 */
export default function ApprenticePage() {
  return (
    <>
      <Link href="/herbs" className="text-sm text-muted">
        ← 药材
      </Link>
      <PageHeader title="认识小学徒" subtitle="住在百子柜前的小学徒，每次打开药材页随机做一件事" />
      <div className="space-y-6">
        <section className="card space-y-2 text-sm">
          <p>
            小学徒梳着两个发髻、系着朱砂红的发带，穿松绿的交领长衫，腰间挂一个小药囊，正在学中药：读书、捣药、称药、翻药斗、对着铜人练针灸。打开药材页时，小学徒会随机做一件事，顺便说一句这味药的知识（拼音、分类、别名、炮制品，以及医生审核过的资料）。
          </p>
          <p className="text-muted">{DISCLAIMER}。</p>
        </section>

        <section>
          <h2 className="mb-2 font-serif text-lg font-bold">五个动作</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {APPRENTICE_ACTIONS.map((a) => (
              <figure key={a.id} className="card flex flex-col items-center p-2" data-testid={`gallery-${a.id}`}>
                <ApprenticeScene action={a.id} className="h-auto w-full max-w-[200px]" />
                <figcaption className="text-sm">{a.label}</figcaption>
              </figure>
            ))}
            <figure className="card flex flex-col items-center p-2" data-testid="gallery-bow">
              <BowingApprentice className="h-auto w-full max-w-[150px]" />
              <figcaption className="text-sm">鞠躬（抱歉）</figcaption>
            </figure>
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-serif text-lg font-bold">表情</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {FACES.map(([face, label]) => (
              <figure key={face} className="card flex flex-col items-center p-2" data-testid={`face-${face}`}>
                <Picture viewBox="-26 -25 52 46" className="h-20 w-full" label={`小学徒${label}`}>
                  <ApprenticeHead face={face} />
                </Picture>
                <figcaption className="text-xs text-muted">{label}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-serif text-lg font-bold">道具</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <Prop label="小学徒" viewBox="34 16 56 96">
              <StandingApprentice cx={62}>
                <RestingSleeve {...shoulders(62).left} side="left" />
                <RestingSleeve {...shoulders(62).right} side="right" />
              </StandingApprentice>
            </Prop>
            <Prop label="百子柜" viewBox="0 0 64 74">
              <MedicineCabinet x={4} y={6} cols={4} rows={4} cell={13} />
            </Prop>
            <Prop label="书卷" viewBox="0 0 60 50">
              <OpenScroll x={12} y={8} w={36} h={18} />
              <RolledScroll x={30} y={40} />
            </Prop>
            <Prop label="药臼和杵" viewBox="0 0 60 60">
              <Mortar x={30} y={32} />
              <Pestle x={36} top={8} bottom={36} />
            </Prop>
            <Prop label="戥子" viewBox="0 0 70 50">
              <DengziCord x={22} y={16} />
              <DengziBeam x={22} y={16} />
            </Prop>
            <Prop label="针灸铜人和针" viewBox="0 0 60 84">
              <BronzeFigure cx={34} top={3} />
              <Needle tipX={20} y={33} />
            </Prop>
          </div>
        </section>
      </div>
    </>
  );
}

const FACES: [ApprenticeFace, string][] = [
  ["neutral", "平常"],
  ["happy", "开心"],
  ["focus", "认真"],
  ["confused", "困惑"],
  ["sorry", "抱歉"],
];

/** 一个道具摆在一张画片上；viewBox 是道具本身的范围，四周再留 6 的空白 */
function Prop({ label, viewBox, children }: { label: string; viewBox: string; children: ReactNode }) {
  const [x, y, w, h] = viewBox.split(" ").map(Number);
  const pad = 6;
  return (
    <figure className="card flex flex-col items-center p-2">
      <Picture viewBox={`${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}`} className="h-20 w-full" label={label}>
        {children}
      </Picture>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
