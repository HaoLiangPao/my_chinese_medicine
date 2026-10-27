"use server";

import { invalidateAll } from "@/lib/invalidate";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { resolveHerbId } from "@/lib/herbs";
import { num, str, SPECIAL_PREPS } from "@/lib/format";
import { buildOverrides, cleanExtras, plannedGrams, type PlanItem } from "@/lib/decoction";

const Items = z
  .array(
    z.object({
      name: z.string().trim().min(1),
      grams: z.coerce.number().positive(),
      prep: z.enum(SPECIAL_PREPS).nullable().optional(),
      raw: z.string().nullable().optional(),
    }),
  )
  .min(1, "至少要有一味药");

export type SaveState = { error?: string };

export async function createPrescription(_prev: SaveState, form: FormData): Promise<SaveState> {
  const { supabase, workspaceId } = await getContext();

  const parsed = Items.safeParse(JSON.parse(String(form.get("items") ?? "[]")));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "药材列表有误" };

  // 同一味药出现两次就合并克数
  const merged = new Map<string, { grams: number; prep: string | null; raw: string | null; order: number }>();
  let order = 0;
  for (const it of parsed.data) {
    const herbId = await resolveHerbId(supabase, it.name);
    const prev = merged.get(herbId);
    if (prev) prev.grams += it.grams;
    else merged.set(herbId, { grams: it.grams, prep: it.prep ?? null, raw: it.raw ?? it.name, order: order++ });
  }

  const { data: rx, error } = await supabase
    .from("prescriptions")
    .insert({
      workspace_id: workspaceId,
      title: str(form.get("title")),
      prescriber: str(form.get("prescriber")) ?? "李医生",
      patient_label: str(form.get("patient_label")),
      issued_on: str(form.get("issued_on")) ?? undefined,
      dose_count: num(form.get("dose_count")) ?? 1,
      instructions: str(form.get("instructions")),
      price_paid: num(form.get("price_paid")),
      photo_path: str(form.get("photo_path")),
      source: str(form.get("photo_path")) ? "photo" : "manual",
      notes: str(form.get("notes")),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: itemErr } = await supabase.from("prescription_items").insert(
    [...merged.entries()].map(([herb_id, v]) => ({
      prescription_id: rx.id,
      herb_id,
      grams_per_dose: v.grams,
      special_prep: v.prep,
      raw_name: v.raw,
      sort_order: v.order,
    })),
  );
  if (itemErr) {
    await supabase.from("prescriptions").delete().eq("id", rx.id);
    return { error: itemErr.message };
  }

  invalidateAll();
  redirect(`/prescriptions/${rx.id}`);
}

export async function deletePrescription(form: FormData) {
  const { supabase } = await getContext();
  const id = String(form.get("id"));
  const { data } = await supabase.from("prescriptions").select("photo_path").eq("id", id).single();
  await supabase.from("prescriptions").delete().eq("id", id);
  if (data?.photo_path) await supabase.storage.from("prescription-photos").remove([data.photo_path]);
  invalidateAll();
  redirect(`/prescriptions?deleted=${id}`);
}

/**
 * 记一次煎药（从家里药柜取药）。表单字段：
 *   id, doses, note,
 *   actual  = JSON {herb_id: 实际总克数}（只填了的才有）
 *   extras  = JSON [{name, grams}] 处方外临时加的药
 */
export async function recordDecoction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const { supabase } = await getContext();
  const id = String(form.get("id"));
  const doses = num(form.get("doses"));
  if (!doses || doses <= 0 || !Number.isInteger(doses)) return { error: "副数必须是正整数" };

  const { data: items, error: itemsErr } = await supabase
    .from("prescription_items")
    .select("herb_id, grams_per_dose, herbs(name_zh)")
    .eq("prescription_id", id)
    .overrideTypes<{ herb_id: string; grams_per_dose: number; herbs: { name_zh: string } | null }[], { merge: false }>();
  if (itemsErr) return { error: itemsErr.message };

  const plan: PlanItem[] = (items ?? []).map((i) => ({
    herb_id: i.herb_id,
    name: i.herbs?.name_zh ?? "",
    grams_per_dose: Number(i.grams_per_dose),
  }));
  const { overrides, invalid } = buildOverrides(plan, doses, JSON.parse(String(form.get("actual") || "{}")));
  if (invalid.length) return { error: `这些药的克数不对：${invalid.join("、")}` };

  // 合并：处方内的覆盖值 + 处方外加的药（如果加的药其实在处方里，就叠加到它的实际量上）
  const final = new Map<string, number>(overrides.map((o) => [o.herb_id, o.grams]));
  for (const e of cleanExtras(JSON.parse(String(form.get("extras") || "[]")))) {
    const herbId = await resolveHerbId(supabase, e.name);
    const p = plan.find((x) => x.herb_id === herbId);
    const base = final.get(herbId) ?? (p ? plannedGrams(p, doses) : 0);
    final.set(herbId, base + e.grams);
  }

  const { error } = await supabase.rpc("record_decoction", {
    p_prescription_id: id,
    p_doses: doses,
    p_actual: [...final.entries()].map(([herb_id, grams]) => ({ herb_id, grams })),
    p_note: str(form.get("note")),
  });
  if (error) return { error: error.message };
  invalidateAll();
  return {};
}

/** 撤销一次煎药：删除 decoction，对应的库存流水级联删除 */
export async function deleteDecoction(form: FormData) {
  const { supabase } = await getContext();
  const decId = String(form.get("decoction_id"));
  const { error } = await supabase.from("decoctions").delete().eq("id", decId);
  if (error) throw new Error(error.message);
  invalidateAll();
}

/** 修改在诊所实付的金额（空 = 清除） */
export async function setPricePaid(form: FormData) {
  const { supabase } = await getContext();
  const price = num(form.get("price_paid"));
  if (price !== null && price < 0) return;
  const { error } = await supabase.from("prescriptions").update({ price_paid: price }).eq("id", String(form.get("id")));
  if (error) throw new Error(error.message);
  invalidateAll();
}
