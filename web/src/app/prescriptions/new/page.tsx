import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { listHerbAliases, listHerbs } from "@/lib/herbs";
import { Loading, PageHeader } from "@/components/ui";
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
  const { supabase, workspaceKind } = await getContext();
  if (workspaceKind === "clinic") redirect("/clinic/prescribe"); // 诊所用开方页（选病人、首字母选药）
  const [herbs, aliases] = await Promise.all([listHerbs(supabase), listHerbAliases(supabase)]);
  return <PrescriptionForm catalog={{ names: herbs.map((h) => h.name_zh), aliases }} today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })} />;
}
