// 开方用的药材索引：按拼音首字母分组，炮制品挂在原药材下面；支持汉字 / 全拼 / 首字母 / 别名搜索。纯函数。

export type HerbRow = { id: string; name_zh: string; pinyin: string | null; base_herb_id: string | null };
export type HerbChoice = { id: string; name: string };
/** 别名指向的药：原药材自己，或者它的某个炮制品（「炙麻黄」→ 蜜麻黄） */
export type HerbAlias = { alias: string; id: string; name: string };
export type HerbEntry = { id: string; name: string; pinyin: string; initials: string; variants: HerbChoice[]; aliases: HerbAlias[] };
export type HerbIndex = { letters: string[]; groups: Record<string, HerbEntry[]>; entries: HerbEntry[] };

/** 拼音标准化：小写、ü（带不带声调）写成 v（pinyin-pro 现算的拼音带 ü，目录里存的是 v，如 nv zhen zi）、去掉声调、只留字母和空格 */
export const normPinyin = (s: string) =>
  s
    .toLowerCase()
    .replace(/[üǖǘǚǜ]/g, "v")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // 去掉声调（ā → a）
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const norm = normPinyin;
export const initialsOf = (pinyin: string) =>
  norm(pinyin)
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
export function letterOf(pinyin: string): string {
  const c = norm(pinyin)[0];
  return c ? c.toUpperCase() : "#";
}

/**
 * 没有拼音的药材用 fallback（服务器端用 pinyin-pro 算）补上。
 * 炮制品（base_herb_id 指向的原药材存在）不单独出现，而是作为原药材的 variants；
 * 原药材不在列表里时，炮制品自己作为一条。
 * aliases：别名 → 标准名（listHerbAliases 的结果）；挂在原药材那一条上（指向炮制品的也是）。
 */
export function buildHerbIndex(
  rows: HerbRow[],
  fallbackPinyin: (name: string) => string = () => "",
  aliases: Record<string, string> = {},
): HerbIndex {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const py = (r: HerbRow) => (r.pinyin && norm(r.pinyin)) || norm(fallbackPinyin(r.name_zh));
  const entries = new Map<string, HerbEntry>();
  for (const r of rows) {
    if (r.base_herb_id && byId.has(r.base_herb_id)) continue;
    const p = py(r);
    entries.set(r.id, { id: r.id, name: r.name_zh, pinyin: p, initials: initialsOf(p), variants: [], aliases: [] });
  }
  for (const r of rows) {
    if (r.base_herb_id && entries.has(r.base_herb_id)) entries.get(r.base_herb_id)!.variants.push({ id: r.id, name: r.name_zh });
  }
  const byName = new Map(rows.map((r) => [r.name_zh, r]));
  for (const [alias, name] of Object.entries(aliases)) {
    const r = byName.get(name);
    const entry = r && (entries.get(r.id) ?? (r.base_herb_id ? entries.get(r.base_herb_id) : undefined));
    if (entry) entry.aliases.push({ alias, id: r.id, name: r.name_zh });
  }
  const list = [...entries.values()].sort((a, b) => a.pinyin.localeCompare(b.pinyin) || a.name.localeCompare(b.name, "zh"));
  for (const e of list) {
    e.variants.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    e.aliases.sort((a, b) => a.alias.localeCompare(b.alias, "zh"));
  }
  const groups: Record<string, HerbEntry[]> = {};
  for (const e of list) (groups[letterOf(e.pinyin)] ??= []).push(e);
  const letters = Object.keys(groups).sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  return { letters, groups, entries: list };
}

/**
 * 搜索：药名完全一样 > 别名完全一样 > 药名包含（也搜炮制品名）> 别名包含 > 全拼前缀（忽略空格）> 拼音首字母前缀（hq → 黄芪）。
 */
export function searchHerbs(index: HerbIndex, query: string, limit = 20): HerbEntry[] {
  const q = query.trim();
  if (!q) return [];
  const ql = q.toLowerCase().replace(/\s+/g, "");
  const isLatin = /^[a-z]+$/.test(ql);
  const scored: [number, HerbEntry][] = [];
  for (const e of index.entries) {
    const names = [e.name, ...e.variants.map((v) => v.name)];
    let score = -1;
    if (names.includes(q)) score = 0;
    else if (e.aliases.some((a) => a.alias === q)) score = 1;
    else if (names.some((n) => n.includes(q))) score = 2;
    else if (e.aliases.some((a) => a.alias.includes(q))) score = 3;
    else if (isLatin && e.pinyin.replace(/ /g, "").startsWith(ql)) score = 4;
    else if (isLatin && e.initials.startsWith(ql)) score = 5;
    if (score >= 0) scored.push([score, e]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].pinyin.localeCompare(b[1].pinyin))
    .slice(0, limit)
    .map((x) => x[1]);
}

/**
 * 这一条是不是通过别名搜到的（药名、炮制品名都不含搜索词）：返回那个别名（完全一样的优先），页面上显示「元胡 → 延胡索」。
 */
export function aliasHit(entry: HerbEntry, query: string): HerbAlias | null {
  const q = query.trim();
  if (!q || [entry.name, ...entry.variants.map((v) => v.name)].some((n) => n.includes(q))) return null;
  return entry.aliases.find((a) => a.alias === q) ?? entry.aliases.find((a) => a.alias.includes(q)) ?? null;
}

/**
 * 搜索框里要不要显示「＋ 新增『…』」：
 * - 只接受汉字药名（搜「bx」这种拼音缩写时不能新增一味叫 bx 的药）；
 * - 结果里已经有同名的药、同名的炮制品（搜「法半夏」时结果是带炮制品的「半夏」），或者搜的正好是别名（「元胡」），就不提示。
 */
export function canAddHerb(query: string, results: HerbEntry[]): boolean {
  const q = query.trim();
  if (!/^[㐀-鿿]+$/.test(q)) return false;
  return !results.some((e) => e.name === q || e.variants.some((v) => v.name === q) || e.aliases.some((a) => a.alias === q));
}
