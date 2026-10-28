import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "学习路径 · 药柜学堂" };

type Lesson = { title: string; href?: string; note?: string };
type Stage = { n: number; title: string; desc: string; lessons: Lesson[] };

// 草案：书目和顺序待和李医生确认（见 docs/design/0005）
const STAGES: Stage[] = [
  {
    n: 1,
    title: "入门：中医怎么看身体",
    desc: "不需要任何基础。先建立整体观的直觉。",
    lessons: [{ title: "整体观与辨证论治" }, { title: "为什么同一个病，不同的人吃不同的药" }],
  },
  {
    n: 2,
    title: "基础理论",
    desc: "用交互图理解最核心的几个概念。",
    lessons: [
      { title: "阴阳", href: "/learn/yinyang" },
      { title: "五行与五脏", href: "/learn/wuxing" },
      { title: "脏腑：五脏六腑各管什么" },
      { title: "气、血、津液" },
      { title: "经络与穴位", note: "3D 人体图，规划中" },
    ],
  },
  {
    n: 3,
    title: "中药入门",
    desc: "和你家的药柜连起来：认识自己常用的药。",
    lessons: [{ title: "四气五味、归经" }, { title: "常用药材图鉴（党参、黄芪、麦冬……）" }, { title: "读懂一张药方：君臣佐使" }],
  },
  {
    n: 4,
    title: "经典",
    desc: "原文 + 白话 + 讲解。具体篇目和版本待李医生确认。",
    lessons: [{ title: "《黄帝内经》选读（素问 · 灵枢）" }, { title: "《伤寒论》选读" }],
  },
];

export default function LearnPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">药柜学堂</h1>
        <p className="mt-1 text-sm text-muted">从零开始的中医入门路径。这部分不用登录，可以直接分享给朋友。</p>
      </div>
      <ol className="space-y-4" data-testid="learn-path">
        {STAGES.map((s) => (
          <li key={s.n} className="card">
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-3xl font-bold text-cinnabar">{s.n}</span>
              <div>
                <h2 className="font-serif text-lg font-bold">{s.title}</h2>
                <p className="text-sm text-muted">{s.desc}</p>
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {s.lessons.map((l) =>
                l.href ? (
                  <li key={l.title}>
                    <Link href={l.href} className="inline-block rounded-full border border-cinnabar px-3 py-1 text-sm text-cinnabar hover:bg-paper">
                      {l.title} →
                    </Link>
                  </li>
                ) : (
                  <li key={l.title} className="rounded-full border border-line px-3 py-1 text-sm text-muted">
                    {l.title}
                    <span className="ml-1 text-xs">（{l.note ?? "待写"}）</span>
                  </li>
                ),
              )}
            </ul>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">所有科普内容都只用于了解中医，不作为诊断或用药依据；有不适请咨询医生。</p>
    </div>
  );
}
