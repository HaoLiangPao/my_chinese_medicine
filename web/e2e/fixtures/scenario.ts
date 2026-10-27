/**
 * E2E 测试场景（纯数据 + 期望值计算，不依赖浏览器）。
 *
 * 方剂：10 个常用方，剂量取自《方剂学》教材的现代常用量（由资料收集 agent 整理，人工核对过；
 *       归脾汤按教材修正）。仅用作测试数据，不是用药建议。
 * 价格：price-ranges.json 里的区间多数是估算（见该文件 notes），只用来造测试数据。
 * 店铺：5 家虚构的药行。
 */
import priceRanges from "./price-ranges.json";

export type FormulaItem = { herb: string; grams: number; prep?: string; entry?: string };
export type Formula = { name: string; doses: number; items: FormulaItem[]; patient?: string; extraLines?: FormulaItem[] };

/** entry = 录入时写的名字（测试别名匹配）；herb = 标准名（用于计算期望值） */
export const FORMULAS: Formula[] = [
  {
    name: "四君子汤",
    doses: 7,
    patient: "Hao",
    items: [
      { herb: "人参", grams: 9 },
      { herb: "白术", grams: 9 },
      { herb: "茯苓", grams: 9 },
      { herb: "炙甘草", grams: 6 },
    ],
  },
  {
    name: "补中益气汤",
    doses: 7,
    items: [
      { herb: "黄芪", grams: 18, entry: "北芪" }, // 别名
      { herb: "炙甘草", grams: 9 },
      { herb: "人参", grams: 6 },
      { herb: "当归", grams: 3 },
      { herb: "陈皮", grams: 6 },
      { herb: "升麻", grams: 6 },
      { herb: "柴胡", grams: 6 },
      { herb: "白术", grams: 9 },
    ],
  },
  {
    name: "八珍汤",
    doses: 10,
    items: [
      { herb: "党参", grams: 10 },
      { herb: "白术", grams: 10 },
      { herb: "茯苓", grams: 8 },
      { herb: "炙甘草", grams: 5 },
      { herb: "当归", grams: 5 }, // 和下面的 extraLines 合并成 10
      { herb: "川芎", grams: 5 },
      { herb: "白芍", grams: 8 },
      { herb: "熟地黄", grams: 12 },
    ],
    extraLines: [{ herb: "当归", grams: 5 }], // 同一味药录了两行 → 应合并
  },
  {
    name: "归脾汤",
    doses: 10,
    patient: "Tina",
    items: [
      { herb: "白术", grams: 18 },
      { herb: "茯神", grams: 18 }, // 种子目录里没有 → 录入时自动新建
      { herb: "黄芪", grams: 18 },
      { herb: "龙眼肉", grams: 18 },
      { herb: "炒酸枣仁", grams: 18 },
      { herb: "人参", grams: 9 },
      { herb: "木香", grams: 9, prep: "后下" },
      { herb: "炙甘草", grams: 6 },
      { herb: "当归", grams: 3 },
      { herb: "远志", grams: 3 },
      { herb: "生姜", grams: 5 },
      { herb: "大枣", grams: 6 },
    ],
  },
  {
    name: "逍遥散",
    doses: 7,
    items: [
      { herb: "柴胡", grams: 9 },
      { herb: "当归", grams: 9 },
      { herb: "白芍", grams: 9 },
      { herb: "白术", grams: 9 },
      { herb: "茯苓", grams: 9 },
      { herb: "炙甘草", grams: 4.5 }, // 小数克数
      { herb: "薄荷", grams: 3, prep: "后下" },
      { herb: "煨姜", grams: 3 }, // 新药材
    ],
  },
  {
    name: "六味地黄汤",
    doses: 14,
    items: [
      { herb: "熟地黄", grams: 24, entry: "熟地" },
      { herb: "山茱萸", grams: 12, entry: "山萸肉" },
      { herb: "山药", grams: 12 },
      { herb: "泽泻", grams: 9 },
      { herb: "牡丹皮", grams: 9, entry: "丹皮" },
      { herb: "茯苓", grams: 9 },
    ],
  },
  {
    name: "生脉散",
    doses: 7,
    items: [
      { herb: "人参", grams: 9 },
      { herb: "麦冬", grams: 9 },
      { herb: "五味子", grams: 6 },
    ],
  },
  {
    name: "玉屏风散",
    doses: 7,
    items: [
      { herb: "黄芪", grams: 12 },
      { herb: "白术", grams: 12 },
      { herb: "防风", grams: 6 },
    ],
  },
  {
    name: "小柴胡汤",
    doses: 5,
    items: [
      { herb: "柴胡", grams: 24 },
      { herb: "黄芩", grams: 9 },
      { herb: "人参", grams: 9 },
      { herb: "炙甘草", grams: 9 },
      { herb: "法半夏", grams: 9 },
      { herb: "生姜", grams: 9 },
      { herb: "大枣", grams: 12 },
    ],
  },
  {
    name: "酸枣仁汤",
    doses: 7,
    items: [
      { herb: "炒酸枣仁", grams: 15, entry: "炒枣仁" },
      { herb: "甘草", grams: 3 },
      { herb: "知母", grams: 6 },
      { herb: "茯苓", grams: 6 },
      { herb: "川芎", grams: 6 },
    ],
  },
];

// ---------------------------------------------------------------------------
// 店铺与采购
// ---------------------------------------------------------------------------
export const SHOPS = [
  { name: "仁和堂（测试）", factor: 0.55 },
  { name: "百草园（测试）", factor: 0.3 },
  { name: "福寿药行（测试）", factor: 0.75 },
  { name: "济生参茸行（测试）", factor: 0.9 },
  { name: "网上药材铺（测试）", factor: 0.1 },
] as const;

type Ranges = Record<string, { low: number; high: number }>;
const RANGES = (priceRanges as { herbs: Ranges }).herbs;
const PRICE_ALIAS: Record<string, string> = { 炒酸枣仁: "酸枣仁" }; // 炮制品没查到单独价格，用原药材

/** 确定性的「随机」扰动（同一味药在不同店价格不同，但每次运行一致） */
function jitter(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.2; // ±0.1
}

export function shopPrice(shop: (typeof SHOPS)[number], herb: string, grams: number) {
  const r = RANGES[PRICE_ALIAS[herb] ?? herb];
  if (!r) throw new Error(`没有 ${herb} 的价格区间`);
  const f = Math.min(1, Math.max(0, shop.factor + jitter(shop.name + herb)));
  return Math.round((grams / 100) * (r.low + (r.high - r.low) * f) * 100) / 100;
}

export type PurchaseLine = { herb: string; grams: number; price?: number };
export type Purchase = { shop: (typeof SHOPS)[number]; date: string; lines: PurchaseLine[] };

const S = SHOPS;
const P = (shop: (typeof SHOPS)[number], date: string, lines: PurchaseLine[]): Purchase => ({
  shop,
  date,
  lines: lines.map((l) => ({ ...l, price: l.price ?? shopPrice(shop, l.herb, l.grams) })),
});

export const PURCHASES: Purchase[] = [
  P(S[0], "2026-09-01", [
    { herb: "黄芪", grams: 500 },
    { herb: "白术", grams: 500 },
    { herb: "茯苓", grams: 500 },
    { herb: "炙甘草", grams: 250 },
    { herb: "党参", grams: 250 },
    { herb: "当归", grams: 250 },
  ]),
  P(S[1], "2026-09-05", [
    { herb: "茯苓", grams: 250 },
    { herb: "茯苓", grams: 250 }, // 同一张单子写了两行 → 合并成 500
    { herb: "熟地黄", grams: 500 },
    { herb: "山药", grams: 500 },
    { herb: "山茱萸", grams: 250 },
    { herb: "泽泻", grams: 250 },
    { herb: "牡丹皮", grams: 100 },
    { herb: "川芎", grams: 250 },
  ]),
  P(S[2], "2026-09-10", [
    { herb: "黄芪", grams: 250 },
    { herb: "柴胡", grams: 250 },
    { herb: "黄芩", grams: 250 },
    { herb: "法半夏", grams: 250 },
    { herb: "生姜", grams: 200 },
    { herb: "陈皮", grams: 250 },
    { herb: "白芍", grams: 250 },
    { herb: "知母", grams: 100 },
    { herb: "甘草", grams: 100 },
  ]),
  P(S[3], "2026-09-12", [
    { herb: "人参", grams: 50 }, // 贵，少量
    { herb: "大枣", grams: 100, price: 0 }, // 赠品
    { herb: "龙眼肉", grams: 250 },
    { herb: "麦冬", grams: 250 },
    { herb: "五味子", grams: 100 },
    { herb: "炒酸枣仁", grams: 250 },
  ]),
  P(S[4], "2026-09-20", [
    { herb: "黄芪", grams: 1000 }, // 第三家买黄芪
    { herb: "白术", grams: 250 },
    { herb: "当归", grams: 500 },
    { herb: "炙甘草", grams: 250 },
  ]),
];

/** 第一次盘点：家里原本就有的 */
export const INITIAL_STOCK: { herb: string; grams: number }[] = [
  { herb: "麦冬", grams: 120 },
  { herb: "枸杞子", grams: 200 },
];

// ---------------------------------------------------------------------------
// 煎药（从家里药柜取药）
// actual：这次「总共」实际用了多少克（覆盖处方量）；extras：处方外加的药
// ---------------------------------------------------------------------------
export type Decoction = {
  formula: string;
  doses: number;
  actual?: Record<string, number>;
  extras?: { herb: string; grams: number }[];
  undo?: boolean; // 记录后再撤销
  label: string;
};

export const DECOCTIONS: Decoction[] = [
  { formula: "四君子汤", doses: 7, label: "按处方，人参不够 → 变负" },
  { formula: "补中益气汤", doses: 3, actual: { 黄芪: 59 }, label: "黄芪多抓了 5g；升麻没买过 → 负" },
  { formula: "六味地黄汤", doses: 7, actual: { 牡丹皮: 0 }, label: "丹皮这次没放" },
  { formula: "小柴胡汤", doses: 5, extras: [{ herb: "生姜", grams: 6 }, { herb: "陈皮", grams: 6 }], label: "多加姜（处方内，叠加）+ 加陈皮（处方外）" },
  { formula: "玉屏风散", doses: 7, label: "防风从没买过" },
  { formula: "酸枣仁汤", doses: 3, label: "第一次 3 副" },
  { formula: "酸枣仁汤", doses: 4, actual: { 川芎: 20 }, label: "第二次 4 副，川芎少放" },
  { formula: "生脉散", doses: 7, label: "之后删除药方，库存不回滚" },
  { formula: "八珍汤", doses: 2, undo: true, label: "记错了，撤销" },
];

/** 称重校准：发现黄芪比账上少 3 g */
export const CALIBRATION = { herb: "黄芪", diff: -3 };

/** 煎完药之后删除的药方 */
export const DELETED_FORMULA = "生脉散";

// ---------------------------------------------------------------------------
// 期望值：独立于 App 的账本计算
// ---------------------------------------------------------------------------
const r2 = (n: number) => Math.round(n * 100) / 100;

export function expectedStock(opts: { includeCalibration: boolean }): Map<string, number> {
  const stock = new Map<string, number>();
  const add = (h: string, g: number) => stock.set(h, r2((stock.get(h) ?? 0) + g));

  for (const s of INITIAL_STOCK) add(s.herb, s.grams);
  for (const p of PURCHASES) for (const l of p.lines) add(l.herb, l.grams);

  for (const d of DECOCTIONS) {
    if (d.undo) continue;
    const f = FORMULAS.find((x) => x.name === d.formula)!;
    const lines = [...f.items, ...(f.extraLines ?? [])];
    const planned = new Map<string, number>();
    for (const i of lines) planned.set(i.herb, r2((planned.get(i.herb) ?? 0) + i.grams * d.doses));
    const used = new Map(planned);
    for (const [h, g] of Object.entries(d.actual ?? {})) used.set(h, g);
    for (const e of d.extras ?? []) used.set(e.herb, r2((used.get(e.herb) ?? 0) + e.grams));
    for (const [h, g] of used) if (g > 0) add(h, -g);
  }
  if (opts.includeCalibration) add(CALIBRATION.herb, CALIBRATION.diff);
  return stock;
}

/** 每味药在药方里出现的次数和累计用量（删除药方之后） */
export function expectedUsage() {
  const usage = new Map<string, { count: number; total: number }>();
  for (const f of FORMULAS) {
    if (f.name === DELETED_FORMULA) continue;
    const merged = new Map<string, number>();
    for (const i of [...f.items, ...(f.extraLines ?? [])]) merged.set(i.herb, (merged.get(i.herb) ?? 0) + i.grams);
    for (const [h, g] of merged) {
      const u = usage.get(h) ?? { count: 0, total: 0 };
      u.count += 1;
      u.total = r2(u.total + g * f.doses);
      usage.set(h, u);
    }
  }
  return usage;
}

/** 每味药在每家店的每克单价（用于 MVP2 比价断言） */
export function expectedPrices() {
  const out = new Map<string, { shop: string; perGram: number; date: string }[]>();
  for (const p of PURCHASES) {
    const merged = new Map<string, { grams: number; price: number }>();
    for (const l of p.lines) {
      const m = merged.get(l.herb) ?? { grams: 0, price: 0 };
      m.grams += l.grams;
      m.price = r2(m.price + (l.price ?? 0));
      merged.set(l.herb, m);
    }
    for (const [h, m] of merged) {
      const list = out.get(h) ?? [];
      list.push({ shop: p.shop.name, perGram: m.price / m.grams, date: p.date });
      out.set(h, list);
    }
  }
  return out;
}
