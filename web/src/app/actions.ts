"use server";

import { invalidateAll } from "@/lib/invalidate";
import { getContext } from "@/lib/auth";
import { str } from "@/lib/format";

export type MemberState = { error?: string; ok?: string };

export async function addMember(_prev: MemberState, form: FormData): Promise<MemberState> {
  const { supabase, workspaceId } = await getContext();
  const email = str(form.get("email"));
  if (!email) return { error: "请输入邮箱" };
  const { error } = await supabase.rpc("add_member_by_email", { ws: workspaceId, member_email: email });
  if (error) return { error: error.message };
  invalidateAll();
  return { ok: `已添加 ${email}` };
}
