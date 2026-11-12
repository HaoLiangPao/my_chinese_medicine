import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loading } from "@/components/ui";
import { MIN_SUBJECTS, parseRange, parseTop, rangeLabel, rangeQuery, parseUuid, weight } from "@/lib/admin-stats";
import { requireAdmin, rows, torontoToday } from "../../admin";
import { RangePicker, Ranking, Tile, TopPicker, TrendChart, type TrendRow } from "../../ui";
import type { Doctor } from "../data";

type Consumption = { herb_name: string | null; consumed_grams: number | null; other_herbs: number | null };

/** 一个医生：病人数（只有数量）、处方、配药、库存消耗（逐味的要过 5 位病人的门槛） */
export default function DoctorPage({ params, searchParams }: PageProps<"/admin/doctors/[id]">) {
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
  const sp = await searchParams;
  const range = parseRange(sp);
  const top = parseTop(sp.top);
  const { supabase } = await requireAdmin();
  if (!id) notFound();
  const args = { p_from: range.from, p_to: range.to };
  const [doc, trend, used] = await Promise.all([
    supabase.rpc("admin_doctors", { ...args, p_user: id }),
    supabase.rpc("admin_prescription_trend", { ...args, p_bucket: "auto", p_user: id }),
    supabase.rpc("admin_doctor_consumption", { ...args, p_user: id, p_limit: top }),
  ]);
  const d = rows<Doctor>(doc)[0];
  if (!d) notFound();
  const herbs = rows<Consumption>(used);
  const path = `/admin/doctors/${id}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/doctors${rangeQuery(range)}`}
          className="text-sm text-muted hover:text-cinnabar"
          data-bug-label="看板回到医生列表"
        >
          ← 医生
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold break-all" data-testid="admin-doctor-name">
          医生 #{d.user_no} · {d.email}
        </h1>
        <p className="text-sm text-muted">最近一次处方：{d.last_on ?? "—"}</p>
      </div>
      <RangePicker path={path} range={range} today={torontoToday()} extra={{ top: String(top) }} />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="admin-doctor-tiles">
        <Tile
          label="病人档案"
          value={d.patients_total}
          testId="doc-patients"
          sub={`这段时间新建 ${d.patients_new} · 看过 ${d.patients_seen}`}
        />
        <Tile label="处方（这段时间）" value={d.prescriptions} testId="doc-rx" sub={`一共 ${d.prescriptions_total} 张`} />
        <Tile label="配药（这段时间）" value={d.decoctions} testId="doc-decoctions" sub="次" />
        <Tile label="库存消耗（这段时间）" value={weight(d.consumed_grams)} testId="doc-consumed" sub="配药扣掉的克数" />
      </section>
      <TrendChart rows={rows<TrendRow>(trend)} />
      <Ranking
        title={`库存消耗（${rangeLabel(range)}）`}
        testId="admin-consumption"
        unit="味"
        rows={herbs
          .filter((h) => h.herb_name)
          .map((h) => ({ name: h.herb_name!, value: Number(h.consumed_grams), display: weight(h.consumed_grams) }))}
        other={herbs.find((h) => !h.herb_name)?.other_herbs ?? 0}
        controls={<TopPicker path={path} range={range} top={top} />}
      />
      <p className="text-xs text-muted">病人只有数量，看不到是谁。逐味的消耗只列出用在至少 {MIN_SUBJECTS} 位病人身上的药。</p>
    </div>
  );
}
