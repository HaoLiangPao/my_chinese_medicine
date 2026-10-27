"use client";

import { useState } from "react";
import { CORRESPONDENCE, ELEMENTS, controls, generates, relation, type Element } from "@/lib/wuxing";

type Mode = "sheng" | "ke" | "both";

const C = { x: 200, y: 205 };
const R = 140;
// 火在上，顺时针：火 → 土 → 金 → 水 → 木（相生方向）
const ANGLE: Record<Element, number> = { 火: -90, 土: -18, 金: 54, 水: 126, 木: 198 };
const pos = (e: Element, r = R) => {
  const a = (ANGLE[e] * Math.PI) / 180;
  return { x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) };
};
const NODE_R = 34;

/** 两个节点之间、从圆边到圆边的线段（留出箭头位置） */
function edge(a: Element, b: Element, curve: boolean) {
  const p = pos(a), q = pos(b);
  const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
  const ux = dx / d, uy = dy / d;
  const s = { x: p.x + ux * (NODE_R + 4), y: p.y + uy * (NODE_R + 4) };
  const t = { x: q.x - ux * (NODE_R + 10), y: q.y - uy * (NODE_R + 10) };
  if (!curve) return `M${s.x},${s.y} L${t.x},${t.y}`;
  // 相生画成向外鼓的弧
  const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
  const ox = mx - C.x, oy = my - C.y, od = Math.hypot(ox, oy);
  const k = 26;
  return `M${s.x},${s.y} Q${mx + (ox / od) * k},${my + (oy / od) * k} ${t.x},${t.y}`;
}

const REL_STYLE: Record<string, string> = {
  我生: "fill-jade",
  生我: "fill-jade",
  我克: "fill-cinnabar",
  克我: "fill-cinnabar",
};

export function WuxingDiagram() {
  const [mode, setMode] = useState<Mode>("sheng");
  const [sel, setSel] = useState<Element | null>(null);

  const showSheng = mode !== "ke";
  const showKe = mode !== "sheng";
  const active = (a: Element, b: Element) => !sel || sel === a || sel === b;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm" role="tablist" aria-label="显示">
        {([
          ["sheng", "相生"],
          ["ke", "相克"],
          ["both", "生克都看"],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full border px-3 py-1 ${mode === m ? "border-cinnabar text-cinnabar" : "border-line"}`}
          >
            {label}
          </button>
        ))}
        {sel && (
          <button onClick={() => setSel(null)} className="rounded-full border border-line px-3 py-1 text-muted">
            取消选择
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <svg viewBox="0 0 400 410" className="mx-auto w-full max-w-md" role="img" aria-label="五行生克图" data-testid="wuxing-svg">
          <defs>
            <marker id="arrow-sheng" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--jade)" />
            </marker>
            <marker id="arrow-ke" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--cinnabar)" />
            </marker>
          </defs>
          <style>{`
            .flow { stroke-dasharray: 6 6; animation: flow 1.2s linear infinite; }
            @keyframes flow { to { stroke-dashoffset: -12; } }
            @media (prefers-reduced-motion: reduce) { .flow { animation: none; } }
          `}</style>

          {showSheng &&
            ELEMENTS.map((e) => (
              <path
                key={`s-${e}`}
                d={edge(e, generates(e), true)}
                fill="none"
                stroke="var(--jade)"
                strokeWidth={active(e, generates(e)) ? 3 : 1.5}
                opacity={active(e, generates(e)) ? 1 : 0.2}
                markerEnd="url(#arrow-sheng)"
                className="flow"
                data-testid={`sheng-${e}${generates(e)}`}
              />
            ))}
          {showKe &&
            ELEMENTS.map((e) => (
              <path
                key={`k-${e}`}
                d={edge(e, controls(e), false)}
                fill="none"
                stroke="var(--cinnabar)"
                strokeWidth={active(e, controls(e)) ? 2.5 : 1.2}
                opacity={active(e, controls(e)) ? 0.9 : 0.15}
                markerEnd="url(#arrow-ke)"
                className="flow"
                data-testid={`ke-${e}${controls(e)}`}
              />
            ))}

          {ELEMENTS.map((e) => {
            const p = pos(e);
            const c = CORRESPONDENCE[e];
            const rel = sel ? relation(sel, e) : null;
            return (
              <g
                key={e}
                transform={`translate(${p.x},${p.y})`}
                onClick={() => setSel(sel === e ? null : e)}
                className="cursor-pointer"
                role="button"
                aria-label={`${e}（${c.zang}）`}
                aria-pressed={sel === e}
                data-testid={`node-${e}`}
              >
                <circle r={NODE_R} fill={c.hex} stroke={sel === e ? "var(--ink)" : "white"} strokeWidth={sel === e ? 4 : 2} />
                <text textAnchor="middle" dy="0.1em" fontSize="26" fontWeight="700" fill="white" className="font-serif">{e}</text>
                <text textAnchor="middle" dy="1.5em" fontSize="12" fill="white">{c.zang} · {c.fu}</text>
                {rel && rel !== "same" && (
                  <g transform={`translate(0,${-NODE_R - 14})`} data-testid={`rel-${e}`}>
                    <rect x="-22" y="-11" width="44" height="20" rx="10" fill="white" stroke="var(--line)" />
                    <text textAnchor="middle" dy="0.35em" fontSize="12" className={REL_STYLE[rel]}>{rel}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        <aside className="card text-sm" data-testid="wuxing-panel" aria-live="polite">
          {!sel ? (
            <div className="space-y-2 text-muted">
              <p>点一个圆，看它和其他四行的关系，以及它对应的脏腑、季节、颜色……</p>
              <p><span className="text-jade">绿色箭头</span>是<b className="text-ink">相生</b>：木生火、火生土、土生金、金生水、水生木。</p>
              <p><span className="text-cinnabar">红色箭头</span>是<b className="text-ink">相克</b>：木克土、土克水、水克火、火克金、金克木。</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="font-serif text-xl font-bold" style={{ color: CORRESPONDENCE[sel].hex }}>{sel}</h3>
              <table className="data-table">
                <tbody>
                  {([
                    ["五脏", CORRESPONDENCE[sel].zang],
                    ["六腑", CORRESPONDENCE[sel].fu],
                    ["季节", CORRESPONDENCE[sel].season],
                    ["方位", CORRESPONDENCE[sel].direction],
                    ["五色", CORRESPONDENCE[sel].color],
                    ["五味", CORRESPONDENCE[sel].taste],
                    ["五志", CORRESPONDENCE[sel].emotion],
                    ["开窍", CORRESPONDENCE[sel].sense],
                  ] as const).map(([k, v]) => (
                    <tr key={k}><td className="text-muted">{k}</td><td data-testid={`corr-${k}`}>{v}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted">
                {sel}生{generates(sel)}（{CORRESPONDENCE[sel].zang}→{CORRESPONDENCE[generates(sel)].zang}），
                {sel}克{controls(sel)}（{CORRESPONDENCE[sel].zang}→{CORRESPONDENCE[controls(sel)].zang}）。
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
