"use server";

import { invalidateAll } from "@/lib/invalidate";
import { getContext } from "@/lib/auth";
import { str } from "@/lib/format";

export type InviteState = { error?: string; ok?: string };

/** 邀请家人。不管对方有没有注册，提示都一样（不泄露邮箱是否注册）。 */
export async function inviteMember(_prev: InviteState, form: FormData): Promise<InviteState> {
  const { supabase, workspaceId } = await getContext();
  const email = str(form.get("email"));
  if (!email) return { error: "请输入邮箱" };
  const { error } = await supabase.rpc("invite_member", { ws: workspaceId, member_email: email });
  if (error) return { error: error.message };
  invalidateAll();
  return { ok: `已邀请 ${email.toLowerCase()}。对方用这个邮箱登录后，在总览页点「接受」就加入了。` };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { supabase } = await getContext();
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  invalidateAll();
}

export async function revokeInvitation(form: FormData) {
  await rpc("revoke_invitation", { inv: String(form.get("id")) });
}
export async function acceptInvitation(form: FormData) {
  await rpc("accept_invitation", { inv: String(form.get("id")) });
}
export async function declineInvitation(form: FormData) {
  await rpc("decline_invitation", { inv: String(form.get("id")) });
}
export async function leaveWorkspace(form: FormData) {
  await rpc("leave_workspace", { ws: String(form.get("workspace_id")) });
}
export async function removeMember(form: FormData) {
  const { workspaceId } = await getContext();
  await rpc("remove_member", { ws: workspaceId, member: String(form.get("user_id")) });
}
export async function switchWorkspace(form: FormData) {
  await rpc("set_active_workspace", { ws: String(form.get("workspace_id")) });
}
