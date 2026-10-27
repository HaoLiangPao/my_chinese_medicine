import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { Loading } from "@/components/ui";

export default function PatientPage({ params }: PageProps<"/clinic/patients/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} />
    </Suspense>
  );
}

type Rx = {
  id: string;
  issued_on: string;
  dose_count: number;
  instructions: string | null;
  notes: string | null;
  prescription_items: { grams_per_dose: number; special_prep: string | null; sort_order: number; herbs: { name_zh: string } | null }[];
};

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, workspaceId } = await getContext();
  const { data: p } = await supabase.from("patients").select("id, name, phone, notes, created_at").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!p) notFound();
  const { data: rxs } = await supabase
    .from("prescriptions")
    .select("id, issued_on, dose_count, instructions, notes, prescription_items(grams_per_dose, special_prep, sort_order, herbs(name_zh))")
    .eq("patient_id", id)
    .order("issued_on", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<Rx[]>();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/clinic/patients" className="text-sm text-muted">← 病人</Link>
        <h1 className="mt-1 font-serif text-2xl font-bold" data-testid="patient-name">{p.name || "（没填名字）"}</h1>
        <p className="mt-1 text-sm text-muted">
          {p.phone ?? "没填电话"} · 建档 {String(p.created_at).slice(0, 10)}
          {p.notes && ` · ${p.notes}`}
        </p>
      </div>
      <Link href={`/clinic/prescribe?patient=${p.id}`} className="btn-primary">＋ 给 Ta 开新方</Link>

      <section>
        <h2 className="mb-2 font-serif text-lg font-bold">历次处方（{rxs?.length ?? 0}）</h2>
        {!rxs?.length ? (
          <p className="card text-sm text-muted">还没有处方。</p>
        ) : (
          <div className="space-y-3" data-testid="patient-rx-list">
            {rxs.map((r) => (
              <Link key={r.id} href={`/prescriptions/${r.id}`} className="card block hover:border-cinnabar" data-testid="patient-rx">
                <div className="flex justify-between">
                  <span className="font-medium">{r.issued_on}</span>
                  <span className="text-sm text-muted">{r.dose_count} 剂 · {r.prescription_items.length} 味</span>
                </div>
                <p className="mt-1 text-sm">
                  {[...r.prescription_items]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((i) => `${i.herbs?.name_zh} ${Number(i.grams_per_dose)}g${i.special_prep ? `（${i.special_prep}）` : ""}`)
                    .join("　")}
                </p>
                {r.notes && <p className="mt-1 text-xs text-muted">医嘱：{r.notes}</p>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
