"use client";

import { CORRESPONDENCE, ELEMENTS, type Element } from "@/lib/wuxing";
import { ORGANS, type Organ } from "@/lib/organs";

/**
 * 人体正面示意图（面对读者，所以人体右侧在图的左边）。
 * 只是示意位置，不是解剖图谱：形状简化，肾在身体后侧用虚线表示。
 */
const SHAPES: Record<Organ, { d: string | string[]; label: [number, number]; back?: boolean }> = {
  肺: {
    // 左右两叶
    d: ["M112,96 C96,94 80,108 76,136 C72,162 74,186 82,196 C92,200 104,194 110,186 L112,120 Z", "M128,96 C144,94 160,108 164,136 C168,162 166,186 158,196 C148,200 138,194 134,188 C138,176 132,166 128,160 Z"],
    label: [92, 150],
  },
  心: { d: "M120,150 C112,140 100,146 102,158 C104,170 118,180 128,188 C138,178 146,168 146,158 C146,146 134,140 126,150 Z", label: [124, 166] },
  肝: { d: "M74,204 C80,196 120,196 146,202 C150,206 146,214 136,220 C120,232 96,240 82,236 C72,230 70,214 74,204 Z", label: [100, 218] },
  胆: { d: "M98,236 C94,240 94,250 100,252 C106,252 108,244 104,238 Z", label: [88, 252] },
  胃: { d: "M138,206 C152,200 166,208 164,222 C162,238 150,248 136,250 C126,252 120,246 124,240 C134,236 142,228 138,206 Z", label: [148, 228] },
  脾: { d: "M166,200 C176,202 178,218 172,230 C166,232 160,224 162,212 Z", label: [178, 214] },
  肾: {
    d: ["M88,232 C78,232 76,254 86,262 C94,264 96,252 92,246 C96,240 96,232 88,232 Z", "M152,232 C162,232 164,254 154,262 C146,264 144,252 148,246 C144,240 144,232 152,232 Z"],
    label: [70, 248],
    back: true,
  },
  大肠: {
    d: "M84,300 L84,262 C84,254 90,252 98,254 L142,254 C150,252 156,254 156,262 L156,306 C156,318 148,322 140,318 L140,310 L148,306 L148,264 L92,264 L92,300 Z",
    label: [170, 290],
  },
  小肠: {
    d: "M98,270 C110,266 130,266 142,270 C146,280 144,290 140,298 C128,304 112,304 100,298 C96,290 94,280 98,270 Z",
    label: [120, 286],
  },
  膀胱: { d: "M108,318 C108,310 132,310 132,318 C134,330 126,338 120,338 C114,338 106,330 108,318 Z", label: [120, 328] },
};

const ORGAN_ELEMENT = Object.fromEntries(ORGANS.map((o) => [o.name, o.element])) as Record<Organ, Element>;

export function BodyMap({ selected, onSelect }: { selected: Element | null; onSelect: (e: Element | null) => void }) {
  const lit = (o: Organ) => selected !== null && ORGAN_ELEMENT[o] === selected;
  return (
    <figure className="space-y-2">
      <svg viewBox="40 10 170 345" className="mx-auto w-full max-w-[16rem]" role="img" aria-label="五脏六腑位置示意图" data-testid="body-map">
        {/* 人体轮廓 */}
        <g fill="var(--card)" stroke="var(--line)" strokeWidth="2" pointerEvents="none">
          <circle cx="120" cy="40" r="24" />
          <path d="M108,62 L132,62 L134,76 C160,80 178,86 186,100 L196,180 L184,184 L172,120 L170,200 C172,250 168,300 160,340 L80,340 C72,300 68,250 70,200 L68,120 L56,184 L44,180 L54,100 C62,86 80,80 106,76 Z" />
        </g>
        {/* 高亮的脏腑画在最上层（肾在背后，平时会被挡住一部分） */}
        {(Object.keys(SHAPES) as Organ[])
          .sort((a, b) => Number(lit(a)) - Number(lit(b)))
          .map((o) => {
          const s = SHAPES[o];
          const e = ORGAN_ELEMENT[o];
          const on = lit(o);
          return (
            <g
              key={o}
              onClick={() => onSelect(selected === e ? null : e)}
              className="cursor-pointer"
              role="button"
              aria-label={`${o}（属${e}）`}
              aria-pressed={on}
              data-testid={`organ-${o}`}
              data-lit={on ? "true" : "false"}
            >
              {(Array.isArray(s.d) ? s.d : [s.d]).map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={on ? CORRESPONDENCE[e].hex : "#e9dcc6"}
                  fillOpacity={on ? 0.9 : selected ? 0.35 : 0.8}
                  stroke={on ? "var(--ink)" : "#b9a88c"}
                  strokeWidth={on ? 1.5 : 1}
                  strokeDasharray={s.back ? "3 2" : undefined}
                  style={{ transition: "fill 300ms, fill-opacity 300ms" }}
                />
              ))}
              <text
                x={s.label[0]}
                y={s.label[1]}
                textAnchor="middle"
                dy="0.35em"
                fontSize="9"
                fontWeight={on ? 700 : 400}
                fill={on ? "var(--ink)" : "var(--muted)"}
                pointerEvents="none"
              >
                {o}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-center text-xs text-muted">
        正面示意（人体右侧在图的左边；肾在背后，用虚线）。中医的脏腑指功能系统，和解剖器官不完全一一对应，尤其是「脾」。
      </figcaption>
      <div className="flex flex-wrap justify-center gap-1 text-xs" aria-hidden>
        {ELEMENTS.map((e) => (
          <span key={e} className="rounded-full px-2 py-0.5 text-white" style={{ background: CORRESPONDENCE[e].hex, opacity: selected && selected !== e ? 0.35 : 1 }}>
            {e}：{CORRESPONDENCE[e].zang}·{CORRESPONDENCE[e].fu}
          </span>
        ))}
      </div>
    </figure>
  );
}
