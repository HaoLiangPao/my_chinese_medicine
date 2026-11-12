import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { parseRange, rangeQuery, small, weight } from "@/lib/admin-stats";
import { requireAdmin, rows, torontoToday } from "../admin";
import { RangePicker } from "../ui";
import type { Doctor } from "./data";

/** 医生（诊所账号）列表：点进去看详情 */
export default function DoctorsPage({ searchParams }: PageProps<"/admin/doctors">) {
  return (
    <Suspense fallback={<Loading />}>
      <List searchParams={searchParams} />
    </Suspense>
  );
}

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const range = parseRange(await searchParams);
  const { supabase } = await requireAdmin();
  const doctors = rows<Doctor>(await supabase.rpc("admin_doctors", { p_from: range.from, p_to: range.to }));
  const q = rangeQuery(range);
  return (
    <div className="space-y-6">
      <RangePicker path="/admin/doctors" range={range} today={torontoToday()} />
      <section className="card">
        <h2 className="mb-2 font-serif text-lg font-bold">医生（{doctors.length}）</h2>
        {!doctors.length ? (
          <p className="text-sm text-muted">还没有医生账号。</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="admin-doctors">
            {doctors.map((d) => (
              <li key={d.user_id} data-testid="admin-doctor">
                <Link
                  href={`/admin/doctors/${d.user_id}${q}`}
                  data-bug-label="看板打开医生详情"
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 hover:text-cinnabar"
                >
                  <span className="min-w-0 break-all">
                    医生 #{d.user_no} · {d.email}
                  </span>
                  <span className="shrink-0 text-sm text-muted">
                    病人 {small(d.patients_total)} · 这段时间处方 {d.prescriptions} 张 · 消耗 {weight(d.consumed_grams)} · 最近{" "}
                    {d.last_on ?? "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
