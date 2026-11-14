/**
 * 药材目录按功效分类分组（/herbs 页面）。分类按《中药学》教材的顺序（docs/design/0017）；
 * 没有分类的（用户自己加的药）放在最后的「其他」。组内顺序不变（调用方先按拼音排好）。纯函数。
 */
export const HERB_CATEGORIES = [
  "解表药",
  "清热药",
  "泻下药",
  "祛风湿药",
  "化湿药",
  "利水渗湿药",
  "温里药",
  "理气药",
  "消食药",
  "驱虫药",
  "止血药",
  "活血化瘀药",
  "化痰止咳平喘药",
  "安神药",
  "平肝息风药",
  "开窍药",
  "补气药",
  "补血药",
  "补阴药",
  "补阳药",
  "收涩药",
  "涌吐药",
  "攻毒杀虫止痒药",
  "拔毒化腐生肌药",
] as const;

export const OTHER_CATEGORY = "其他";

export function groupByCategory<T extends { category: string | null }>(herbs: T[]): { category: string; herbs: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const h of herbs) {
    const c = h.category && (HERB_CATEGORIES as readonly string[]).includes(h.category) ? h.category : OTHER_CATEGORY;
    groups.set(c, [...(groups.get(c) ?? []), h]);
  }
  return [...HERB_CATEGORIES, OTHER_CATEGORY].filter((c) => groups.has(c)).map((c) => ({ category: c, herbs: groups.get(c)! }));
}
