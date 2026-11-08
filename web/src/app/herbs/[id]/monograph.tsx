import Link from "next/link";
import { TOXICITY, guiJing, reviewedMonth, xingWei, type Monograph } from "@/lib/herb-monograph";

/** 药名下面的小标签：味、性、归经、毒性（docs/design/0010 §4.1） */
export function MonographTags({ m }: { m: Monograph }) {
  const tox = m.toxicity;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-sm" data-testid="monograph-tags">
      <span className="rounded-full bg-jade/10 px-2.5 py-0.5 text-jade">{m.flavors.join(" · ")}</span>
      <span className="rounded-full bg-paper px-2.5 py-0.5 ring-1 ring-line">{m.nature}</span>
      <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-ink">{m.meridians.join(" · ")}经</span>
      {tox && (
        <span
          className={`rounded-full px-2.5 py-0.5 ring-1 ${tox === "none" ? "ring-line" : "bg-cinnabar/10 text-cinnabar ring-cinnabar/40"}`}
        >
          {TOXICITY[tox]}
        </span>
      )}
    </div>
  );
}

const ROWS: [string, (m: Monograph) => string | null][] = [
  ["来源", (m) => m.source],
  ["性味", (m) => xingWei(m)],
  ["归经", (m) => guiJing(m)],
  ["传统用途", (m) => `${m.traditional_use}（中医传统用法）`],
  ["炮制", (m) => m.processing],
  ["道地产区", (m) => m.regions],
  ["选品", (m) => m.quality],
  ["毒性", (m) => (m.toxicity ? TOXICITY[m.toxicity] : null)],
  ["使用注意", (m) => m.cautions],
  ["保存", (m) => m.storage],
];

/** 药材资料（全站共用）。草稿标「待审核」；审核人能看到「去核对」 */
export function MonographSection({
  m,
  fromBase,
  inheritsDraft,
  baseName,
  isReviewer,
}: {
  m: Monograph;
  fromBase: boolean;
  inheritsDraft: boolean;
  baseName: string | null;
  isReviewer: boolean;
}) {
  const draft = m.status === "draft";
  return (
    <section className="card space-y-3" data-testid="monograph">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-bold">药材资料</h2>
        <div className="flex items-center gap-3 text-sm">
          {draft && (
            <span className="rounded-full bg-amber/15 px-2.5 py-0.5 text-amber" data-testid="monograph-draft">
              草稿 · 待审核
            </span>
          )}
          {isReviewer && (
            <Link href={`/review/herbs/${m.herb_id}`} className="underline">
              去核对
            </Link>
          )}
        </div>
      </div>
      {fromBase && <p className="text-sm text-muted">这味炮制品还没有单独的资料，下面是原药材{baseName ? `「${baseName}」` : ""}的。</p>}
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm sm:text-base">
        {ROWS.map(([label, get]) => {
          const v = get(m);
          return v ? (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd data-testid={`monograph-${label}`}>{v}</dd>
            </div>
          ) : null;
        })}
      </dl>
      <p className="border-t border-line pt-2 text-xs text-muted" data-testid="monograph-footer">
        {inheritsDraft
          ? `部分内容来自原药材${baseName ? `「${baseName}」` : ""}，原药材的资料还没有经过医生审核。`
          : draft
            ? "这份资料由 AI 按《中国药典》和《中药学》教材整理，还没有经过医生审核。"
            : `内容审核：${m.reviewed_by} · ${reviewedMonth(m.reviewed_at)}`}
        {" · "}仅为中药知识介绍，不作用药建议
      </p>
    </section>
  );
}
