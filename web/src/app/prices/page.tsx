import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { money } from "@/lib/format";
import { per100g } from "@/lib/pricing";
import { Empty, Loading, PageHeader, Stat } from "@/components/ui";

const KIND_LABEL: Record<string, string> = { clinic: "诊所", shop: "药行", online: "网店" };

export default function PricesPage({ searchParams }: PageProps<"/prices">) {
  return (
    <>
      <PageHeader title="比价" subtitle="每味药在各家店最近一次的价格（每 100 g）。赠品（0 元）不参与比价。" />
      <Suspense fallback={<Loading />}>
        <Prices searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type Latest = { herb_id: string; name_zh: string; store_id: string; store_name: string; store_kind: string; price_per_gram: string; last_purchased_on: string };
type Summary = { herb_id: string; name_zh: string; store_count: number; cheapest_store_id: string | null; min_ppg: string | null; max_ppg: string | null; spread_pct: string | null; avg_cost_per_gram: string | null };

async function Prices({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const onlyUsed = sp.used === "1";
  const { supabase, workspaceId } = await getContext();

  const [{ data: latest }, { data: summary }, { data: stores }, { data: usage }, { data: value }] = await Promise.all([
    supabase.from("v_store_latest_prices").select("herb_id, name_zh, store_id, store_name, store_kind, price_per_gram, last_purchased_on").eq("workspace_id", workspaceId).returns<Latest[]>(),
    supabase.from("v_herb_price_summary").select("*").eq("workspace_id", workspaceId).returns<Summary[]>(),
    supabase.from("stores").select("id, name, kind").eq("workspace_id", workspaceId).order("name"),
    supabase.from("v_herb_usage").select("herb_id, prescription_count").eq("workspace_id", workspaceId),
    supabase.from("v_inventory_value").select("value").eq("workspace_id", workspaceId),
  ]);

  const used = new Set((usage ?? []).map((u) => u.herb_id));
  const rows = (summary ?? [])
    .filter((s) => s.store_count > 0 && (!onlyUsed || used.has(s.herb_id)))
    .sort((a, b) => Number(b.spread_pct ?? 0) - Number(a.spread_pct ?? 0) || a.name_zh.localeCompare(b.name_zh, "zh"));
  const priced = new Map<string, Latest>();
  for (const l of latest ?? []) priced.set(`${l.herb_id}|${l.store_id}`, l);
  const activeStores = (stores ?? []).filter((s) => (latest ?? []).some((l) => l.store_id === s.id));
  const pantryValue = (value ?? []).reduce((s, v) => s + Number(v.value ?? 0), 0);

  // 每家店「最便宜」的次数
  const wins = new Map<string, number>();
  for (const r of rows) if (r.cheapest_store_id) wins.set(r.cheapest_store_id, (wins.get(r.cheapest_store_id) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="比价药材" value={rows.length} />
        <Stat label="店铺" value={activeStores.length} />
        <Stat label="药柜价值" value={<span data-testid="pantry-value">{money(pantryValue)}</span>} href="/inventory" />
      </div>

      <div className="flex gap-2 text-sm">
        <Link href="/prices" className={`rounded-full border px-3 py-1 ${!onlyUsed ? "border-cinnabar text-cinnabar" : "border-line"}`}>全部</Link>
        <Link href="/prices?used=1" className={`rounded-full border px-3 py-1 ${onlyUsed ? "border-cinnabar text-cinnabar" : "border-line"}`}>只看药方里用过的</Link>
      </div>

      {!rows.length ? (
        <Empty>还没有可以比价的记录。记几笔采购就有了。</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table min-w-max" data-testid="price-table">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card">药材</th>
                {activeStores.map((s) => (
                  <th key={s.id} className="text-right">
                    {s.name}
                    <div className="font-normal">{KIND_LABEL[s.kind] ?? s.kind}</div>
                  </th>
                ))}
                <th className="text-right">价差</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.herb_id} data-testid={`price-row-${r.name_zh}`}>
                  <td className="sticky left-0 bg-card">
                    <Link href={`/herbs/${r.herb_id}`} className="font-medium hover:text-cinnabar">{r.name_zh}</Link>
                  </td>
                  {activeStores.map((s) => {
                    const l = priced.get(`${r.herb_id}|${s.id}`);
                    const best = s.id === r.cheapest_store_id;
                    return (
                      <td
                        key={s.id}
                        data-testid={`price-${r.name_zh}-${s.name}`}
                        className={`text-right ${best ? "font-bold text-jade" : ""}`}
                        title={l ? `最近一次 ${l.last_purchased_on}` : undefined}
                      >
                        {l ? money(per100g(l.price_per_gram)) : <span className="text-muted">—</span>}
                      </td>
                    );
                  })}
                  <td className="text-right text-muted" data-testid={`spread-${r.name_zh}`}>
                    {r.store_count > 1 && r.spread_pct !== null ? `${Number(r.spread_pct)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeStores.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-serif text-lg font-bold">哪家最便宜的次数</h2>
          <ul className="space-y-1 text-sm">
            {activeStores
              .map((s) => ({ ...s, n: wins.get(s.id) ?? 0 }))
              .sort((a, b) => b.n - a.n)
              .map((s) => (
                <li key={s.id} className="flex justify-between" data-testid={`wins-${s.name}`}>
                  <span>{s.name} <span className="text-xs text-muted">{KIND_LABEL[s.kind]}</span></span>
                  <span>{s.n} 味</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
