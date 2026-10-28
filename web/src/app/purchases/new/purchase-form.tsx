"use client";

import { useActionState, useState } from "react";
import { createPurchase, type SaveState } from "../actions";

type Line = { key: number; name: string; grams: string; price: string };
let k = 1;
const blank = (): Line => ({ key: k++, name: "", grams: "", price: "" });

export function PurchaseForm({ herbNames, storeNames, today }: { herbNames: string[]; storeNames: string[]; today: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(createPurchase, {});
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.name.trim() && Number(l.grams) > 0 && l.price !== "");
  const total = filled.reduce((s, l) => s + Number(l.price), 0);

  return (
    <form action={action} className="space-y-5">
      <div className="card grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="label">店铺</label>
          <input name="store_name" list="store-names" placeholder="如：T&T、李医生诊所" className="input" />
          <datalist id="store-names">
            {storeNames.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="store_kind">店铺类型（新店才用）</label>
          <select id="store_kind" name="store_kind" defaultValue="shop" className="input">
            <option value="shop">药行</option>
            <option value="clinic">诊所</option>
            <option value="online">网店</option>
          </select>
        </div>
        <div>
          <label className="label">日期</label>
          <input name="purchased_on" type="date" defaultValue={today} className="input" />
        </div>
      </div>

      <div className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-bold">明细</h2>
          <span className="text-sm text-muted">合计 ${total.toFixed(2)}</span>
        </div>
        <datalist id="herb-names">
          {herbNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2 text-xs text-muted">
          <span>药材</span><span>克数</span><span>总价 $</span><span />
        </div>
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_5rem_5rem_2rem] items-center gap-2">
            <input list="herb-names" value={l.name} onChange={(e) => set(l.key, { name: e.target.value })} placeholder="药名" aria-label="药名" className="input" />
            <input type="number" step="0.5" min={0} value={l.grams} onChange={(e) => set(l.key, { grams: e.target.value })} aria-label="克数" className="input" />
            <input type="number" step="0.01" min={0} value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} aria-label="总价" className="input" />
            <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-muted hover:text-cinnabar" aria-label="删除">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="btn-ghost w-full">＋ 加一行</button>
        <p className="text-xs text-muted">提示：按斤买的，1 斤 = 500 g。</p>
      </div>

      <input type="hidden" name="items" value={JSON.stringify(filled.map((l) => ({ name: l.name, grams: Number(l.grams), price: Number(l.price) })))} />
      <div>
        <label className="label">备注</label>
        <input name="notes" className="input" />
      </div>
      {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
      <button disabled={pending || filled.length === 0} className="btn-primary w-full py-3">{pending ? "保存中…" : "保存"}</button>
    </form>
  );
}
