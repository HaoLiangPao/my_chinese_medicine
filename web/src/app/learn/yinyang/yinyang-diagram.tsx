"use client";

import { useEffect, useState } from "react";
import { shichen, yangShare } from "@/lib/wuxing";

const R = 90;
// 太极图：底色为阳（浅），这条路径是阴（深）
const YIN = `M0,${-R} A${R},${R} 0 0 1 0,${R} A${R / 2},${R / 2} 0 0 1 0,0 A${R / 2},${R / 2} 0 0 0 0,${-R} Z`;
const LABELS = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

export function YinyangDiagram() {
  const [hour, setHour] = useState(6);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setHour((h) => (h + 0.25) % 24), 120);
    return () => clearInterval(t);
  }, [playing]);

  const yang = yangShare(hour);
  const pct = Math.round(yang * 100);
  // 时钟：子时（0 点）在正下方、午时（12 点）在正上方
  const ang = ((hour / 24) * 360 + 90) * (Math.PI / 180);
  const sun = { x: 150 + 128 * Math.cos(ang), y: 150 + 128 * Math.sin(ang) };
  const phase = hour < 12 ? "阳长阴消" : "阴长阳消";

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-sm" role="img" aria-label="太极图与一日阴阳消长" data-testid="yinyang-svg">
        <style>{`
          .spin { animation: spin 24s linear infinite; transform-origin: 150px 150px; transform-box: view-box; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
        `}</style>
        {/* 外圈：十二时辰 */}
        <circle cx="150" cy="150" r="128" fill="none" stroke="var(--line)" strokeWidth="18" />
        {LABELS.map((l, i) => {
          const a = ((i * 2) / 24) * 2 * Math.PI + Math.PI / 2;
          return (
            <text key={l} x={150 + 128 * Math.cos(a)} y={150 + 128 * Math.sin(a)} textAnchor="middle" dy="0.35em" fontSize="11" fill="var(--muted)">
              {l}
            </text>
          );
        })}
        <circle cx={sun.x} cy={sun.y} r="9" fill={yang >= 0.5 ? "var(--amber)" : "var(--ink)"} stroke="white" strokeWidth="2" data-testid="sun" />

        <g className="spin">
          <g transform="translate(150,150)">
            <circle r={R} fill="#f3ead8" stroke="var(--ink)" strokeWidth="1.5" />
            <path d={YIN} fill="#2a2723" />
            <circle cy={-R / 2} r={R / 7} fill="#2a2723" />
            <circle cy={R / 2} r={R / 7} fill="#f3ead8" />
          </g>
        </g>
      </svg>

      <div className="card space-y-3 text-sm" aria-live="polite">
        <div>
          <label htmlFor="hour" className="label">一天中的时间</label>
          <input id="hour" type="range" min={0} max={23.75} step={0.25} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="w-full accent-[var(--cinnabar)]" />
          <div className="flex justify-between text-xs text-muted"><span>0 点</span><span>12 点</span><span>24 点</span></div>
        </div>
        <p data-testid="yy-time">
          {String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round((hour % 1) * 60)).padStart(2, "0")} · <b>{shichen(hour)}</b> · {phase}
        </p>
        <div className="flex h-4 overflow-hidden rounded-full border border-line" aria-hidden>
          <div className="bg-amber" style={{ width: `${pct}%` }} />
          <div className="flex-1 bg-ink" />
        </div>
        <p data-testid="yy-share">阳 {pct}% · 阴 {100 - pct}%</p>
        <button onClick={() => setPlaying((p) => !p)} className="btn-ghost w-full py-1">{playing ? "暂停" : "▶ 播放一天"}</button>
        <p className="text-xs text-muted">示意图：子时阴极而一阳生，午时阳极而一阴生。比例只用来说明「消长」的趋势，不是量化指标。</p>
      </div>
    </div>
  );
}
