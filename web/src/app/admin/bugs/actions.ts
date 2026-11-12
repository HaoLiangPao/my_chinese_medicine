"use server";

import { invalidateAll } from "@/lib/invalidate";
import { requireAdmin } from "../admin";

const BUG_STATUSES = ["new", "in_progress", "fixed", "wontfix"] as const;

/** 改一条反馈的状态（只有管理员；数据库函数里还会再查一次） */
export async function setBugStatus(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!(BUG_STATUSES as readonly string[]).includes(status)) throw new Error("状态不对");
  const { error } = await supabase.rpc("admin_set_bug_status", { p_id: id, p_status: status });
  if (error) throw new Error(error.message);
  invalidateAll();
}
