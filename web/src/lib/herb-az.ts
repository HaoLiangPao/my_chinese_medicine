/**
 * 家庭录方的 A–Z 通讯录式选药（RX-5）。纯函数。
 *
 * 和诊所开方的首字母索引（herb-index.ts）不同：这里**按药名本身的第一个字归类**，炮制品单独成一条
 * （炙甘草在 Z、法半夏在 F），不挂在原药材下面。
 * 拼音由服务器准备好再传进来（没有拼音的药在服务器上用 pinyin-pro 算），浏览器端不需要拼音库。
 */

import { initialsOf, letterOf, normPinyin } from "./herb-index";

export type AzRow = { name_zh: string; pinyin: string };
export type AzEntry = { name: string; pinyin: string; initials: string; letter: string; aliases: string[] };
export type AzIndex = { letters: string[]; groups: Record<string, AzEntry[]>; entries: AzEntry[] };
export type AzHit = { entry: AzEntry; via: string | null }; // via：通过哪个别名找到的

/** aliases：别名 → 标准名（和 herb-match 的 HerbCatalog.aliases 一样） */
export function buildAzIndex(rows: AzRow[], aliases: Record<string, string> = {}): AzIndex {
  const aliasesOf = new Map<string, string[]>();
  for (const [alias, name] of Object.entries(aliases)) aliasesOf.set(name, [...(aliasesOf.get(name) ?? []), alias]);
  const entries = rows
    .map((r) => {
      const p = normPinyin(r.pinyin);
      return {
        name: r.name_zh,
        pinyin: p,
        initials: initialsOf(p),
        letter: letterOf(p),
        aliases: (aliasesOf.get(r.name_zh) ?? []).sort((a, b) => a.localeCompare(b, "zh")),
      };
    })
    .sort((a, b) => a.pinyin.localeCompare(b.pinyin) || a.name.localeCompare(b.name, "zh"));
  const groups: Record<string, AzEntry[]> = {};
  for (const e of entries) (groups[e.letter] ??= []).push(e);
  const letters = Object.keys(groups).sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  return { letters, groups, entries };
}

/**
 * 搜索：药名完全一样 > 别名完全一样 > 药名包含 > 别名包含 > 全拼前缀（忽略空格）> 首字母前缀（hq → 黄芪、黄芩）。
 * 通过别名找到的，via 是那个别名（页面上显示「北芪 → 黄芪」）。
 */
export function searchAz(index: AzIndex, query: string, limit = 30): AzHit[] {
  const q = query.trim();
  if (!q) return [];
  const ql = q.toLowerCase().replace(/\s+/g, "");
  const latin = /^[a-z]+$/.test(ql);
  const scored: [number, AzHit][] = [];
  for (const e of index.entries) {
    let hit: [number, string | null] | null = null;
    if (e.name === q) hit = [0, null];
    else if (e.aliases.includes(q)) hit = [1, q];
    else if (e.name.includes(q)) hit = [2, null];
    else if (e.aliases.some((a) => a.includes(q))) hit = [3, e.aliases.find((a) => a.includes(q))!];
    else if (latin && e.pinyin.replace(/ /g, "").startsWith(ql)) hit = [4, null];
    else if (latin && e.initials.startsWith(ql)) hit = [5, null];
    if (hit) scored.push([hit[0], { entry: e, via: hit[1] }]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].entry.pinyin.localeCompare(b[1].entry.pinyin))
    .slice(0, limit)
    .map((x) => x[1]);
}
