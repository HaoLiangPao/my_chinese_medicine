"use server";

import { invalidateAll } from "@/lib/invalidate";
import { getContext } from "@/lib/auth";
import { resolveHerbId } from "@/lib/herbs";
import { num, str } from "@/lib/format";

/** 把某味药的库存校准到「实际称重」的克数：写一条差额流水 */
export async function adjustInventory(form: FormData) {
  const { supabase, workspaceId } = await getContext();
  const actual = num(form.get("actual"));
  if (actual === null || actual < 0) return;

  const herbName = str(form.get("herb_name"));
  const herbId = herbName ? await resolveHerbId(supabase, herbName) : String(form.get("herb_id"));

  const { data } = await supabase.from("v_inventory").select("on_hand_grams").eq("herb_id", herbId).maybeSingle();
  const delta = actual - Number(data?.on_hand_grams ?? 0);
  if (delta === 0) return;

  const { error } = await supabase.from("inventory_txns").insert({
    workspace_id: workspaceId,
    herb_id: herbId,
    delta_grams: delta,
    kind: "adjust",
    note: herbName ? "盘点录入" : "称重校准",
  });
  if (error) throw new Error(error.message);
  invalidateAll();
}

export async function savePantrySettings(form: FormData) {
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("pantry_settings").upsert({
    workspace_id: workspaceId,
    herb_id: String(form.get("herb_id")),
    jar_label: str(form.get("jar_label")),
    low_stock_grams: num(form.get("low_stock_grams")),
  });
  if (error) throw new Error(error.message);
  invalidateAll();
}
