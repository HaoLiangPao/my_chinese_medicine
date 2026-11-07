"use server";

import { invalidateAll } from "@/lib/invalidate";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { resolveHerbId } from "@/lib/herbs";
import { parseJsonField, str } from "@/lib/format";
import { mergeBatchInfo, type BatchInfo } from "@/lib/batches";

const optText = z
  .string()
  .trim()
  .max(40, "产地、批号最多 40 个字")
  .optional()
  .transform((v) => (v ? v : null));
const optDate = z
  .string()
  .optional()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "分装日期格式不对")
  .transform((v) => (v ? v : null));
const Items = z
  .array(
    z.object({
      name: z.string().trim().min(1),
      grams: z.coerce.number().positive(),
      price: z.coerce.number().min(0),
      // 批次信息（docs/design/0010 §3.3），可不填
      origin: optText,
      supplier_lot: optText,
      packed_on: optDate,
    }),
  )
  .min(1, "至少要有一行");

export type SaveState = { error?: string };

export async function createPurchase(_prev: SaveState, form: FormData): Promise<SaveState> {
  const { supabase, workspaceId } = await getContext();
  const parsed = Items.safeParse(parseJsonField(form.get("items"), []));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "明细有误" };

  // 店铺：按名字找，没有就建
  let storeId: string | null = null;
  const storeName = str(form.get("store_name"));
  if (storeName) {
    const { data: existing } = await supabase
      .from("stores")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", storeName)
      .maybeSingle();
    if (existing) storeId = existing.id;
    else {
      const kind = String(form.get("store_kind") || "shop");
      const { data: s, error } = await supabase
        .from("stores")
        .insert({ workspace_id: workspaceId, name: storeName, kind: ["clinic", "shop", "online"].includes(kind) ? kind : "shop" })
        .select("id")
        .single();
      if (error) return { error: error.message };
      storeId = s.id;
    }
  }

  // 同一张单子同一味药写了几行 → 合并成一行（数据库里一张单子一味药一行）；批次信息不一样的不能合并
  const merged = new Map<string, { grams: number; price: number } & BatchInfo>();
  for (const it of parsed.data) {
    const id = await resolveHerbId(supabase, it.name);
    const info: BatchInfo = { origin: it.origin, supplier_lot: it.supplier_lot, packed_on: it.packed_on };
    const prev = merged.get(id);
    if (prev) {
      const m = mergeBatchInfo(prev, info);
      if (!m) return { error: `「${it.name.trim()}」写了两行，批次信息不一样。不同批次请分成两次记。` };
      Object.assign(prev, m, { grams: prev.grams + it.grams, price: prev.price + it.price });
    } else merged.set(id, { grams: it.grams, price: it.price, ...info });
  }

  const { data: pu, error } = await supabase
    .from("purchases")
    .insert({
      workspace_id: workspaceId,
      store_id: storeId,
      purchased_on: str(form.get("purchased_on")) ?? undefined,
      notes: str(form.get("notes")),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: itemErr } = await supabase
    .from("purchase_items")
    .insert([...merged.entries()].map(([herb_id, v]) => ({ purchase_id: pu.id, herb_id, ...v })));
  if (itemErr) {
    await supabase.from("purchases").delete().eq("id", pu.id);
    return { error: itemErr.message };
  }

  invalidateAll();
  redirect(`/purchases?saved=${pu.id}`);
}
