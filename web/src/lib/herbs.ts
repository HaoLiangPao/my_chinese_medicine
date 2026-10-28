import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Herb = { id: string; name_zh: string; pinyin: string | null; category: string | null; base_herb_id: string | null };

export async function listHerbs(supabase: SupabaseClient): Promise<Herb[]> {
  const { data, error } = await supabase
    .from("herbs")
    .select("id, name_zh, pinyin, category, base_herb_id")
    .order("pinyin", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** 别名 → 标准名，例如 { 北芪: "黄芪" }（录入时在浏览器里判断能不能对上目录） */
export async function listHerbAliases(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("herb_aliases").select("alias, herbs(name_zh)");
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as unknown as { alias: string; herbs: { name_zh: string } | null }[]) {
    if (r.herbs) out[r.alias] = r.herbs.name_zh;
  }
  return out;
}

/** 名字 → herb_id（标准名或别名）；找不到就新建一味药。 */
export async function resolveHerbId(supabase: SupabaseClient, rawName: string): Promise<string> {
  const name = rawName.trim();
  if (!name) throw new Error("药名不能为空");

  const { data: matched, error } = await supabase.rpc("match_herb", { raw_name: name });
  if (error) throw new Error(error.message);
  if (matched) return matched as string;

  const { data: created, error: insErr } = await supabase
    .from("herbs")
    .insert({ name_zh: name })
    .select("id")
    .single();
  if (insErr) throw new Error(`新增药材「${name}」失败：${insErr.message}`);
  return created.id;
}

/** 批量匹配：返回 name → 是否已在目录里（照片识别后提示哪些是新药材）。 */
export async function matchNames(supabase: SupabaseClient, names: string[]) {
  const result: Record<string, string | null> = {};
  await Promise.all(
    names.map(async (n) => {
      const { data } = await supabase.rpc("match_herb", { raw_name: n });
      result[n] = (data as string | null) ?? null;
    }),
  );
  return result;
}
