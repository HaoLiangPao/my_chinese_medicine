import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { MIN_SUBJECTS, parseRange, parseSort, parseTop, rangeLabel, rangeQuery, userLabel, weight } from "@/lib/admin-stats";
import { requireAdmin, rows, torontoToday } from "./admin";
import { RangePicker, Ranking, Tile, TopPicker, TrendChart, type TrendRow } from "./ui";

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
type Activity = {
  user_id: string;
  user_no: number;
  email: string | null;
  account_kind: string | null;
  prescriptions: number;
  herbs: number;
  last_on: string;
  is_me: boolean;
};
type HerbRow = { herb_name: string | null; prescriptions: number | null; total_grams: number | null; other_herbs: number | null };
type PairRow = { herb_a: string | null; herb_b: string | null; prescriptions: number | null; other_pairs: number | null };

/** 平台总览（docs/design/0015 §6）。数据全部来自只返回汇总数字的统计函数 */
export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Loading />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const range = parseRange(sp);
  const top = parseTop(sp.top);
  const sort = parseSort(sp.sort);
  const { supabase } = await requireAdmin();
  const args = { p_from: range.from, p_to: range.to };
  const [overview, trend, users, herbs, pairs] = await Promise.all([
    supabase.rpc("admin_overview", args),
    supabase.rpc("admin_prescription_trend", { ...args, p_bucket: "auto" }),
    supabase.rpc("admin_user_activity", args),
    supabase.rpc("admin_top_herbs", { ...args, p_limit: top, p_order: sort }),
    supabase.rpc("admin_top_pairs", { ...args, p_limit: top }),
  ]);
  const o = rows<Overview>(overview)[0];
  const userRows = rows<Activity>(users);
  const herbRows = rows<HerbRow>(herbs);
  const pairRows = rows<PairRow>(pairs);
  const q = rangeQuery(range);
  const keep = { top: String(top), sort };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">只有汇总数字。不到 {MIN_SUBJECTS} 位病人的药材和组合合并成「其他」。</p>
      <RangePicker path="/admin" range={range} today={torontoToday()} extra={keep} />

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
          label="处方（这段时间）"
          value={o.prescriptions_in_window}
          testId="prescriptions"
          sub={`${o.active_users_in_window} 个账号建过 · 一共 ${o.prescriptions_total} 张`}
        />
      </section>

      <TrendChart rows={rows<TrendRow>(trend)} />

      <section className="card">
        <h2 className="mb-2 font-serif text-lg font-bold">这段时间建过处方的账号</h2>
        {!userRows.length ? (
          <p className="text-sm text-muted">这段时间没有处方。</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="admin-users">
            {userRows.map((u) => {
              const href =
                u.account_kind === "clinic"
                  ? `/admin/doctors/${u.user_id}${q}`
                  : u.account_kind === "household"
                    ? `/admin/patients/${u.user_id}${q}`
                    : null;
              return (
                <li key={u.user_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2" data-testid="admin-user">
                  <span className="min-w-0 break-all">
                    {href ? (
                      <Link href={href} className="hover:text-cinnabar" data-bug-label="看板打开账号详情">
                        {userLabel(u)}
                      </Link>
                    ) : (
                      userLabel(u)
                    )}
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
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Ranking
          title="常用药材"
          testId="admin-herbs"
          unit="味"
          rows={herbRows
            .filter((h) => h.herb_name)
            .map((h) => ({
              name: h.herb_name!,
              value: sort === "rx" ? h.prescriptions! : Number(h.total_grams),
              display: sort === "rx" ? `${h.prescriptions} 张` : weight(h.total_grams),
              note: sort === "rx" ? weight(h.total_grams) : `${h.prescriptions} 张`,
            }))}
          other={herbRows.find((h) => !h.herb_name)?.other_herbs ?? 0}
          controls={
            <div className="flex flex-wrap items-center gap-2">
              <TopPicker path="/admin" range={range} top={top} extra={{ sort }} />
              <div className="flex gap-1" role="group" aria-label="排序" data-testid="admin-herbs-sort">
                {(
                  [
                    ["grams", "按用量"],
                    ["rx", "按张数"],
                  ] as const
                ).map(([k, label]) => (
                  <Link
                    key={k}
                    href={`/admin${rangeQuery(range, { top, sort: k })}`}
                    data-bug-label="看板药材排序"
                    aria-current={k === sort ? "true" : undefined}
                    className={`rounded-md border px-2 py-0.5 text-xs ${k === sort ? "border-ink bg-ink text-paper" : "border-line text-muted hover:bg-paper"}`}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          }
        />
        <Ranking
          title="常见组合（同一张处方里）"
          testId="admin-pairs"
          unit="对"
          rows={pairRows
            .filter((p) => p.herb_a)
            .map((p) => ({ name: `${p.herb_a} + ${p.herb_b}`, value: p.prescriptions!, display: `${p.prescriptions} 张` }))}
          other={pairRows.find((p) => !p.herb_a)?.other_pairs ?? 0}
        />
      </div>
      <p className="text-xs text-muted">用量 = 处方里每副的克数 × 剂数（开出来的量，不是实际配药扣掉的库存）。</p>
    </div>
  );
}
