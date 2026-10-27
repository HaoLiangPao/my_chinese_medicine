import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { listHerbs } from "@/lib/herbs";
import { Loading, PageHeader } from "@/components/ui";
import { PurchaseForm } from "./purchase-form";

export default function NewPurchasePage() {
  return (
    <>
      <PageHeader title="记一笔采购" subtitle="买进来的药材会自动加到药柜里" />
      <Suspense fallback={<Loading />}>
        <Loader />
      </Suspense>
    </>
  );
}

async function Loader() {
  const { supabase, workspaceId } = await getContext();
  const [herbs, { data: stores }] = await Promise.all([
    listHerbs(supabase),
    supabase.from("stores").select("name").eq("workspace_id", workspaceId).order("name"),
  ]);
  return (
    <PurchaseForm
      herbNames={herbs.map((h) => h.name_zh)}
      storeNames={(stores ?? []).map((s) => s.name)}
      today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}
    />
  );
}
