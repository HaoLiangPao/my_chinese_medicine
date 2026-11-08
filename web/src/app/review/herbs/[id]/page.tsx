import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { Loading } from "@/components/ui";
import { INHERITED, TOXICITY, type Monograph } from "@/lib/herb-monograph";
import { ReviewForm } from "./review-form";

export default function ReviewHerbPage({ params, searchParams }: PageProps<"/review/herbs/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Revision = { id: number; action: string; note: string | null; reviewer_name: string; created_at: string };
const ACTION = { save: "保存", approve: "通过", flag: "有问题" } as Record<string, string>;

async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase } = await getContext();
  const [{ data: m }, { data: herb }, { data: revisions }] = await Promise.all([
    supabase.from("herb_monographs").select("*").eq("herb_id", id).maybeSingle<Monograph>(),
    supabase
      .from("herbs")
      .select("name_zh, pinyin, base:base_herb_id(id, name_zh)")
      .eq("id", id)
      .maybeSingle<{ name_zh: string; pinyin: string | null; base: { id: string; name_zh: string } | null }>(),
    supabase
      .from("herb_monograph_revisions")
      .select("id, action, note, reviewer_name, created_at")
      .eq("herb_id", id)
      .order("id", { ascending: false })
      .limit(5)
      .returns<Revision[]>(),
  ]);
  if (!m || !herb) notFound();

  // 炮制品：空着的字段显示原药材的，核对时要看到
  let inherited: Partial<Record<string, string>> | null = null;
  if (herb.base) {
    const { data: b } = await supabase.from("herb_monographs").select("*").eq("herb_id", herb.base.id).maybeSingle<Monograph>();
    inherited = {};
    for (const k of INHERITED) {
      const val = b?.[k];
      if (val) inherited[k] = k === "toxicity" ? TOXICITY[val as keyof typeof TOXICITY] : String(val);
    }
  }

  let approvedName: string | null = null;
  if (typeof sp.approved === "string") {
    const { data } = await supabase.from("herbs").select("name_zh").eq("id", sp.approved).maybeSingle<{ name_zh: string }>();
    approvedName = data?.name_zh ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/review/herbs" className="text-sm text-muted">
        ← 核对药材资料
      </Link>
      {approvedName && (
        <p className="rounded-md bg-jade/10 p-3 text-sm text-jade" data-testid="approved-prev">
          「{approvedName}」已通过。下一味：
        </p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold" data-testid="review-herb-name">
          {herb.name_zh}
        </h1>
        <span className={`text-sm ${m.status === "reviewed" ? "text-jade" : "text-amber"}`} data-testid="review-status">
          {m.status === "reviewed" ? `已审核 · ${m.reviewed_by} · ${m.reviewed_at}` : "草稿 · 待审核"}
        </span>
      </div>
      <p className="text-sm text-muted">
        {[
          herb.pinyin,
          herb.base && `炮制品，原药材 ${herb.base.name_zh}（空着的字段显示原药材的）`,
          `依据：${m.reference === "中国药典" ? "《中国药典》2020 年版" : "《中药学》教材"}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {m.check_note && (
        <p className="rounded-md border border-amber/50 bg-amber/10 p-3 text-sm" data-testid="check-note">
          <b>要重点核对：</b>
          {m.check_note}
        </p>
      )}
      {m.flag_note && (
        <p className="rounded-md border border-cinnabar/40 bg-cinnabar/5 p-3 text-sm" data-testid="flag-note">
          <b>有问题：</b>
          {m.flag_note}
        </p>
      )}

      <ReviewForm m={m} inherited={inherited} />

      {!!revisions?.length && (
        <section className="card text-sm">
          <h2 className="mb-2 font-bold">修改记录</h2>
          <ul className="space-y-1 text-muted" data-testid="revisions">
            {revisions.map((r) => (
              <li key={r.id}>
                {r.created_at.slice(0, 16).replace("T", " ")} · {r.reviewer_name} · {ACTION[r.action] ?? r.action}
                {r.note && `：${r.note}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
