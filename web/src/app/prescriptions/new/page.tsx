import { Suspense } from "react";
import { pinyin } from "pinyin-pro";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { listHerbAliases, listHerbs } from "@/lib/herbs";
import { Loading, PageHeader } from "@/components/ui";
import { defaultPrescriberId } from "@/lib/prescribers";
import { PrescriptionForm } from "./prescription-form";

export default function NewPrescriptionPage() {
  return (
    <>
      <PageHeader title="新药方" subtitle="拍照让 AI 识别，或者手动一味一味填" />
      <Suspense fallback={<Loading />}>
        <FormLoader />
      </Suspense>
    </>
  );
}

async function FormLoader() {
  const { supabase, workspaceId, workspaceKind } = await getContext();
  if (workspaceKind === "clinic") redirect("/clinic/prescribe"); // 诊所用开方页（选病人、首字母选药）
  const [herbs, aliases, { data: prescribers }, { data: last }] = await Promise.all([
    listHerbs(supabase),
    listHerbAliases(supabase),
    supabase.from("prescribers").select("id, name").eq("workspace_id", workspaceId).order("name"),
    // 默认选上一次用的医生：这个药柜最近一张挂了医生的药方
    supabase
      .from("prescriptions")
      .select("prescriber_id")
      .eq("workspace_id", workspaceId)
      .not("prescriber_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // A–Z 选药要每味药的拼音；用户自己加的药没有拼音，在服务器上算好（浏览器端不需要拼音库）
  const azRows = herbs.map((h) => ({ name_zh: h.name_zh, pinyin: h.pinyin?.trim() || pinyin(h.name_zh, { toneType: "none", type: "string" }) }));
  return (
    <PrescriptionForm
      catalog={{ names: herbs.map((h) => h.name_zh), aliases }}
      azRows={azRows}
      prescribers={prescribers ?? []}
      defaultPrescriber={defaultPrescriberId(prescribers ?? [], last?.prescriber_id ?? null)}
      today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}
    />
  );
}
