import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { listHerbsWithKind } from "@/lib/herbs";
import { grams } from "@/lib/format";
import { groupByCategory } from "@/lib/herb-categories";
import { termsFor } from "@/lib/terms";
import { Loading, PageHeader } from "@/components/ui";
import { thumbSrc } from "@/lib/herb-photo";
import { groupByOrigin, herbKindLabel, resolveHerbKind, type HerbKind } from "@/lib/herb-kinds";
import { HerbKindIcon } from "@/components/herb-kind-icons";

export default function HerbsPage({ searchParams }: PageProps<"/herbs">) {
  return (
    <>
      <PageHeader title="药材" subtitle="每味药在哪些方子里出现过、一共用了多少" />
      <Suspense fallback={<Loading />}>
        <Herbs searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Herbs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, workspaceId, accountKind } = await getContext();
  const t = termsFor(accountKind);
  // 目录的分组方式：默认按功效（0017），?by=origin 按来源（0018 §5）
  const byOrigin = (await searchParams).by === "origin";
  const [{ data: usage }, { data: inv }, all, { data: isReviewer }, { data: photos }] = await Promise.all([
    supabase.from("v_herb_usage").select("*").eq("workspace_id", workspaceId).order("prescription_count", { ascending: false }),
    supabase.from("v_inventory").select("herb_id, on_hand_grams").eq("workspace_id", workspaceId),
    listHerbsWithKind(supabase),
    supabase.rpc("is_monograph_reviewer"),
    supabase.from("herb_photos").select("herb_id, file"),
  ]);
  const { count: pending } =
    isReviewer === true
      ? await supabase.from("herb_monographs").select("herb_id", { count: "exact", head: true }).eq("status", "draft")
      : { count: null };
  const onHand = new Map((inv ?? []).map((r) => [r.herb_id, Number(r.on_hand_grams)]));
  const used = new Set((usage ?? []).map((u) => u.herb_id));
  // 小图：自己的，炮制品没有就用原药材的（docs/design/0010 §3.5）
  const photoFile = new Map((photos ?? []).map((p) => [p.herb_id as string, p.file as string]));
  const baseOf = new Map(all.map((h) => [h.id, h.base_herb_id]));
  const thumbOf = (id: string) => {
    const file = photoFile.get(id) ?? photoFile.get(baseOf.get(id) ?? "");
    return file ? thumbSrc(file) : null;
  };
  const anyThumb = (usage ?? []).some((u) => thumbOf(u.herb_id));
  // 来源和部位：自己的，空的跟原药材（docs/design/0018 §3.3）
  const byId = new Map(all.map((h) => [h.id, h]));
  const kindOf = (h: (typeof all)[number]): HerbKind => resolveHerbKind(h, h.base_herb_id ? (byId.get(h.base_herb_id) ?? null) : null);
  const groups = byOrigin
    ? groupByOrigin(all, kindOf).map((g) => ({ key: g.key, label: g.label, icon: g.key, herbs: g.herbs }))
    : groupByCategory(all).map((g) => ({ key: g.category, label: g.category, icon: null, herbs: g.herbs }));

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
                    <Link href={`/herbs/${u.herb_id}`} className="flex items-center gap-2 font-medium hover:text-cinnabar">
                      {thumbOf(u.herb_id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbOf(u.herb_id)!}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          className="h-7 w-7 shrink-0 rounded object-cover"
                          data-testid="herb-thumb"
                        />
                      ) : (
                        anyThumb && <span className="h-7 w-7 shrink-0" aria-hidden />
                      )}
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
        <nav className="mb-2 flex flex-wrap items-center gap-2 text-sm" aria-label="目录分组方式" data-testid="herbs-group-by">
          <Link
            href="/herbs"
            scroll={false}
            data-bug-label="目录按功效分组"
            aria-current={byOrigin ? undefined : "page"}
            className={`rounded-full border px-3 py-1 ${byOrigin ? "border-line text-muted" : "border-cinnabar bg-cinnabar text-white"}`}
          >
            按功效
          </Link>
          <Link
            href="/herbs?by=origin"
            scroll={false}
            data-bug-label="目录按来源分组"
            aria-current={byOrigin ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${byOrigin ? "border-cinnabar bg-cinnabar text-white" : "border-line text-muted"}`}
          >
            按来源
          </Link>
        </nav>
        <p className="mb-2 text-sm text-muted">
          {byOrigin ? "按来源（植物按入药部位）分类" : "按功效分类"}，点开看每一类的药；红色的是用过的。
        </p>
        <div className="space-y-2">
          {groups.map(({ key, label, icon, herbs }) => {
            const usedCount = herbs.filter((h) => used.has(h.id)).length;
            return (
              <details key={key} className="card py-2" data-testid={`catalog-${key}`}>
                <summary className="cursor-pointer select-none">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {icon && <HerbKindIcon name={icon} size={20} />}
                    {label}
                  </span>
                  <span className="ml-2 text-sm text-muted">
                    {herbs.length} 味{usedCount > 0 && ` · 用过 ${usedCount}`}
                  </span>
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {herbs.map((h) => {
                    const kind = kindOf(h);
                    return (
                      <Link
                        key={h.id}
                        href={`/herbs/${h.id}`}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${used.has(h.id) ? "border-cinnabar text-cinnabar" : "border-line text-muted"}`}
                        title={[h.pinyin, h.category, herbKindLabel(kind)].filter(Boolean).join(" · ")}
                      >
                        {/* 按功效分组时每味药前放来源的小图标；按来源分组时组标题已经有了，不再重复 */}
                        {!byOrigin && <HerbKindIcon name={kind.origin ?? "unclassified"} size={14} />}
                        {h.name_zh}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
