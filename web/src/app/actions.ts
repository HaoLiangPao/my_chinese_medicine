"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/auth";
import { str } from "@/lib/format";

export async function addMember(form: FormData) {
  const { supabase, workspaceId } = await getContext();
  const email = str(form.get("email"));
  if (!email) return;
  const { error } = await supabase.rpc("add_member_by_email", { ws: workspaceId, member_email: email });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
