import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { Loading, PageHeader } from "@/components/ui";
import { listForReview, type ReviewRow } from "./data";

const FILTERS = {
  todo: { label: "待审核", match: (m: ReviewRow) => m.status === "draft" },
  check: { label: "要重点核对", match: (m: ReviewRow) => m.status === "draft" && !!m.check_note },
  flagged: { label: "有问题", match: (m: ReviewRow) => !!m.flag_note },
  all: { label: "全部", match: () => true },
} as const;
type Filter = keyof typeof FILTERS;

export default function ReviewHerbsPage({ searchParams }: PageProps<"/review/herbs">) {
  return (
    <>
      <PageHeader title="核对药材资料" subtitle="一味一味看，通过的才会印在标签上、给病人看" />
      <Suspense fallback={<Loading />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filter: Filter = typeof sp.filter === "string" && sp.filter in FILTERS ? (sp.filter as Filter) : "todo";
  const { supabase } = await getContext();
  const all = await listForReview(supabase);
  const rows = all.filter(FILTERS[filter].match);
  const reviewed = all.filter((m) => m.status === "reviewed").length;

  return (
    <div className="space-y-4">
      {sp.done === "1" && <p className="rounded-md bg-jade/10 p-3 text-sm text-jade">全部审核完了。</p>}
      <p className="text-sm text-muted" data-testid="review-progress">
        已审核 {reviewed} / {all.length} 味
      </p>
      <nav className="flex flex-wrap gap-2" aria-label="筛选">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link
            key={f}
            href={`/review/herbs?filter=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={`btn ${f === filter ? "border border-cinnabar bg-cinnabar text-white" : "btn-ghost"}`}
          >
            {FILTERS[f].label}（{all.filter(FILTERS[f].match).length}）
          </Link>
        ))}
      </nav>
      {!rows.length ? (
        <p className="card text-sm text-muted">没有。</p>
      ) : (
        <ul className="card divide-y divide-line p-0" data-testid="review-list">
          {rows.map((m) => (
            <li key={m.herb_id}>
              <Link href={`/review/herbs/${m.herb_id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-paper">
                <span>
                  <span className="font-serif text-lg font-bold">{m.name_zh}</span>
                  {m.check_note && <span className="ml-2 text-xs text-amber">要核对</span>}
                  {m.flag_note && <span className="ml-2 text-xs text-cinnabar">有问题</span>}
                </span>
                <span className={`text-sm ${m.status === "reviewed" ? "text-jade" : "text-muted"}`}>
                  {m.status === "reviewed" ? `已审核 · ${m.reviewed_by}` : "草稿"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
