"use server";

import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { newSeed, pickIndex } from "@/lib/apprentice";

/**
 * 「随便翻一味」（docs/design/0019 §5）：随机打开一味药的详情页。只读，不写数据库，所以不用 invalidateAll()。
 * 范围：mine = 我的药柜 / 库存里现在有的药（包括自己加的）；否则 = 全站目录（有功效分类的，不含用户自己加的药）。
 * 从详情页「再翻一味」时不翻到正在看的这味（current）。
 * 药柜里除了正在看的这味就没有别的了（或者是空的）→ 退回全站目录；地址里的 ?flip= 写实际用的范围。
 */
export async function openRandomHerb(form: FormData) {
  const current = form.get("current");
  const { supabase, workspaceId } = await getContext();
  const others = (ids: string[]) => ids.filter((id) => id !== current);
  let scope: "mine" | "all" = "all";
  let ids: string[] = [];
  if (form.get("scope") === "mine") {
    const { data } = await supabase.from("v_inventory").select("herb_id").eq("workspace_id", workspaceId).gt("on_hand_grams", 0);
    ids = others((data ?? []).map((r) => r.herb_id as string));
    if (ids.length) scope = "mine";
  }
  if (!ids.length) {
    const { data, error } = await supabase.from("herbs").select("id").not("category", "is", null);
    if (error) throw new Error(error.message);
    ids = others((data ?? []).map((r) => r.id as string));
  }
  const i = pickIndex(newSeed(), ids.length);
  redirect(i < 0 ? "/herbs" : `/herbs/${ids[i]}?flip=${scope}`);
}
