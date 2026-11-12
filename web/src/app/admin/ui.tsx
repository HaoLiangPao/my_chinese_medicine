import Link from "next/link";
import {
  BUCKET_NAMES,
  MIN_SUBJECTS,
  TOP_CHOICES,
  barPercent,
  bucketLabel,
  niceTicks,
  rangeLabel,
  rangePresets,
  rangeQuery,
  sameRange,
  type DateRange,
} from "@/lib/admin-stats";

/** 选时间段：快捷按钮 + 任意起止日期（GET 表单，不用 JS）。extra = 切换时要保留的其他参数（Top N、排序） */
export function RangePicker({
  path,
  range,
  today,
  extra = {},
}: {
  path: string;
  range: DateRange;
  today: string;
  extra?: Record<string, string>;
}) {
  return (
    <section className="card space-y-3" data-testid="admin-range">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm text-muted">时间段</h2>
        <span className="font-medium" data-testid="admin-range-label">
          {rangeLabel(range)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {rangePresets(today).map((p) => (
          <Link
            key={p.label}
            href={`${path}${rangeQuery(p.range, extra)}`}
            data-bug-label="看板选时间段"
            aria-current={sameRange(p.range, range) ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${sameRange(p.range, range) ? "border-cinnabar bg-cinnabar text-white" : "border-line text-muted hover:bg-paper"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form action={path} method="get" className="flex flex-wrap items-end gap-2">
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">从</span>
          <input type="date" name="from" defaultValue={range.from ?? ""} min="1990-01-01" max="2100-01-01" className="input w-40" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">到</span>
          <input type="date" name="to" defaultValue={range.to ?? ""} min="1990-01-01" max="2100-01-01" className="input w-40" />
        </label>
        <button type="submit" className="btn-ghost" data-bug-label="看板查看时间段">
          查看
        </button>
      </form>
    </section>
  );
}

export function Tile({ label, value, sub, testId }: { label: string; value: string | number; sub?: string; testId: string }) {
  return (
    <div className="card" data-testid={`admin-${testId}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-serif text-2xl font-bold" data-testid={`admin-${testId}-value`}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-xs text-muted" data-testid={`admin-${testId}-sub`}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** prescriptions 为 null：病人账号的趋势里 1–4 张（数据库遮掉了），显示「<5」 */
export type TrendRow = { bucket_start: string; prescriptions: number | null; bucket: string };

/** 处方趋势柱状图：纵轴是张数（刻度和网格线），横轴是日期。CSS 画的，每根柱子带 data-count，读屏念「日期：几张」 */
export function TrendChart({ rows }: { rows: TrendRow[] }) {
  const bucket = rows[0]?.bucket ?? "day";
  const masked = rows.some((r) => r.prescriptions === null);
  // 「<5」的柱子按 4 画（浅色）；纵轴至少画到 5，看得出它在 5 的下面，不会被当成正好 4 张
  const ticks = niceTicks(Math.max(masked ? 5 : 0, ...rows.map((r) => r.prescriptions ?? 0)));
  const top = ticks[ticks.length - 1];
  const total = rows.reduce((s, r) => s + (r.prescriptions ?? 0), 0);
  const mid = rows[Math.floor((rows.length - 1) / 2)];
  return (
    <figure className="card" data-testid="admin-trend" data-bucket-kind={bucket}>
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-serif text-lg font-bold">处方趋势（{BUCKET_NAMES[bucket] ?? bucket}）</span>
        <span className="text-sm text-muted">{masked ? "1–4 张显示「<5」（浅色）" : `共 ${total} 张`}</span>
      </figcaption>
      <div className="mt-7 flex gap-2">
        <div className="relative w-7 shrink-0 text-right text-xs text-muted" aria-hidden="true" data-testid="admin-trend-yaxis">
          <span className="absolute -top-7 right-0">张</span>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }} data-tick={t}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-40 min-w-0 flex-1 border-b border-l border-line">
          {ticks.slice(1).map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <ol
            className={`absolute inset-0 flex items-end ${rows.length > 60 ? "" : "gap-px"}`}
            aria-label={`处方趋势（${BUCKET_NAMES[bucket] ?? bucket}）`}
          >
            {rows.map((r) => (
              <li
                key={r.bucket_start}
                className="flex h-full min-w-0 flex-1 items-end"
                data-bucket={r.bucket_start}
                data-count={r.prescriptions ?? "<5"}
                title={`${bucketLabel(r.bucket_start, bucket)}：${r.prescriptions ?? "<5"} 张`}
                aria-label={`${bucketLabel(r.bucket_start, bucket)}：${r.prescriptions ?? "少于 5"} 张`}
              >
                <span
                  className={`block w-full rounded-t-sm ${r.prescriptions === null ? "bg-cinnabar/30" : "bg-cinnabar/80"}`}
                  style={{ height: `${barPercent(r.prescriptions ?? 4, top)}%` }}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="mt-1 ml-9 flex justify-between text-xs text-muted">
          <span>{bucketLabel(rows[0].bucket_start, bucket)}</span>
          {rows.length > 2 && <span>{bucketLabel(mid.bucket_start, bucket)}</span>}
          <span>{bucketLabel(rows[rows.length - 1].bucket_start, bucket)}</span>
        </div>
      )}
    </figure>
  );
}

/** Top 10 / 20 / 30 / 40（和排序方式），切换时保留时间段 */
export function TopPicker({
  path,
  range,
  top,
  extra = {},
}: {
  path: string;
  range: DateRange;
  top: number;
  extra?: Record<string, string>;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="显示几味" data-testid="admin-top">
      {TOP_CHOICES.map((n) => (
        <Link
          key={n}
          href={`${path}${rangeQuery(range, { ...extra, top: n })}`}
          data-bug-label="看板选 Top N"
          aria-current={n === top ? "true" : undefined}
          className={`rounded-md border px-2 py-0.5 text-xs ${n === top ? "border-jade bg-jade text-white" : "border-line text-muted hover:bg-paper"}`}
        >
          Top {n}
        </Link>
      ))}
    </div>
  );
}

export type RankRow = { name: string; value: number; display: string; note?: string };

/** 排行：每行一个横条。other = 不到门槛、合并起来的个数 */
export function Ranking({
  title,
  testId,
  unit,
  rows,
  other,
  controls,
}: {
  title: string;
  testId: string;
  unit: string;
  rows: RankRow[];
  other: number;
  controls?: React.ReactNode;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <section className="card" data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-bold">{title}</h2>
        {controls}
      </div>
      {!rows.length && !other ? (
        <p className="text-sm text-muted">这段时间没有。</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.name} data-testid={`${testId}-row`}>
              <div className="flex justify-between gap-3 text-sm">
                <span>
                  <span className="mr-1 inline-block w-6 text-right text-xs text-muted">{i + 1}</span>
                  <span data-testid={`${testId}-name`}>{r.name}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span data-testid={`${testId}-value`}>{r.display}</span>
                  {r.note && (
                    <span className="ml-2 text-xs text-muted" data-testid={`${testId}-note`}>
                      {r.note}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 ml-7 h-1.5 rounded-full bg-paper">
                <div className="h-1.5 rounded-full bg-jade" style={{ width: `${barPercent(r.value, max)}%` }} />
              </div>
            </li>
          ))}
          {!rows.length && <li className="text-sm text-muted">没有达到 {MIN_SUBJECTS} 位病人的。</li>}
          {other > 0 && (
            <li className="text-sm text-muted" data-testid={`${testId}-other`}>
              其他 {other} {unit}（每{unit}不到 {MIN_SUBJECTS} 位病人，合并不显示）
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
