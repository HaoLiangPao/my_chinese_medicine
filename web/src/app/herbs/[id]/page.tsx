import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { grams, money } from "@/lib/format";
import { Loading, Stat } from "@/components/ui";

export default function HerbPage({ params }: PageProps<"/herbs/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} />
    </Suspense>
  );
}

type Use = {
  grams_per_dose: number;
  special_prep: string | null;
  prescriptions: { id: string; title: string | null; issued_on: string; dose_count: number } | null;
};

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getContext();

  const { data: herbRow } = await supabase
    .from("herbs")
    .select("id, name_zh, pinyin, category, notes, base:base_herb_id(id, name_zh), herb_aliases(alias)")
    .eq("id", id)
    .maybeSingle();
  const herb = herbRow as unknown as { id: string; name_zh: string; pinyin: string | null; category: string | null; notes: string | null; base: { id: string; name_zh: string } | null; herb_aliases: { alias: string }[] } | null;
  if (!herb) notFound();

  const [{ data: uses }, { data: inv }, { data: prices }, { data: usage }] = await Promise.all([
    supabase
      .from("prescription_items")
      .select("grams_per_dose, special_prep, prescriptions(id, title, issued_on, dose_count)")
      .eq("herb_id", id)
      .returns<Use[]>(),
    supabase.from("v_inventory").select("on_hand_grams").eq("herb_id", id).maybeSingle(),
    supabase.from("v_purchase_prices").select("*").eq("herb_id", id).order("purchased_on", { ascending: false }),
    supabase.from("v_herb_usage").select("*").eq("herb_id", id).maybeSingle(),
  ]);
  const sortedUses = (uses ?? []).sort((a, b) => (b.prescriptions?.issued_on ?? "").localeCompare(a.prescriptions?.issued_on ?? ""));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/herbs" className="text-sm text-muted">← 药材</Link>
        <h1 className="mt-1 font-serif text-3xl font-bold">{herb.name_zh}</h1>
        <p className="mt-1 text-sm text-muted">
          {[herb.pinyin, herb.category].filter(Boolean).join(" · ")}
          {herb.base && <> · 炮制品，原药材 <Link href={`/herbs/${herb.base.id}`} className="underline">{herb.base.name_zh}</Link></>}
          {herb.herb_aliases.length > 0 && ` · 别名 ${herb.herb_aliases.map((a) => a.alias).join("、")}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="药柜存量" value={inv ? grams(inv.on_hand_grams) : "—"} />
        <Stat label="出现在几张方子" value={usage?.prescription_count ?? 0} />
        <Stat label="累计用量" value={grams(usage?.total_grams ?? 0)} />
      </div>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-serif text-lg font-bold">出现在这些药方里</h2>
        {!sortedUses.length ? (
          <p className="text-sm text-muted">还没有。</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>药方</th><th>日期</th><th className="text-right">每副</th><th className="text-right">副数</th></tr></thead>
            <tbody>
              {sortedUses.map((u) => (
                <tr key={u.prescriptions?.id}>
                  <td><Link href={`/prescriptions/${u.prescriptions?.id}`} className="hover:text-cinnabar">{u.prescriptions?.title || "未命名药方"}</Link>{u.special_prep && <span className="ml-1 text-xs text-amber">{u.special_prep}</span>}</td>
                  <td className="text-muted">{u.prescriptions?.issued_on}</td>
                  <td className="text-right">{grams(u.grams_per_dose)}</td>
                  <td className="text-right">{u.prescriptions?.dose_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-serif text-lg font-bold">购买记录</h2>
        {!prices?.length ? (
          <p className="text-sm text-muted">还没有。</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>日期</th><th>店铺</th><th className="text-right">克数</th><th className="text-right">价格</th><th className="text-right">每 100g</th></tr></thead>
            <tbody>
              {prices.map((p, i) => (
                <tr key={i}>
                  <td className="text-muted">{p.purchased_on}</td>
                  <td>{p.store_name ?? "—"}</td>
                  <td className="text-right">{grams(p.grams)}</td>
                  <td className="text-right">{money(p.price)}</td>
                  <td className="text-right">{money(Number(p.price_per_gram) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
