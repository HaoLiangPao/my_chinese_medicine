import { getContext } from "@/lib/auth";
import { termsFor } from "@/lib/terms";
import { herbLines, newSeed, pickAction, shuffle } from "@/lib/apprentice";
import type { Monograph } from "@/lib/herb-monograph";
import { ApprenticeTalk } from "./talk";
import { RandomHerbForm } from "./random-herb";

/**
 * 药材详情页的小学徒（docs/design/0019 §5）：随机一个动作，说一句这味药的知识；下面「再翻一味」。
 * 每次打开在服务端随机（种子），台词顺序在服务端洗好再交给浏览器。
 */
export async function HerbApprentice({
  herb,
  monograph,
}: {
  herb: {
    id: string;
    name_zh: string;
    pinyin: string | null;
    category: string | null;
    base: { id: string; name_zh: string } | null;
    herb_aliases: { alias: string }[];
  };
  monograph: { data: Monograph; fromBase: boolean } | null;
}) {
  const { supabase, accountKind } = await getContext();
  const [{ data: variants }, { data: sameCategory }] = await Promise.all([
    supabase.from("herbs").select("name_zh").eq("base_herb_id", herb.id).order("pinyin"),
    herb.category
      ? supabase.from("herbs").select("name_zh").eq("category", herb.category).is("base_herb_id", null).neq("id", herb.id).order("pinyin")
      : Promise.resolve({ data: [] as { name_zh: string }[] }),
  ]);
  const seed = newSeed();
  const lines = herbLines({
    name: herb.name_zh,
    pinyin: herb.pinyin,
    category: herb.category,
    aliases: herb.herb_aliases.map((a) => a.alias),
    base: herb.base?.name_zh ?? null,
    variants: (variants ?? []).map((v) => v.name_zh),
    sameCategory: shuffle(
      (sameCategory ?? []).map((v) => v.name_zh),
      seed + 2,
    ),
    monograph,
  });
  return (
    <ApprenticeTalk action={pickAction(seed)} lines={shuffle(lines, seed + 1)}>
      <RandomHerbForm stock={termsFor(accountKind).stock} currentHerbId={herb.id} />
    </ApprenticeTalk>
  );
}
