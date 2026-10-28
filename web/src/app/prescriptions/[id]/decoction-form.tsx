"use client";

import { useActionState, useState } from "react";
import { recordDecoction, type SaveState } from "../actions";
import { plannedGrams, type PlanItem } from "@/lib/decoction";

type Extra = { key: number; name: string; grams: string };
let k = 1;

/** 煎药表单：默认按处方量，可以逐味改实际克数，也可以加处方外的药 */
export function DecoctionForm({
  prescriptionId,
  plan,
  defaultDoses,
  maxDoses,
  herbNames,
}: {
  prescriptionId: string;
  plan: PlanItem[];
  defaultDoses: number;
  maxDoses: number;
  herbNames: string[];
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(recordDecoction, {});
  const [doses, setDoses] = useState(String(defaultDoses));
  const [actual, setActual] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const n = Math.max(0, Number(doses) || 0);

  return (
    <form
      action={action}
      className="space-y-3"
      data-testid="decoction-form"
    >
      <input type="hidden" name="id" value={prescriptionId} />
      <input type="hidden" name="actual" value={JSON.stringify(actual)} />
      <input
        type="hidden"
        name="extras"
        value={JSON.stringify(extras.map((e) => ({ name: e.name, grams: Number(e.grams) })))}
      />
      <p className="text-sm text-muted">
        按现有库存最多能煎 <b className="text-ink">{maxDoses}</b> 副。默认按处方量扣库存；实际多放、少放或没放的，直接改右边的克数（是这次的总量）。
      </p>
      <div className="flex items-center gap-2">
        <label className="text-sm" htmlFor="doses">煎</label>
        <input id="doses" name="doses" type="number" min={1} step={1} value={doses} onChange={(e) => setDoses(e.target.value)} className="input w-20" />
        <span className="text-sm">副</span>
      </div>

      <div className="grid grid-cols-[1fr_6rem_6rem] items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-xs text-muted">药材</span>
        <span className="text-right text-xs text-muted">处方量</span>
        <span className="text-xs text-muted">实际用量 g</span>
        {plan.map((p) => {
          const planned = plannedGrams(p, n);
          const v = actual[p.herb_id];
          const changed = v !== undefined && v !== "" && Number(v) !== planned;
          return (
            <div key={p.herb_id} className="contents">
              <span>{p.name}</span>
              <span className="text-right text-muted">{planned} g</span>
              <input
                aria-label={`${p.name} 实际用量`}
                type="number"
                step="0.5"
                min={0}
                placeholder={String(planned)}
                value={v ?? ""}
                onChange={(e) => setActual((a) => ({ ...a, [p.herb_id]: e.target.value }))}
                className={`input py-1 ${changed ? "border-amber text-amber" : ""}`}
              />
            </div>
          );
        })}
      </div>

      <datalist id="herb-names-decoction">
        {herbNames.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
      {extras.map((e) => (
        <div key={e.key} className="grid grid-cols-[1fr_6rem_2rem] items-center gap-2">
          <input
            aria-label="加的药"
            list="herb-names-decoction"
            value={e.name}
            placeholder="处方外加的药，如 生姜"
            onChange={(ev) => setExtras((xs) => xs.map((x) => (x.key === e.key ? { ...x, name: ev.target.value } : x)))}
            className="input py-1"
          />
          <input
            aria-label="加的药克数"
            type="number"
            step="0.5"
            min={0}
            value={e.grams}
            placeholder="g"
            onChange={(ev) => setExtras((xs) => xs.map((x) => (x.key === e.key ? { ...x, grams: ev.target.value } : x)))}
            className="input py-1"
          />
          <button type="button" onClick={() => setExtras((xs) => xs.filter((x) => x.key !== e.key))} className="text-muted" aria-label="删除">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => setExtras((xs) => [...xs, { key: k++, name: "", grams: "" }])} className="btn-ghost w-full py-1">
        ＋ 加一味处方外的药
      </button>
      <input name="note" placeholder="备注（可选）" className="input" />
      {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
      <button disabled={pending || n <= 0} className="btn-primary">{pending ? "记录中…" : `煎 ${n} 副，扣库存`}</button>
    </form>
  );
}
