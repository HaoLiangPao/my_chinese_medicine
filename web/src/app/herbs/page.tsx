import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { listHerbs } from "@/lib/herbs";
import { grams } from "@/lib/format";
import { groupByCategory } from "@/lib/herb-categories";
import { termsFor } from "@/lib/terms";
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
  const { supabase, workspaceId, accountKind } = await getContext();
  const t = termsFor(accountKind);
  const [{ data: usage }, { data: inv }, all, { data: isReviewer }] = await Promise.all([
    supabase.from("v_herb_usage").select("*").eq("workspace_id", workspaceId).order("prescription_count", { ascending: false }),
    supabase.from("v_inventory").select("herb_id, on_hand_grams").eq("workspace_id", workspaceId),
    listHerbs(supabase),
    supabase.rpc("is_monograph_reviewer"),
  ]);
  const { count: pending } =
    isReviewer === true
      ? await supabase.from("herb_monographs").select("herb_id", { count: "exact", head: true }).eq("status", "draft")
      : { count: null };
  const onHand = new Map((inv ?? []).map((r) => [r.herb_id, Number(r.on_hand_grams)]));
  const used = new Set((usage ?? []).map((u) => u.herb_id));

  return (
    <div className="space-y-6">
      {isReviewer === true && (
        <Link href="/review/herbs" className="card flex items-center justify-between hover:border-cinnabar" data-testid="review-entry">
          <span>核对药材资料</span>
          <span className="text-sm text-muted">{pending ? `${pending} 味待审核 →` : "全部审核完了 →"}</span>
        </Link>
      )}
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-serif text-lg font-bold">用过的药材</h2>
        {!usage?.length ? (
          <p className="text-sm text-muted">{accountKind === "clinic" ? "开方后这里会出现统计。" : "录入药方后这里会出现统计。"}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>药材</th>
                <th className="text-right">出现次数</th>
                <th className="text-right">常用剂量</th>
                <th className="text-right">累计用量</th>
                <th className="text-right">{t.stock}</th>
                <th>最近</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.herb_id}>
                  <td>
                    <Link href={`/herbs/${u.herb_id}`} className="font-medium hover:text-cinnabar">
                      {u.name_zh}
                    </Link>
                  </td>
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
        <p className="mb-2 text-sm text-muted">按功效分类，点开看每一类的药；红色的是用过的。</p>
        <div className="space-y-2">
          {groupByCategory(all).map(({ category, herbs }) => {
            const usedCount = herbs.filter((h) => used.has(h.id)).length;
            return (
              <details key={category} className="card py-2" data-testid={`catalog-${category}`}>
                <summary className="cursor-pointer select-none">
                  <span className="font-medium">{category}</span>
                  <span className="ml-2 text-sm text-muted">
                    {herbs.length} 味{usedCount > 0 && ` · 用过 ${usedCount}`}
                  </span>
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {herbs.map((h) => (
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
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
