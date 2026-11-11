"use server";

import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { invalidateAll } from "@/lib/invalidate";
import { str } from "@/lib/format";

/** 预设药方的管理（docs/design/0013 §3.3、§3.4）。权限靠 RLS（按药柜）和「只有诊所能建」的触发器 */

export type TemplateState = { error?: string; ok?: string };

/** 只有诊所账号能管预设药方（数据库里还有触发器和 RLS 兜底） */
async function clinicContext() {
  const ctx = await getContext();
  if (ctx.accountKind !== "clinic") throw new Error("只有诊所账号可以管理预设药方");
  return ctx;
}

const nameError = (name: string | null) => (!name ? "请给预设药方起个名字" : name.length > 40 ? "预设药方的名字最多 40 个字" : null);
const dupMessage = (msg: string, name: string) => (msg.includes("duplicate key") ? `已经有叫「${name}」的预设药方了，换个名字` : msg);

export async function renameTemplate(_prev: TemplateState, form: FormData): Promise<TemplateState> {
  const { supabase } = await clinicContext();
  const id = String(form.get("id") ?? "");
  const name = str(form.get("name"));
  const bad = nameError(name);
  if (bad) return { error: bad };
  const { error } = await supabase.from("prescription_templates").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: dupMessage(error.message, name!) };
  invalidateAll();
  return { ok: "改好了" };
}

export async function deleteTemplate(form: FormData) {
  const { supabase } = await clinicContext();
  const { error } = await supabase
    .from("prescription_templates")
    .delete()
    .eq("id", String(form.get("id") ?? ""));
  if (error) throw new Error(error.message);
  invalidateAll();
  redirect("/clinic/templates?deleted=1");
}

/** 处方详情页「存成预设药方」：把这张处方的药材、剂数、煎服法、医嘱存成一个新的预设 */
export async function saveTemplateFromPrescription(_prev: TemplateState, form: FormData): Promise<TemplateState> {
  const { supabase, workspaceId } = await clinicContext();
  const rxId = String(form.get("prescription_id") ?? "");
  const name = str(form.get("name"));
  const bad = nameError(name);
  if (bad) return { error: bad };
  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, dose_count, instructions, notes, prescription_items(herb_id, grams_per_dose, special_prep, note, sort_order)")
    .eq("id", rxId)
    .eq("workspace_id", workspaceId)
    .maybeSingle<{
      id: string;
      dose_count: number;
      instructions: string | null;
      notes: string | null;
      prescription_items: {
        herb_id: string;
        grams_per_dose: number;
        special_prep: string | null;
        note: string | null;
        sort_order: number;
      }[];
    }>();
  if (!rx || !rx.prescription_items.length) return { error: "找不到这张处方" };
  const { error } = await supabase.rpc("create_prescription_template", {
    p_workspace_id: workspaceId,
    p_name: name,
    p_doses: rx.dose_count,
    p_instructions: rx.instructions,
    p_notes: rx.notes,
    p_lines: [...rx.prescription_items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ herb_id: i.herb_id, grams: i.grams_per_dose, prep: i.special_prep, note: i.note })),
  });
  if (error) return { error: error.message };
  invalidateAll();
  return { ok: `已存成预设药方「${name}」` };
}
