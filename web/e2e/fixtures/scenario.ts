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

/**
 * 购买记录页应该显示的内容（BUY-2）：按日期倒序；同一张单子里同名的药合并成一行；
 * 合计 = 各行总价之和；每 100 g 单价 = 总价 ÷ 克数 × 100。
 */
export function purchaseListView() {
  return [...PURCHASES]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => {
      const merged = new Map<string, { grams: number; price: number }>();
      for (const l of p.lines) {
        const m = merged.get(l.herb) ?? { grams: 0, price: 0 };
        merged.set(l.herb, { grams: m.grams + l.grams, price: m.price + (l.price ?? 0) });
      }
      const rows = [...merged].map(([herb, m]) => [
        herb,
        `${m.grams} g`,
        `$${m.price.toFixed(2)}`,
        `$${((m.price / m.grams) * 100).toFixed(2)}/100g`,
      ]);
      const total = [...merged.values()].reduce((s, m) => s + m.price, 0);
      return { store: p.shop.name, summary: `${p.date} · $${total.toFixed(2)}`, rows };
    });
}

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
  {
    formula: "小柴胡汤",
    doses: 5,
    extras: [
      { herb: "生姜", grams: 6 },
      { herb: "陈皮", grams: 6 },
    ],
    label: "多加姜（处方内，叠加）+ 加陈皮（处方外）",
  },
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

// ---------------------------------------------------------------------------
// 管理员看板（PLAT-4，docs/design/0015）：某个月里的处方，和从它们独立算出来的看板数字。
// 月份在测试运行时挑一个没有任何处方的月份，下面的函数按「这个月的第几天」算，不读 App 的结果。
// ---------------------------------------------------------------------------

/** 谁建的：doctor = 诊所账号（patient 是诊所里的第几个病人）；home = 病人账号；admin = 管理员（也是病人账号） */
export type AdminRx = {
  who: "doctor" | "home" | "admin";
  patient?: number;
  day: number | "last" | "prevLast";
  time?: string;
  doses?: number;
  herbs: string[];
};

/**
 * 小样本门槛：至少 5 个不同病人。诊所按病人数，家庭按药柜数（一家算一个），两组取较大的，不相加
 * （同一个人可能既是诊所的病人、又在自己家录了同一张方）
 */
export const ADMIN_MIN_SUBJECTS = 5;

/** 每副的克数：甘草 30 g，其他 10 g（让「按用量」和「按张数」排出来不一样） */
export const adminGramsPerDose = (herb: string) => (herb === "甘草" ? 30 : 10);

export const ADMIN_RX: AdminRx[] = [
  { who: "doctor", patient: 1, day: 3, herbs: ["黄芪", "甘草", "白术"] },
  { who: "doctor", patient: 2, day: 3, herbs: ["黄芪", "甘草", "当归"] },
  { who: "doctor", patient: 3, day: 5, herbs: ["黄芪", "甘草", "茯苓"] },
  { who: "doctor", patient: 4, day: 10, herbs: ["黄芪", "甘草", "白术"] },
  { who: "doctor", patient: 5, day: 10, herbs: ["黄芪", "甘草", "党参"] },
  { who: "doctor", patient: 1, day: 17, herbs: ["黄芪", "白术"] },
  { who: "doctor", patient: 6, day: 17, herbs: ["川芎", "当归"] },
  { who: "doctor", patient: 1, day: 24, herbs: ["黄芪", "白术"] },
  { who: "doctor", patient: 1, day: 26, herbs: ["白术"] }, // 白术 6 张，但诊所里只有 2 个病人 → 不显示
  { who: "admin", day: 20, doses: 2, herbs: ["黄芪", "甘草"] },
  { who: "admin", day: 20, herbs: ["黄芪", "白术"] },
  { who: "home", day: 25, herbs: ["当归", "茯苓"] },
  // 多伦多时间这个月最后一天 23:30（UTC 已经是下个月）：算这个月
  { who: "home", day: "last", time: "23:30", herbs: ["当归"] },
  // 多伦多时间上个月最后一天 23:30（UTC 已经是这个月）：不算这个月
  { who: "home", day: "prevLast", time: "23:30", herbs: ["黄芪"] },
];

/** 诊所这个月记了几次煎药（只有数量） */
export const ADMIN_DOCTOR_DECOCTIONS = 3;

const pad2 = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 这张处方在多伦多时间的日期 YYYY-MM-DD（month = "YYYY-MM"） */
export function adminRxDate(month: string, rx: AdminRx): string {
  const [y, m] = month.split("-").map(Number);
  if (rx.day === "prevLast") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return `${py}-${pad2(pm)}-${pad2(daysIn(py, pm))}`;
  }
  return `${month}-${pad2(rx.day === "last" ? daysIn(y, m) : rx.day)}`;
}

/** 这个月的第一天和最后一天（看板的时间段） */
export function adminMonthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${pad2(daysIn(y, m))}` };
}

const inMonth = (month: string) => ADMIN_RX.filter((r) => adminRxDate(month, r).startsWith(month));
const subjectOf = (r: AdminRx) => (r.who === "doctor" ? `clinic:${r.patient}` : `home:${r.who}`);
const peopleCount = (subjects: Set<string>) => {
  const clinic = [...subjects].filter((s) => s.startsWith("clinic:")).length;
  return Math.max(clinic, subjects.size - clinic);
};
const gramsOf = (r: AdminRx, herb: string) => adminGramsPerDose(herb) * (r.doses ?? 1);

type Group = { rx: number; grams: number; subjects: Set<string> };
function add(groups: Map<string, Group>, key: string, r: AdminRx, grams: number) {
  const e = groups.get(key) ?? { rx: 0, grams: 0, subjects: new Set<string>() };
  e.rx += 1;
  e.grams += grams;
  e.subjects.add(subjectOf(r));
  groups.set(key, e);
}
function ranked(groups: Map<string, Group>, by: "grams" | "rx") {
  const shown = [...groups]
    .filter(([, g]) => peopleCount(g.subjects) >= ADMIN_MIN_SUBJECTS)
    .map(([name, g]) => ({ name, count: g.rx, grams: g.grams }))
    .sort((a, b) => (by === "rx" ? b.count - a.count : b.grams - a.grams));
  return { shown, other: groups.size - shown.length };
}

/** 常用药材：每味药出现在几张处方里、累计多少克；不到门槛的只数有几味 */
export function expectedAdminHerbs(month: string, by: "grams" | "rx" = "grams") {
  const g = new Map<string, Group>();
  for (const r of inMonth(month)) for (const h of new Set(r.herbs)) add(g, h, r, gramsOf(r, h));
  return ranked(g, by);
}

/** 常见组合：同一张处方里的每两味药（名字排好序后用 | 拼起来当 key） */
export function expectedAdminPairs(month: string) {
  const g = new Map<string, Group>();
  for (const r of inMonth(month)) {
    const hs = [...new Set(r.herbs)].sort();
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) add(g, `${hs[i]}|${hs[j]}`, r, 0);
  }
  return ranked(g, "rx");
}

/** 医生的库存消耗：测试按处方量给诊所的每张处方扣库存，所以消耗 = 诊所处方的克数；门槛一样 */
export function expectedDoctorConsumption(month: string) {
  const g = new Map<string, Group>();
  for (const r of inMonth(month).filter((x) => x.who === "doctor")) for (const h of new Set(r.herbs)) add(g, h, r, gramsOf(r, h));
  const { shown, other } = ranked(g, "grams");
  return { shown, other, total: [...g.values()].reduce((s, e) => s + e.grams, 0) };
}

/** 每个账号：处方数、用过几种药、录药方的天数、最后一次的日期；医生还有看过几个病人 */
export function expectedAdminUsers(month: string) {
  const out = new Map<AdminRx["who"], { rx: number; herbs: number; days: number; last: string; patients: number }>();
  for (const who of ["doctor", "home", "admin"] as const) {
    const list = inMonth(month).filter((r) => r.who === who);
    if (!list.length) continue;
    const dates = list.map((r) => adminRxDate(month, r));
    out.set(who, {
      rx: list.length,
      herbs: new Set(list.flatMap((r) => r.herbs)).size,
      days: new Set(dates).size,
      last: dates.sort().at(-1)!,
      patients: new Set(list.filter((r) => r.patient).map((r) => r.patient)).size,
    });
  }
  return out;
}

/** 这个月每天的处方数（每一天都有，没有的是 0） */
export function expectedAdminDays(month: string, who?: AdminRx["who"]): Map<string, number> {
  const [y, m] = month.split("-").map(Number);
  const out = new Map<string, number>();
  for (let d = 1; d <= daysIn(y, m); d++) out.set(`${month}-${pad2(d)}`, 0);
  for (const r of inMonth(month)) if (!who || r.who === who) out.set(adminRxDate(month, r), out.get(adminRxDate(month, r))! + 1);
  return out;
}

/** 纵轴的最大刻度要不小于最大的柱子 */
export const maxOf = (m: Map<string, number>) => Math.max(...m.values());
