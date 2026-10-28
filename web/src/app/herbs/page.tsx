import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { listHerbs } from "@/lib/herbs";
import { grams } from "@/lib/format";
import { Loading, PageHeader } from "@/components/ui";

export default function HerbsPage() {
  return (
    <>
      <PageHeader title="药材" subtitle="每味药在哪些方子里出现过、一共用了多少" />
      <Suspense fallback={<Loading />}>
        <Herbs />
      </Suspense>
    </>
  );
}

async function Herbs() {
  const { supabase, workspaceId } = await getContext();
  const [{ data: usage }, { data: inv }, all] = await Promise.all([
    supabase.from("v_herb_usage").select("*").eq("workspace_id", workspaceId).order("prescription_count", { ascending: false }),
    supabase.from("v_inventory").select("herb_id, on_hand_grams").eq("workspace_id", workspaceId),
    listHerbs(supabase),
  ]);
  const onHand = new Map((inv ?? []).map((r) => [r.herb_id, Number(r.on_hand_grams)]));
  const used = new Set((usage ?? []).map((u) => u.herb_id));

  return (
    <div className="space-y-6">
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-serif text-lg font-bold">用过的药材</h2>
        {!usage?.length ? (
          <p className="text-sm text-muted">录入药方后这里会出现统计。</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>药材</th>
                <th className="text-right">出现次数</th>
                <th className="text-right">常用剂量</th>
                <th className="text-right">累计用量</th>
                <th className="text-right">药柜</th>
                <th>最近</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.herb_id}>
                  <td><Link href={`/herbs/${u.herb_id}`} className="font-medium hover:text-cinnabar">{u.name_zh}</Link></td>
                  <td className="text-right">{u.prescription_count}</td>
                  <td className="text-right">
                    {Number(u.min_grams_per_dose) === Number(u.max_grams_per_dose)
                      ? grams(u.min_grams_per_dose)
                      : `${Number(u.min_grams_per_dose)}–${Number(u.max_grams_per_dose)} g`}
                  </td>
                  <td className="text-right">{grams(u.total_grams)}</td>
                  <td className="text-right text-muted">{onHand.has(u.herb_id) ? grams(onHand.get(u.herb_id)) : "—"}</td>
                  <td className="text-muted">{u.last_used_on}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-serif text-lg font-bold">药材目录（{all.length}）</h2>
        <div className="flex flex-wrap gap-2">
          {all.map((h) => (
            <Link
              key={h.id}
              href={`/herbs/${h.id}`}
              className={`rounded-full border px-3 py-1 text-sm ${used.has(h.id) ? "border-cinnabar text-cinnabar" : "border-line text-muted"}`}
              title={[h.pinyin, h.category].filter(Boolean).join(" · ")}
            >
              {h.name_zh}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
