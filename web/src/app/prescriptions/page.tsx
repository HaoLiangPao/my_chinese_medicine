import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { money } from "@/lib/format";
import { Empty, Loading, PageHeader } from "@/components/ui";

export default function PrescriptionsPage() {
  return (
    <>
      <PageHeader title="药方" subtitle="李医生开的每一张方子" action={{ href: "/prescriptions/new", label: "＋ 新药方" }} />
      <Suspense fallback={<Loading />}>
        <List />
      </Suspense>
    </>
  );
}

type Row = {
  id: string;
  title: string | null;
  issued_on: string;
  dose_count: number;
  patient_label: string | null;
  price_paid: number | null;
  prescription_items: { grams_per_dose: number; herbs: { name_zh: string } | null }[];
};

async function List() {
  const { supabase } = await getContext();
  const { data, error } = await supabase
    .from("prescriptions")
    .select("id, title, issued_on, dose_count, patient_label, price_paid, prescription_items(grams_per_dose, herbs(name_zh))")
    .order("issued_on", { ascending: false })
    .returns<Row[]>();
  if (error) throw new Error(error.message);
  if (!data.length) return <Empty>还没有药方。点右上角录入，或者直接拍照识别。</Empty>;

  return (
    <div className="space-y-3">
      {data.map((p) => (
        <Link key={p.id} href={`/prescriptions/${p.id}`} className="card block hover:border-cinnabar">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif text-lg font-bold">{p.title || "未命名药方"}</span>
            <span className="shrink-0 text-sm text-muted">{p.issued_on}</span>
          </div>
          <div className="mt-1 text-sm text-muted">
            {p.dose_count} 副 · {p.prescription_items.length} 味
            {p.patient_label && ` · ${p.patient_label}`}
            {p.price_paid != null && ` · ${money(p.price_paid)}`}
          </div>
          <p className="mt-2 line-clamp-2 text-sm">
            {p.prescription_items.map((i) => `${i.herbs?.name_zh} ${Number(i.grams_per_dose)}g`).join("　")}
          </p>
        </Link>
      ))}
    </div>
  );
}
