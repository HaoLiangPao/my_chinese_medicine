import Link from "next/link";
import type { Metadata } from "next";
import { WuxingDiagram } from "./wuxing-diagram";

export const metadata: Metadata = { title: "五行 · 药柜学堂" };

export default function WuxingPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link href="/learn" className="text-sm text-muted">← 学习路径</Link>
        <h1 className="mt-1 font-serif text-2xl font-bold">五行：木 火 土 金 水</h1>
        <p className="mt-1 text-sm text-muted">中医用五行来归类五脏的功能，并解释它们之间相互促进（相生）、相互制约（相克）的关系。</p>
      </div>
      <WuxingDiagram />
      <ReviewNote />
    </div>
  );
}

function ReviewNote() {
  return <p className="text-xs text-muted">内容为中医基础理论的通行说法，仅作科普，待李医生审核；不作为诊断或用药依据。</p>;
}
