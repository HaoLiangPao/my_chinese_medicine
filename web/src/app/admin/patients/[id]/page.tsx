import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loading } from "@/components/ui";
import { parseRange, parseUuid, rangeQuery } from "@/lib/admin-stats";
import { requireAdmin, rows, torontoToday } from "../../admin";
import { RangePicker, Tile, TrendChart, type TrendRow } from "../../ui";
import type { PatientAccount } from "../data";

/** 一个病人账号：只有数字（处方数、药材种数、活跃天数），不显示用了哪些药（docs/design/0015 §4.3） */
export default function PatientPage({ params, searchParams }: PageProps<"/admin/patients/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = parseUuid((await params).id);
  const range = parseRange(await searchParams);
  const { supabase } = await requireAdmin();
  if (!id) notFound();
  const args = { p_from: range.from, p_to: range.to };
  const [acc, trend] = await Promise.all([
    supabase.rpc("admin_patient_accounts", { ...args, p_user: id }),
    supabase.rpc("admin_prescription_trend", { ...args, p_bucket: "auto", p_user: id }),
  ]);
  const a = rows<PatientAccount>(acc)[0];
  if (!a) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/patients${rangeQuery(range)}`}
          className="text-sm text-muted hover:text-cinnabar"
          data-bug-label="看板回到病人列表"
        >
          ← 病人
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold" data-testid="admin-patient-name">
          病人 #{a.user_no}
          {a.is_me && <span className="ml-2 text-sm font-normal text-muted">（你）</span>}
        </h1>
        <p className="text-sm text-muted">
          家里 {a.members} 人 · 最近一次药方：{a.last_on ?? "—"}
        </p>
      </div>
      <RangePicker path={`/admin/patients/${id}`} range={range} today={torontoToday()} />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="admin-patient-tiles">
        <Tile label="药方（这段时间）" value={a.prescriptions} testId="pa-rx" sub={`一共 ${a.prescriptions_total} 张`} />
        <Tile label="用过的药材" value={a.herbs} testId="pa-herbs" sub="种（不显示是哪些）" />
        <Tile label="煎药（这段时间）" value={a.decoctions} testId="pa-decoctions" sub="次" />
        <Tile label="录药方的天数" value={a.active_days} testId="pa-days" sub="这段时间里" />
      </section>
      <TrendChart rows={rows<TrendRow>(trend)} />
      <p className="text-xs text-muted">病人账号只给数字：不显示邮箱，也不显示用了哪些药（病人只出现在计数里）。</p>
    </div>
  );
}
