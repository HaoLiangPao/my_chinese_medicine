"use server";

import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { newSeed, pickIndex } from "@/lib/apprentice";

/**
 * 「随便翻一味」（docs/design/0019 §5）：随机打开一味药的详情页。只读，不写数据库，所以不用 invalidateAll()。
 * 范围：mine = 我的药柜 / 库存里现在有的药（包括自己加的）；否则 = 全站目录（有功效分类的，不含用户自己加的药）。
 * 我的药柜是空的 → 退回全站目录。从详情页「再翻一味」时不翻到正在看的这味（current）。
 */
export async function openRandomHerb(form: FormData) {
  const mine = form.get("scope") === "mine";
  const { supabase, workspaceId } = await getContext();
  let ids: string[] = [];
  if (mine) {
    const { data } = await supabase.from("v_inventory").select("herb_id").eq("workspace_id", workspaceId).gt("on_hand_grams", 0);
    ids = (data ?? []).map((r) => r.herb_id as string);
  }
  if (!ids.length) {
    const { data, error } = await supabase.from("herbs").select("id").not("category", "is", null);
    if (error) throw new Error(error.message);
    ids = (data ?? []).map((r) => r.id as string);
  }
  const current = form.get("current");
  if (ids.length > 1) ids = ids.filter((id) => id !== current);
  const i = pickIndex(newSeed(), ids.length);
  redirect(i < 0 ? "/herbs" : `/herbs/${ids[i]}?flip=${mine ? "mine" : "all"}`);
}
