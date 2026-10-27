import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { listHerbs } from "@/lib/herbs";
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
  const { supabase } = await getContext();
  const herbs = await listHerbs(supabase);
  return <PrescriptionForm herbNames={herbs.map((h) => h.name_zh)} today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })} />;
}
