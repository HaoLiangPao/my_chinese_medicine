// 五行（木火土金水）的对应关系与生克，纯数据 + 纯函数。
// 内容是中医基础理论教材里的通行说法；正式上线前请李医生审核。

export const ELEMENTS = ["木", "火", "土", "金", "水"] as const;
export type Element = (typeof ELEMENTS)[number];

export type Correspondence = {
  zang: string; // 五脏
  fu: string; // 六腑（取相表里的五腑）
  season: string;
  direction: string;
  color: string; // 五色
  taste: string; // 五味
  emotion: string; // 五志
  sense: string; // 开窍
  hex: string; // 图上用的颜色
};

export const CORRESPONDENCE: Record<Element, Correspondence> = {
  木: { zang: "肝", fu: "胆", season: "春", direction: "东", color: "青", taste: "酸", emotion: "怒", sense: "目", hex: "#3f7d4e" },
  火: { zang: "心", fu: "小肠", season: "夏", direction: "南", color: "赤", taste: "苦", emotion: "喜", sense: "舌", hex: "#b8432f" },
  土: { zang: "脾", fu: "胃", season: "长夏", direction: "中", color: "黄", taste: "甘", emotion: "思", sense: "口", hex: "#b7862a" },
  金: { zang: "肺", fu: "大肠", season: "秋", direction: "西", color: "白", taste: "辛", emotion: "悲", sense: "鼻", hex: "#8a8f98" },
  水: { zang: "肾", fu: "膀胱", season: "冬", direction: "北", color: "黑", taste: "咸", emotion: "恐", sense: "耳", hex: "#2f4f6f" },
};

const idx = (e: Element) => ELEMENTS.indexOf(e);
const at = (i: number) => ELEMENTS[((i % 5) + 5) % 5];

/** 我生：木生火、火生土、土生金、金生水、水生木 */
export const generates = (e: Element): Element => at(idx(e) + 1);
/** 我克：木克土、土克水、水克火、火克金、金克木（隔一位） */
export const controls = (e: Element): Element => at(idx(e) + 2);
/** 生我 */
export const generatedBy = (e: Element): Element => at(idx(e) - 1);
/** 克我 */
export const controlledBy = (e: Element): Element => at(idx(e) - 2);

export type Relation = "same" | "我生" | "生我" | "我克" | "克我";

/** a 看 b 是什么关系。五个元素两两之间恰好是这五种之一。 */
export function relation(a: Element, b: Element): Relation {
  if (a === b) return "same";
  if (generates(a) === b) return "我生";
  if (generatedBy(a) === b) return "生我";
  if (controls(a) === b) return "我克";
  return "克我";
}

/** 阴阳消长示意：一天中「阳」的比例（0–1）。子时（0 点）阳最少，午时（12 点）阳最盛。 */
export function yangShare(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return Math.round(((1 - Math.cos((h / 24) * 2 * Math.PI)) / 2) * 1000) / 1000;
}

/** 十二时辰：23–1 子时，1–3 丑时 …… */
const SHICHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
export function shichen(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return `${SHICHEN[Math.floor(((h + 1) % 24) / 2)]}时`;
}
