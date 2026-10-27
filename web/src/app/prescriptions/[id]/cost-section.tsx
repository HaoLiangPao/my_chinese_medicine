import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grams, money } from "@/lib/format";
import { per100g, strategyParam, summarizeCost, type Strategy } from "@/lib/pricing";
import { setPricePaid } from "../actions";

const KIND_LABEL: Record<string, string> = { clinic: "诊所", shop: "药行", online: "网店" };

type CostRow = { herb_id: string; name_zh: string; grams_per_dose: string; price_per_gram: string | null; store_name: string | null; cost_per_dose: string | null };
type StoreRow = { store_id: string; store_name: string; store_kind: string; cost_per_dose: string; priced_items: number; missing_items: number };

/** 药方详情页的「成本」部分（MVP2） */
export async function CostSection({
  supabase,
  rx,
  strategy,
}: {
  supabase: SupabaseClient;
  rx: { id: string; dose_count: number; price_paid: number | string | null };
  strategy: Strategy;
}) {
  const [{ data: rowsRaw, error }, { data: byStoreRaw }] = await Promise.all([
    supabase
      .rpc("prescription_cost", {
        p_prescription_id: rx.id,
        p_strategy: strategy.kind,
        p_store_id: strategy.kind === "store" ? strategy.storeId : null,
      }),
    supabase.rpc("prescription_cost_by_store", { p_prescription_id: rx.id }),
  ]);
  const rows = (rowsRaw ?? []) as CostRow[];
  const byStore = (byStoreRaw ?? []) as StoreRow[];
  if (error) return <p className="text-sm text-cinnabar">成本计算失败：{error.message}</p>;

  const s = summarizeCost(rows ?? [], rx.dose_count, rx.price_paid);
  const href = (st: Strategy) => `/prescriptions/${rx.id}?cost=${strategyParam(st)}`;
  const tab = (st: Strategy, label: string) => {
    const active = strategyParam(st) === strategyParam(strategy);
    return (
      <Link key={label} href={href(st)} scroll={false} className={`rounded-full border px-3 py-1 ${active ? "border-cinnabar text-cinnabar" : "border-line"}`}>
        {label}
      </Link>
    );
  };

  return (
    <div className="card space-y-3" data-testid="cost-section">
      <h2 className="font-serif text-lg font-bold">成本（自己买药）</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        {tab({ kind: "cheapest" }, "各店最低价")}
        {tab({ kind: "average" }, "我买入的平均成本")}
        {byStore.map((b) => tab({ kind: "store", storeId: b.store_id }, `只在${b.store_name}`))}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>药材</th><th className="text-right">每副</th><th className="text-right">每 100 g</th><th>来源</th><th className="text-right">每副成本</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.herb_id} data-testid={`cost-row-${r.name_zh}`}>
                <td>{r.name_zh}</td>
                <td className="text-right">{grams(r.grams_per_dose)}</td>
                <td className="text-right">{r.price_per_gram === null ? <span className="text-cinnabar">无价格</span> : money(per100g(r.price_per_gram))}</td>
                <td className="text-muted">{r.store_name ?? "—"}</td>
                <td className="text-right" data-testid={`cost-${r.name_zh}`}>{r.cost_per_dose === null ? "—" : money(r.cost_per_dose)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm" data-testid="cost-summary">
        每副 <b>{money(s.perDose)}</b> · {rx.dose_count} 副共 <b>{money(s.total)}</b>
        {!s.complete && s.missing.length > 0 && (
          <span className="ml-1 text-cinnabar" data-testid="cost-missing">（不含没有价格的：{s.missing.join("、")}）</span>
        )}
      </p>
      {s.clinicPerDose !== null && (
        <p className="text-sm" data-testid="clinic-compare">
          诊所实付每副 {money(s.clinicPerDose)}
          {s.savingPerDose === null ? (
            <span className="text-muted">（有药材没有价格，暂不比较）</span>
          ) : s.savingPerDose >= 0 ? (
            <span className="text-jade">，自己买每副便宜 {money(s.savingPerDose)}（{s.savingPct}%）</span>
          ) : (
            <span className="text-amber">，自己买每副贵 {money(-s.savingPerDose)}</span>
          )}
        </p>
      )}

      <form action={setPricePaid} className="flex items-center gap-2 text-sm">
        <input type="hidden" name="id" value={rx.id} />
        <label htmlFor="price_paid" className="shrink-0">诊所实付（{rx.dose_count} 副共）$</label>
        <input id="price_paid" name="price_paid" type="number" step="0.01" min={0} defaultValue={rx.price_paid ?? ""} className="input w-28 py-1" />
        <button className="btn-ghost py-1">保存</button>
      </form>

      {byStore.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">如果全部在一家店买</h3>
          <ul className="space-y-1 text-sm" data-testid="by-store">
            {byStore.map((b) => (
              <li key={b.store_id} className="flex justify-between gap-2" data-testid={`by-store-${b.store_name}`}>
                <span>{b.store_name} <span className="text-xs text-muted">{KIND_LABEL[b.store_kind]}</span></span>
                <span>
                  每副 {money(b.cost_per_dose)}
                  {b.missing_items > 0 ? <span className="ml-1 text-xs text-cinnabar">缺 {b.missing_items} 味</span> : <span className="ml-1 text-xs text-jade">齐全</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
