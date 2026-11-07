import { pinyin } from "pinyin-pro";

/**
 * 药材列表按拼音排（FIX-6：不按汉字的 Unicode 编码）。
 * 目录里的药用 herbs.pinyin；用户自己加的药没有拼音，用 pinyin-pro 现算（和开方页的首字母索引一样），一起按拼音排。
 */
const zh = new Intl.Collator("zh");
const keyOf = (h: { name_zh: string; pinyin: string | null }) =>
  (h.pinyin?.trim() || pinyin(h.name_zh, { toneType: "none" })).toLowerCase();

export function byPinyin<T extends { name_zh: string; pinyin: string | null }>(a: T, b: T) {
  return keyOf(a).localeCompare(keyOf(b)) || zh.compare(a.name_zh, b.name_zh);
}
