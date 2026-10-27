import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { grams, money } from "@/lib/format";
import { Loading } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { consumePrescription, deletePrescription } from "../actions";

export default function PrescriptionPage({ params }: PageProps<"/prescriptions/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} />
    </Suspense>
  );
}

type Rx = {
  id: string;
  title: string | null;
  prescriber: string | null;
  patient_label: string | null;
  issued_on: string;
  dose_count: number;
  instructions: string | null;
  price_paid: number | null;
  photo_path: string | null;
  notes: string | null;
  prescription_items: {
    herb_id: string;
    grams_per_dose: number;
    special_prep: string | null;
    raw_name: string | null;
    sort_order: number;
    herbs: { name_zh: string; category: string | null } | null;
  }[];
};

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getContext();

  const { data } = await supabase
    .from("prescriptions")
    .select("*, prescription_items(herb_id, grams_per_dose, special_prep, raw_name, sort_order, herbs(name_zh, category))")
    .eq("id", id)
    .maybeSingle();
  const rx = data as Rx | null;
  if (!rx) notFound();

  const items = [...rx.prescription_items].sort((a, b) => a.sort_order - b.sort_order);
  const herbIds = items.map((i) => i.herb_id);

  const [{ data: inv }, { data: consumed }, photo] = await Promise.all([
    supabase.from("v_inventory").select("herb_id, on_hand_grams").in("herb_id", herbIds),
    supabase.from("inventory_txns").select("delta_grams, occurred_at, note").eq("prescription_id", id).order("occurred_at"),
    rx.photo_path
      ? supabase.storage.from("prescription-photos").createSignedUrl(rx.photo_path, 600)
      : Promise.resolve({ data: null }),
  ]);
  const onHand = new Map((inv ?? []).map((r) => [r.herb_id, Number(r.on_hand_grams)]));
  const perDose = items.reduce((s, i) => s + Number(i.grams_per_dose), 0);
  const canMake = Math.min(
    ...items.map((i) => Math.floor((onHand.get(i.herb_id) ?? 0) / Number(i.grams_per_dose))),
  );
  const consumeEvents = new Set((consumed ?? []).map((c) => c.occurred_at)).size;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/prescriptions" className="text-sm text-muted">← 药方</Link>
        <h1 className="mt-1 font-serif text-2xl font-bold">{rx.title || "未命名药方"}</h1>
        <p className="mt-1 text-sm text-muted">
          {rx.issued_on} · {rx.prescriber} · {rx.dose_count} 副 · {items.length} 味 · 每副 {grams(perDose)}
          {rx.patient_label && ` · ${rx.patient_label}`}
          {rx.price_paid != null && ` · 实付 ${money(rx.price_paid)}（约 ${money(Number(rx.price_paid) / rx.dose_count)}/副）`}
        </p>
        {rx.instructions && <p className="mt-2 text-sm">煎服法：{rx.instructions}</p>}
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>药材</th>
              <th className="text-right">每副</th>
              <th className="text-right">共 {rx.dose_count} 副</th>
              <th className="text-right">药柜存量</th>
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
                  </td>
                  <td className="text-right">{grams(i.grams_per_dose)}</td>
                  <td className="text-right">{grams(need)}</td>
                  <td className={`text-right ${have === undefined ? "text-muted" : have >= need ? "text-jade" : "text-cinnabar"}`}>
                    {have === undefined ? "没有" : grams(have)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card space-y-2">
        <h2 className="font-serif text-lg font-bold">用家里药柜配药</h2>
        <p className="text-sm text-muted">
          按现有库存最多能配 <b className="text-ink">{Math.max(canMake, 0)}</b> 副。
          {consumeEvents > 0 && ` 已经从药柜配过 ${consumeEvents} 次。`}
          配药会从药柜扣掉相应克数（库存可以是负数，提醒你补货）。
        </p>
        <form action={consumePrescription} className="flex gap-2">
          <input type="hidden" name="id" value={rx.id} />
          <input name="doses" type="number" min={1} defaultValue={rx.dose_count} className="input w-24" />
          <button className="btn-primary">配 N 副，扣库存</button>
        </form>
      </div>

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
