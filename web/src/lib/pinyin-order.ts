/**
 * 药材列表按拼音排（FIX-6：不按汉字的 Unicode 编码）。
 * 目录里的药都有拼音（herbs.pinyin）；用户自己加的药没有拼音 → 排在后面，它们之间按中文排序规则（拼音）排。
 */
const zh = new Intl.Collator("zh");

export function byPinyin<T extends { name_zh: string; pinyin: string | null }>(a: T, b: T) {
  if (a.pinyin && b.pinyin) return a.pinyin.localeCompare(b.pinyin) || zh.compare(a.name_zh, b.name_zh);
  if (a.pinyin) return -1;
  if (b.pinyin) return 1;
  return zh.compare(a.name_zh, b.name_zh);
}
