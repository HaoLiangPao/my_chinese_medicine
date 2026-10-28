import { Suspense } from "react";
import { pinyin } from "pinyin-pro";
import { getContext } from "@/lib/auth";
import { listHerbs } from "@/lib/herbs";
import { buildHerbIndex } from "@/lib/herb-index";
import { Loading, PageHeader } from "@/components/ui";
import { CreateClinicForm } from "../create-clinic-form";
import { PrescribeForm } from "./prescribe-form";
import type { Patient } from "../actions";

export default function PrescribePage({ searchParams }: PageProps<"/clinic/prescribe">) {
  return (
    <>
      <PageHeader title="开方" subtitle="选病人 → 按首字母选药 → 克数、脚注、备注 → 生成发给病人的消息" />
      <Suspense fallback={<Loading />}>
        <Loader searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Loader({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, workspaceId, workspaceKind, workspaceName } = await getContext();
  if (workspaceKind !== "clinic") return <CreateClinicForm />;

  const sp = await searchParams;
  const patientId = typeof sp.patient === "string" ? sp.patient : null;
  const [herbs, { data: prices }, { data: pre }] = await Promise.all([
    listHerbs(supabase),
    supabase.from("v_herb_price_summary").select("herb_id, min_ppg, avg_cost_per_gram").eq("workspace_id", workspaceId),
    patientId
      ? supabase.from("patients").select("id, name, phone, notes").eq("workspace_id", workspaceId).eq("id", patientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // 没有拼音的药材（用户新加的）在服务器端补上，不把拼音库打包到浏览器
  const index = buildHerbIndex(herbs, (name) => pinyin(name, { toneType: "none", type: "string" }));
  // 成本用诊所各店最低进货价；只有赠品/没进过货的药没有价格
  const ppg: Record<string, number> = {};
  for (const p of prices ?? []) {
    const v = p.min_ppg ?? p.avg_cost_per_gram;
    if (v !== null && v !== undefined) ppg[p.herb_id] = Number(v);
  }

  return (
    <PrescribeForm
      index={index}
      pricePerGram={ppg}
      clinicName={workspaceName}
      initialPatient={(pre as Patient | null) ?? null}
      today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}
    />
  );
}
