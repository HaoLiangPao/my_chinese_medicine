"use client";

import { useActionState, useState } from "react";
import { createPurchase, type SaveState } from "../actions";

type Line = {
  key: number;
  name: string;
  grams: string;
  price: string;
  origin: string;
  supplierLot: string;
  packedOn: string;
  showBatch: boolean;
};
let k = 1;
const blank = (): Line => ({ key: k++, name: "", grams: "", price: "", origin: "", supplierLot: "", packedOn: "", showBatch: false });

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
          <label className="label" htmlFor="store_kind">
            店铺类型（新店才用）
          </label>
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
          <span>药材</span>
          <span>克数</span>
          <span>总价 $</span>
          <span />
        </div>
        {lines.map((l) => (
          <div key={l.key} className="space-y-1" data-testid="purchase-line">
            <div className="grid grid-cols-[1fr_5rem_5rem_2rem] items-center gap-2">
              <input
                list="herb-names"
                value={l.name}
                onChange={(e) => set(l.key, { name: e.target.value })}
                placeholder="药名"
                aria-label="药名"
                className="input"
              />
              <input
                type="number"
                step="0.5"
                min={0}
                value={l.grams}
                onChange={(e) => set(l.key, { grams: e.target.value })}
                aria-label="克数"
                className="input"
              />
              <input
                type="number"
                step="0.01"
                min={0}
                value={l.price}
                onChange={(e) => set(l.key, { price: e.target.value })}
                aria-label="总价"
                className="input"
              />
              <button
                data-bug-label="删这一行"
                type="button"
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                className="text-muted hover:text-cinnabar"
                aria-label="删除"
              >
                ✕
              </button>
            </div>
            {/* 批次信息（docs/design/0010 §3.3）：可选，默认收起 */}
            {/* 展开 / 收起由用户决定（每行自己记），不跟着内容变：删空内容时不会在光标下收起 */}
            <details className="text-sm" open={l.showBatch} onToggle={(e) => set(l.key, { showBatch: e.currentTarget.open })}>
              <summary data-bug-label="批次信息" className="cursor-pointer text-xs text-muted">
                批次信息（产地、批号、分装日期，可不填）
              </summary>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={l.origin}
                  maxLength={40}
                  onChange={(e) => set(l.key, { origin: e.target.value })}
                  placeholder="产地，如：中国 · 浙江"
                  aria-label="产地"
                  className="input"
                />
                <input
                  value={l.supplierLot}
                  maxLength={40}
                  onChange={(e) => set(l.key, { supplierLot: e.target.value })}
                  placeholder="包装上的批号"
                  aria-label="供应商批号"
                  className="input"
                />
                <label className="flex items-center gap-2 text-xs text-muted">
                  <span className="shrink-0">分装日期</span>
                  <input
                    type="date"
                    value={l.packedOn}
                    onChange={(e) => set(l.key, { packedOn: e.target.value })}
                    aria-label="分装日期"
                    className="input"
                  />
                </label>
              </div>
            </details>
          </div>
        ))}
        <button data-bug-label="＋ 加一行" type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="btn-ghost w-full">
          ＋ 加一行
        </button>
        <p className="text-xs text-muted">提示：按斤买的，1 斤 = 500 g。</p>
      </div>

      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          filled.map((l) => ({
            name: l.name,
            grams: Number(l.grams),
            price: Number(l.price),
            origin: l.origin,
            supplier_lot: l.supplierLot,
            packed_on: l.packedOn,
          })),
        )}
      />
      <div>
        <label className="label">备注</label>
        <input name="notes" className="input" />
      </div>
      {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
      <button data-bug-label="保存采购" disabled={pending || filled.length === 0} className="btn-primary w-full py-3">
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
