import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { byPinyin } from "@/lib/herb-monograph";

export type ReviewRow = {
  herb_id: string;
  name_zh: string;
  pinyin: string | null;
  status: "draft" | "reviewed";
  check_note: string | null;
  flag_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

/** 核对页的列表：所有有资料的药，按拼音排 */
export async function listForReview(supabase: SupabaseClient): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from("herb_monographs")
    .select("herb_id, status, check_note, flag_note, reviewed_by, reviewed_at, herbs!inner(name_zh, pinyin)")
    .returns<(Omit<ReviewRow, "name_zh" | "pinyin"> & { herbs: { name_zh: string; pinyin: string | null } })[]>();
  if (error) throw new Error(error.message);
  return data.map(({ herbs, ...m }) => ({ ...m, name_zh: herbs.name_zh, pinyin: herbs.pinyin })).sort(byPinyin);
}
