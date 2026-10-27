import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { grams, money } from "@/lib/format";
import { Loading } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteDecoction, deletePrescription } from "../actions";
import { listHerbs } from "@/lib/herbs";
import { maxDosesFromStock, perDoseTotal } from "@/lib/rx";
import { varianceStatus } from "@/lib/decoction";
import { DecoctionForm } from "./decoction-form";
import { MessageBox } from "./message-box";
import { formatWeChatMessage } from "@/lib/rx-message";
import { CostSection } from "./cost-section";
import { parseStrategy } from "@/lib/pricing";

export default function PrescriptionPage({ params, searchParams }: PageProps<"/prescriptions/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Rx = {
  id: string;
  workspace_id: string;
  title: string | null;
  prescriber: string | null;
  patient_label: string | null;
  issued_on: string;
  dose_count: number;
  instructions: string | null;
  price_paid: number | null;
  photo_path: string | null;
  notes: string | null;
  source: string;
  patient_id: string | null;
  prescription_items: {
    herb_id: string;
    grams_per_dose: number;
    special_prep: string | null;
    note: string | null;
    raw_name: string | null;
    sort_order: number;
    herbs: { name_zh: string; category: string | null } | null;
  }[];
};

async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const strategy = parseStrategy(sp.cost);
  const { supabase } = await getContext();

  const { data } = await supabase
    .from("prescriptions")
    .select("*, prescription_items(herb_id, grams_per_dose, special_prep, note, raw_name, sort_order, herbs(name_zh, category))")
    .eq("id", id)
    .maybeSingle();
  const rx = data as Rx | null;
  if (!rx) notFound();

  const items = [...rx.prescription_items].sort((a, b) => a.sort_order - b.sort_order);
  const herbIds = items.map((i) => i.herb_id);

  const [{ data: inv }, { data: variance }, herbs, photo] = await Promise.all([
    supabase.from("v_inventory").select("herb_id, on_hand_grams").eq("workspace_id", rx.workspace_id).in("herb_id", herbIds),
    supabase
      .from("v_decoction_variance")
      .select("decoction_id, decocted_at, doses, name_zh, planned_grams, actual_grams, diff_grams")
      .eq("prescription_id", id)
      .eq("workspace_id", rx.workspace_id)
      .order("decocted_at", { ascending: false }),
    listHerbs(supabase),
    rx.photo_path
      ? supabase.storage.from("prescription-photos").createSignedUrl(rx.photo_path, 600)
      : Promise.resolve({ data: null }),
  ]);
  const onHand = new Map((inv ?? []).map((r) => [r.herb_id, Number(r.on_hand_grams)]));
  const perDose = perDoseTotal(items.map((i) => ({ grams: i.grams_per_dose })));
  const canMake = maxDosesFromStock(items, onHand);

  // 煎药历史：按 decoction 分组，只列出和处方不一样的药
  type Hist = { at: string; doses: number; diffs: { name: string; planned: number; actual: number }[] };
  const history = new Map<string, Hist>();
  for (const v of variance ?? []) {
    const h: Hist = history.get(v.decoction_id) ?? { at: v.decocted_at, doses: v.doses, diffs: [] };
    if (Number(v.diff_grams) !== 0) h.diffs.push({ name: v.name_zh, planned: Number(v.planned_grams), actual: Number(v.actual_grams) });
    history.set(v.decoction_id, h);
  }
  // 诊所处方：病人 + 发给病人的微信消息
  const isClinic = rx.source === "clinic";
  let message: string | null = null;
  let patient: { id: string; name: string | null; phone: string | null } | null = null;
  if (isClinic) {
    const [{ data: p }, { data: w }] = await Promise.all([
      rx.patient_id ? supabase.from("patients").select("id, name, phone").eq("id", rx.patient_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("workspaces").select("name").eq("id", rx.workspace_id).single(),
    ]);
    patient = p;
    message = formatWeChatMessage({
      clinicName: w?.name ?? rx.prescriber ?? "",
      date: rx.issued_on,
      patient: p ?? { name: rx.patient_label },
      doses: rx.dose_count,
      items: items.map((i) => ({ name: i.herbs?.name_zh ?? "", grams: i.grams_per_dose, prep: i.special_prep, note: i.note })),
      instructions: rx.instructions,
      advice: rx.notes,
    });
  }
  const unit = isClinic ? "剂" : "副";

  const STATUS_LABEL = { over: "多用", under: "少用", omitted: "没放", extra: "加了", exact: "" } as const;

  return (
    <div className="space-y-5">
      <div>
        {patient ? (
          <Link href={`/clinic/patients/${patient.id}`} className="text-sm text-muted" data-testid="back-to-patient">← {patient.name || patient.phone} 的病历</Link>
        ) : (
          <Link href="/prescriptions" className="text-sm text-muted">← 药方</Link>
        )}
        <h1 className="mt-1 font-serif text-2xl font-bold">{rx.title || "未命名药方"}</h1>
        <p className="mt-1 text-sm text-muted">
          {rx.issued_on} · {rx.prescriber} · {rx.dose_count} {unit} · {items.length} 味 · 每副 {grams(perDose)}
          {rx.patient_label && ` · ${rx.patient_label}`}
          {rx.price_paid != null && ` · 实付 ${money(rx.price_paid)}（约 ${money(Number(rx.price_paid) / rx.dose_count)}/副）`}
        </p>
        {rx.instructions && <p className="mt-2 text-sm">煎服法：{rx.instructions}</p>}
      </div>

      {message && <MessageBox text={message} highlight={sp.new === "1"} />}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>药材</th>
              <th className="text-right">每副</th>
              <th className="text-right">共 {rx.dose_count} {unit}</th>
              <th className="text-right">{isClinic ? "库存" : "药柜存量"}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const have = onHand.get(i.herb_id);
              const need = Number(i.grams_per_dose) * rx.dose_count;
              return (
                <tr key={i.herb_id}>
                  <td>
                    <Link href={`/herbs/${i.herb_id}`} className="font-medium hover:text-cinnabar">{i.herbs?.name_zh}</Link>
                    {i.special_prep && <span className="ml-1 rounded bg-paper px-1 text-xs text-amber">{i.special_prep}</span>}
                    {i.raw_name && i.raw_name !== i.herbs?.name_zh && <span className="ml-1 text-xs text-muted">（原文 {i.raw_name}）</span>}
                    {i.note && <div className="text-xs text-muted whitespace-normal">备注：{i.note}</div>}
                  </td>
                  <td className="text-right">{grams(i.grams_per_dose)}</td>
                  <td className="text-right">{grams(need)}</td>
                  <td data-testid={`rx-stock-${i.herbs?.name_zh}`} className={`text-right ${have === undefined ? "text-muted" : have >= need ? "text-jade" : "text-cinnabar"}`}>
                    {have === undefined ? "没有" : grams(have)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CostSection supabase={supabase} rx={rx} strategy={strategy} clinic={isClinic} />

      <div className="card space-y-2">
        <h2 className="font-serif text-lg font-bold">{isClinic ? "配药（从诊所库存扣）" : "煎药（从家里药柜取药）"}</h2>
        <DecoctionForm
          key={[...history.keys()].join(",")}
          prescriptionId={rx.id}
          plan={items.map((i) => ({ herb_id: i.herb_id, name: i.herbs?.name_zh ?? "", grams_per_dose: Number(i.grams_per_dose) }))}
          defaultDoses={Math.min(rx.dose_count, Math.max(canMake, 1))}
          maxDoses={canMake}
          herbNames={herbs.map((h) => h.name_zh)}
        />
      </div>

      {history.size > 0 && (
        <div className="card" data-testid="decoction-history">
          <h2 className="mb-2 font-serif text-lg font-bold">煎药记录（{history.size} 次）</h2>
          <ul className="space-y-2 text-sm">
            {[...history.entries()].map(([decId, h]) => (
              <li key={decId} className="flex flex-wrap items-center gap-y-1" data-testid="decoction-entry">
                <span className="text-muted">{h.at.slice(0, 16).replace("T", " ")}</span> · 煎 {h.doses} 副
                {h.diffs.length === 0 ? (
                  <span className="ml-1 text-jade">按处方</span>
                ) : (
                  h.diffs.map((d) => (
                    <span key={d.name} className="ml-2 rounded bg-paper px-1 text-amber">
                      {d.name} {STATUS_LABEL[varianceStatus(d.planned, d.actual)]} {d.planned === 0 ? `${d.actual}g` : `${d.planned}→${d.actual}g`}
                    </span>
                  ))
                )}
                <form action={deleteDecoction} className="ml-auto">
                  <input type="hidden" name="decoction_id" value={decId} />
                  <input type="hidden" name="prescription_id" value={rx.id} />
                  <ConfirmButton message="撤销这次煎药？扣掉的库存会加回去。" className="text-xs text-muted underline hover:text-cinnabar">撤销</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {photo.data?.signedUrl && (
        <div className="card">
          <h2 className="mb-2 font-serif text-lg font-bold">原始照片</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.data.signedUrl} alt="药方照片" className="max-h-[32rem] w-auto rounded-md" />
        </div>
      )}

      {rx.notes && <p className="text-sm text-muted">备注：{rx.notes}</p>}

      <form action={deletePrescription}>
        <input type="hidden" name="id" value={rx.id} />
        <ConfirmButton message="确定删除这张药方？（已扣的库存不会退回）" className="text-sm text-muted underline hover:text-cinnabar">删除这张药方</ConfirmButton>
      </form>
    </div>
  );
}
