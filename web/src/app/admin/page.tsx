import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { Loading, PageHeader } from "@/components/ui";
import {
  MIN_SUBJECTS,
  barPercent,
  bucketLabel,
  monthLabel,
  parseMonth,
  recentMonths,
  userLabel,
  type UserActivityRow,
} from "@/lib/admin-stats";

type Overview = {
  users_total: number;
  users_household: number;
  users_clinic: number;
  users_unset: number;
  workspaces_household: number;
  workspaces_clinic: number;
  patients_total: number;
  prescriptions_total: number;
  prescriptions_in_window: number;
  active_users_in_window: number;
};
type TrendRow = { bucket_start: string; prescriptions: number };
type HerbRow = { herb_name: string | null; prescriptions: number | null; other_herbs: number | null };
type PairRow = { herb_a: string | null; herb_b: string | null; prescriptions: number | null; other_pairs: number | null };

/** 平台管理员数据看板（docs/design/0015）。数据全部来自只返回汇总数字的统计函数 */
export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <PageHeader title="平台数据" subtitle={`只有汇总数字。不到 ${MIN_SUBJECTS} 位病人的药材和组合合并成「其他」`} />
      <Suspense fallback={<Loading />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pMonth = parseMonth(sp.month);
  const month = pMonth?.slice(0, 7) ?? null;
  const { supabase } = await getContext();
  // layout 已经检查过，但页面和 layout 是同时渲染的：这里再查一次，非管理员不去调统计函数
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) notFound();
  const args = { p_month: pMonth };
  const [overview, days, weeks, users, herbs, pairs] = await Promise.all([
    supabase.rpc("admin_overview", args),
    supabase.rpc("admin_prescription_trend", { ...args, p_bucket: "day" }),
    supabase.rpc("admin_prescription_trend", { ...args, p_bucket: "week" }),
    supabase.rpc("admin_user_activity", args),
    // 药材和组合只能按月看（0015 §5.3）
    pMonth ? supabase.rpc("admin_top_herbs", { ...args, p_limit: 20 }) : { data: [], error: null },
    pMonth ? supabase.rpc("admin_top_pairs", { ...args, p_limit: 20 }) : { data: [], error: null },
  ]);
  for (const r of [overview, days, weeks, users, herbs, pairs]) if (r.error) throw new Error(r.error.message);
  const o = (overview.data as Overview[])[0];
  const dayRows = days.data as TrendRow[];
  const weekRows = weeks.data as TrendRow[];
  const userRows = users.data as UserActivityRow[];
  const herbRows = herbs.data as HerbRow[];
  const pairRows = pairs.data as PairRow[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const months = recentMonths(today);
  const period = month ? monthLabel(month) : "全部时间";

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="时间段" data-testid="admin-months">
        {[null, ...months].map((m) => (
          <Link
            key={m ?? "all"}
            href={m ? `/admin?month=${m}` : "/admin"}
            data-bug-label="看板选月份"
            aria-current={m === month ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${m === month ? "border-cinnabar bg-cinnabar text-white" : "border-line text-muted hover:bg-paper"}`}
          >
            {m ? monthLabel(m) : "全部"}
          </Link>
        ))}
        {month && !months.includes(month) && (
          <span aria-current="page" className="rounded-full border border-cinnabar bg-cinnabar px-3 py-1 text-sm text-white">
            {monthLabel(month)}
          </span>
        )}
      </nav>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="admin-overview">
        <Tile
          label="账号"
          value={o.users_total}
          testId="users"
          sub={`病人 ${o.users_household} · 医生 ${o.users_clinic} · 未选 ${o.users_unset}`}
        />
        <Tile
          label="药柜"
          value={o.workspaces_household + o.workspaces_clinic}
          testId="workspaces"
          sub={`家庭 ${o.workspaces_household} · 诊所 ${o.workspaces_clinic}`}
        />
        <Tile label="病人档案" value={o.patients_total} testId="patients" sub="诊所里建的，只有数量" />
        <Tile
          label={`处方（${period}）`}
          value={o.prescriptions_in_window}
          testId="prescriptions"
          sub={`${o.active_users_in_window} 个账号建过 · 一共 ${o.prescriptions_total} 张`}
        />
      </section>

      <section className="card space-y-5">
        <h2 className="font-serif text-lg font-bold">处方趋势</h2>
        <Trend title={month ? "每天" : "每天（最近 30 天）"} rows={dayRows} bucket="day" />
        <Trend title={month ? "每周" : "每周（最近 12 周）"} rows={weekRows} bucket="week" />
      </section>

      <section className="card">
        <h2 className="mb-2 font-serif text-lg font-bold">账号（{period}建过处方的）</h2>
        {!userRows.length ? (
          <p className="text-sm text-muted">这段时间没有处方。</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="admin-users">
            {userRows.map((u) => (
              <li key={u.user_no} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2" data-testid="admin-user">
                <span className="min-w-0 break-all">
                  {userLabel(u)}
                  {u.is_me && <span className="ml-1 text-xs text-muted">（你）</span>}
                </span>
                <span className="shrink-0 text-sm text-muted">
                  处方{" "}
                  <b className="text-ink" data-testid="admin-user-rx">
                    {u.prescriptions}
                  </b>{" "}
                  张 · 药材{" "}
                  <b className="text-ink" data-testid="admin-user-herbs">
                    {u.herbs}
                  </b>{" "}
                  种 · 最近 <span data-testid="admin-user-last">{u.last_on}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pMonth ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Ranking
            title="常用药材"
            testId="admin-herbs"
            unit="味"
            rows={herbRows.map((h) => ({ name: h.herb_name, count: h.prescriptions, other: h.other_herbs }))}
          />
          <Ranking
            title="常见组合（同一张处方里）"
            testId="admin-pairs"
            unit="对"
            rows={pairRows.map((p) => ({ name: p.herb_a && `${p.herb_a} + ${p.herb_b}`, count: p.prescriptions, other: p.other_pairs }))}
          />
        </div>
      ) : (
        <p className="card text-sm text-muted" data-testid="admin-rank-hint">
          常用药材和常见组合只能按月看：上面选一个月份。（全部时间和某个月的数字相减，能算出被隐藏的那部分，所以不同时给。）
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, sub, testId }: { label: string; value: number; sub: string; testId: string }) {
  return (
    <div className="card" data-testid={`admin-${testId}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-serif text-2xl font-bold" data-testid={`admin-${testId}-value`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted" data-testid={`admin-${testId}-sub`}>
        {sub}
      </div>
    </div>
  );
}

/** 柱状图：CSS 画的，每根柱子带 data-count，读屏念「日期：几张」 */
function Trend({ title, rows, bucket }: { title: string; rows: TrendRow[]; bucket: "day" | "week" }) {
  const max = Math.max(0, ...rows.map((r) => r.prescriptions));
  const total = rows.reduce((s, r) => s + r.prescriptions, 0);
  return (
    <figure data-testid={`admin-trend-${bucket}`}>
      <figcaption className="mb-2 flex justify-between text-sm">
        <span>{title}</span>
        <span className="text-muted">共 {total} 张</span>
      </figcaption>
      <ol className="flex h-28 items-end gap-px border-b border-line" aria-label={title}>
        {rows.map((r) => (
          <li
            key={r.bucket_start}
            className="flex h-full min-w-0 flex-1 items-end"
            data-bucket={r.bucket_start}
            data-count={r.prescriptions}
            title={`${r.bucket_start}：${r.prescriptions} 张`}
            aria-label={`${bucketLabel(r.bucket_start, bucket)}：${r.prescriptions} 张`}
          >
            <span className="block w-full rounded-t-sm bg-cinnabar/80" style={{ height: `${barPercent(r.prescriptions, max)}%` }} />
          </li>
        ))}
      </ol>
      {rows.length > 0 && (
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{bucketLabel(rows[0].bucket_start, bucket)}</span>
          <span>{bucketLabel(rows[rows.length - 1].bucket_start, bucket)}</span>
        </div>
      )}
    </figure>
  );
}

type RankRow = { name: string | null; count: number | null; other: number | null };

function Ranking({ title, rows, unit, testId }: { title: string; rows: RankRow[]; unit: string; testId: string }) {
  const shown = rows.filter((r) => r.name !== null);
  const other = rows.find((r) => r.name === null)?.other ?? 0;
  const max = Math.max(0, ...shown.map((r) => r.count ?? 0));
  return (
    <section className="card" data-testid={testId}>
      <h2 className="mb-2 font-serif text-lg font-bold">{title}</h2>
      {!shown.length && !other ? (
        <p className="text-sm text-muted">这段时间没有处方。</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.name} data-testid={`${testId}-row`}>
              <div className="flex justify-between gap-3 text-sm">
                <span data-testid={`${testId}-name`}>{r.name}</span>
                <span className="shrink-0 text-muted">
                  <span data-testid={`${testId}-count`}>{r.count}</span> 张
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-paper">
                <div className="h-1.5 rounded-full bg-jade" style={{ width: `${barPercent(r.count ?? 0, max)}%` }} />
              </div>
            </li>
          ))}
          {!shown.length && <li className="text-sm text-muted">没有达到 {MIN_SUBJECTS} 位病人的。</li>}
          {other > 0 && (
            <li className="text-sm text-muted" data-testid={`${testId}-other`}>
              其他 {other} {unit}（每{unit}不到 {MIN_SUBJECTS} 位病人，合并不显示）
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
