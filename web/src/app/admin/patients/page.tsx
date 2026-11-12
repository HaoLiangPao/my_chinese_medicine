import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { parseRange, rangeQuery } from "@/lib/admin-stats";
import { requireAdmin, rows, torontoToday } from "../admin";
import { RangePicker } from "../ui";
import type { PatientAccount } from "./data";

/** 病人账号列表：只有编号和数字（docs/design/0015 §4.3） */
export default function PatientsPage({ searchParams }: PageProps<"/admin/patients">) {
  return (
    <Suspense fallback={<Loading />}>
      <List searchParams={searchParams} />
    </Suspense>
  );
}

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const range = parseRange(await searchParams);
  const { supabase } = await requireAdmin();
  const accounts = rows<PatientAccount>(await supabase.rpc("admin_patient_accounts", { p_from: range.from, p_to: range.to }));
  const q = rangeQuery(range);
  return (
    <div className="space-y-6">
      <RangePicker path="/admin/patients" range={range} today={torontoToday()} />
      <section className="card">
        <h2 className="mb-1 font-serif text-lg font-bold">病人账号（{accounts.length}）</h2>
        <p className="mb-2 text-xs text-muted">
          只显示编号和数字，不显示邮箱和用了哪些药。诊所里的病人档案不在这里（只在医生那里算数量）。
        </p>
        {!accounts.length ? (
          <p className="text-sm text-muted">还没有病人账号。</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="admin-patients">
            {accounts.map((a) => (
              <li key={a.user_id} data-testid="admin-patient">
                <Link
                  href={`/admin/patients/${a.user_id}${q}`}
                  data-bug-label="看板打开病人账号详情"
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 hover:text-cinnabar"
                >
                  <span>
                    病人 #{a.user_no}
                    {a.is_me && <span className="ml-1 text-xs text-muted">（你）</span>}
                  </span>
                  <span className="shrink-0 text-sm text-muted">
                    这段时间处方 {a.prescriptions} 张 · 药材 {a.herbs} 种 · 家里 {a.members} 人 · 最近 {a.last_on ?? "—"}
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
