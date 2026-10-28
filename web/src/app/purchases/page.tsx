import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { grams, money } from "@/lib/format";
import { Empty, Loading, PageHeader } from "@/components/ui";

export default function PurchasesPage() {
  return (
    <>
      <PageHeader title="采购" subtitle="在哪儿买的、多少克、多少钱" action={{ href: "/purchases/new", label: "＋ 记一笔" }} />
      <Suspense fallback={<Loading />}>
        <List />
      </Suspense>
    </>
  );
}

type Row = {
  id: string;
  purchased_on: string;
  notes: string | null;
  stores: { name: string } | null;
  purchase_items: { grams: number; price: number; herbs: { name_zh: string } | null }[];
};

async function List() {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase
    .from("purchases")
    .select("id, purchased_on, notes, stores(name), purchase_items(grams, price, herbs(name_zh))")
    .eq("workspace_id", workspaceId)
    .order("purchased_on", { ascending: false })
    .returns<Row[]>();
  if (error) throw new Error(error.message);
  if (!data.length) return <Empty>还没有采购记录。</Empty>;

  return (
    <div className="space-y-3">
      {data.map((p) => {
        const total = p.purchase_items.reduce((s, i) => s + Number(i.price), 0);
        return (
          <div key={p.id} className="card">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{p.stores?.name ?? "未填店铺"}</span>
              <span className="text-sm text-muted">{p.purchased_on} · {money(total)}</span>
            </div>
            <table className="data-table mt-2">
              <tbody>
                {p.purchase_items.map((i, idx) => (
                  <tr key={idx}>
                    <td>{i.herbs?.name_zh}</td>
                    <td className="text-right">{grams(i.grams)}</td>
                    <td className="text-right">{money(i.price)}</td>
                    <td className="text-right text-muted">{money((Number(i.price) / Number(i.grams)) * 100)}/100g</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.notes && <p className="mt-2 text-sm text-muted">{p.notes}</p>}
          </div>
        );
      })}
    </div>
  );
}
