import Link from "next/link";
import type { Metadata } from "next";
import { YinyangDiagram } from "./yinyang-diagram";

export const metadata: Metadata = { title: "阴阳 · 药柜学堂" };

export default function YinyangPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link href="/learn" className="text-sm text-muted">← 学习路径</Link>
        <h1 className="mt-1 font-serif text-2xl font-bold">阴阳</h1>
        <blockquote className="mt-2 border-l-4 border-cinnabar pl-3 font-serif text-base">
          阴阳者，天地之道也，万物之纲纪，变化之父母，生杀之本始，神明之府也。
          <footer className="mt-1 font-sans text-xs text-muted">——《黄帝内经·素问·阴阳应象大论》</footer>
        </blockquote>
      </div>
      <YinyangDiagram />
      <section className="card space-y-2 text-sm">
        <h2 className="font-serif text-lg font-bold">四个关键词</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>对立</b>：昼与夜、动与静、热与寒。</li>
          <li><b>互根</b>：没有阴就无所谓阳，彼此依存。</li>
          <li><b>消长</b>：此消彼长，拖动上面的时间看一天里的变化。</li>
          <li><b>转化</b>：「重阴必阳，重阳必阴」，到了极点会向对方转化。</li>
        </ul>
      </section>
      <p className="text-xs text-muted">仅作科普，待李医生审核；不作为诊断或用药依据。</p>
    </div>
  );
}
