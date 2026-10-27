"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { resolveHerbId } from "@/lib/herbs";
import { num, str, SPECIAL_PREPS } from "@/lib/format";

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
    else merged.set(herbId, { grams: it.grams, prep: it.prep ?? null, raw: it.raw ?? null, order: order++ });
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

  revalidatePath("/prescriptions");
  redirect(`/prescriptions/${rx.id}`);
}

export async function deletePrescription(form: FormData) {
  const { supabase } = await getContext();
  const id = String(form.get("id"));
  const { data } = await supabase.from("prescriptions").select("photo_path").eq("id", id).single();
  await supabase.from("prescriptions").delete().eq("id", id);
  if (data?.photo_path) await supabase.storage.from("prescription-photos").remove([data.photo_path]);
  revalidatePath("/prescriptions");
  redirect("/prescriptions");
}

/** 用家里药柜的药材配 N 副：扣库存 */
export async function consumePrescription(form: FormData) {
  const { supabase } = await getContext();
  const id = String(form.get("id"));
  const doses = num(form.get("doses"));
  const { error } = await supabase.rpc("consume_prescription", { p_id: id, p_doses: doses });
  if (error) throw new Error(error.message);
  revalidatePath(`/prescriptions/${id}`);
  revalidatePath("/inventory");
}
