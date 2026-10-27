// 开方用的药材索引：按拼音首字母分组，炮制品挂在原药材下面；支持汉字 / 全拼 / 首字母搜索。纯函数。

export type HerbRow = { id: string; name_zh: string; pinyin: string | null; base_herb_id: string | null };
export type HerbChoice = { id: string; name: string };
export type HerbEntry = { id: string; name: string; pinyin: string; initials: string; variants: HerbChoice[] };
export type HerbIndex = { letters: string[]; groups: Record<string, HerbEntry[]>; entries: HerbEntry[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
export const initialsOf = (pinyin: string) => norm(pinyin).split(" ").filter(Boolean).map((w) => w[0]).join("");
export function letterOf(pinyin: string): string {
  const c = norm(pinyin)[0];
  return c ? c.toUpperCase() : "#";
}

/**
 * 没有拼音的药材用 fallback（服务器端用 pinyin-pro 算）补上。
 * 炮制品（base_herb_id 指向的原药材存在）不单独出现，而是作为原药材的 variants；
 * 原药材不在列表里时，炮制品自己作为一条。
 */
export function buildHerbIndex(rows: HerbRow[], fallbackPinyin: (name: string) => string = () => ""): HerbIndex {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const py = (r: HerbRow) => (r.pinyin && norm(r.pinyin)) || norm(fallbackPinyin(r.name_zh));
  const entries = new Map<string, HerbEntry>();
  for (const r of rows) {
    if (r.base_herb_id && byId.has(r.base_herb_id)) continue;
    const p = py(r);
    entries.set(r.id, { id: r.id, name: r.name_zh, pinyin: p, initials: initialsOf(p), variants: [] });
  }
  for (const r of rows) {
    if (r.base_herb_id && entries.has(r.base_herb_id)) entries.get(r.base_herb_id)!.variants.push({ id: r.id, name: r.name_zh });
  }
  const list = [...entries.values()].sort((a, b) => a.pinyin.localeCompare(b.pinyin) || a.name.localeCompare(b.name, "zh"));
  for (const e of list) e.variants.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const groups: Record<string, HerbEntry[]> = {};
  for (const e of list) (groups[letterOf(e.pinyin)] ??= []).push(e);
  const letters = Object.keys(groups).sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  return { letters, groups, entries: list };
}

/**
 * 搜索：汉字包含（也搜炮制品名）/ 全拼前缀（忽略空格）/ 拼音首字母前缀（hq → 黄芪）。
 * 汉字完全匹配的排最前。
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
    else if (names.some((n) => n.includes(q))) score = 1;
    else if (isLatin && e.pinyin.replace(/ /g, "").startsWith(ql)) score = 2;
    else if (isLatin && e.initials.startsWith(ql)) score = 3;
    if (score >= 0) scored.push([score, e]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].pinyin.localeCompare(b[1].pinyin)).slice(0, limit).map((x) => x[1]);
}
