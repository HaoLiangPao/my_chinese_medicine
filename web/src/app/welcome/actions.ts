"use server";

import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/auth";
import { str } from "@/lib/format";
import { invalidateAll } from "@/lib/invalidate";
import { isAccountKind } from "@/lib/terms";

export type WelcomeState = { error?: string };

export async function chooseAccountKind(_prev: WelcomeState, form: FormData): Promise<WelcomeState> {
  const { supabase } = await getSignedInUser();
  const kind = form.get("account_kind");
  if (!isAccountKind(kind)) return { error: "请选择：你是病人还是医生" };
  const { error } = await supabase.rpc("choose_account_kind", { p_kind: kind, clinic_name: str(form.get("clinic_name")) ?? null });
  if (error) return { error: error.message };
  invalidateAll();
  redirect(kind === "clinic" ? "/clinic/prescribe" : "/");
}
