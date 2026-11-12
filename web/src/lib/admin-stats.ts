/** 管理员看板（docs/design/0015）的纯计算：时间段、Top N、账号显示名、坐标轴刻度 */

/** 和数据库里的 admin_min_subjects() 一致，只用来写说明文字 */
export const MIN_SUBJECTS = 5;

export const TOP_CHOICES = [10, 20, 30, 40] as const;
export type TopN = (typeof TOP_CHOICES)[number];
export type HerbSort = "grams" | "rx";

type Param = string | string[] | undefined;

/** `2026-02-03` → 原样；不是真实存在的日期、1990 年以前、2100 年以后 → null（和数据库的检查一致） */
export function parseDate(param: Param): string | null {
  if (typeof param !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
  const d = new Date(`${param}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== param) return null;
  if (param < "1990-01-01" || param > "2100-01-01") return null;
  return param;
}

export type DateRange = { from: string | null; to: string | null };

/** 地址栏的 from / to：不合法的当成不限；开始晚于结束就对调 */
export function parseRange(sp: { from?: Param; to?: Param }): DateRange {
  const from = parseDate(sp.from);
  const to = parseDate(sp.to);
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

/** 时间段写进地址栏（不限的那一头不写） */
export function rangeQuery(r: DateRange, extra: Record<string, string | number | undefined> = {}): string {
  const q = new URLSearchParams();
  if (r.from) q.set("from", r.from);
  if (r.to) q.set("to", r.to);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 快捷时间段（today = 多伦多的今天 YYYY-MM-DD） */
export function rangePresets(today: string): { label: string; range: DateRange }[] {
  const [y, m] = today.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    { label: "全部", range: { from: null, to: null } },
    { label: "最近 7 天", range: { from: addDays(today, -6), to: today } },
    { label: "最近 30 天", range: { from: addDays(today, -29), to: today } },
    { label: "本月", range: { from: `${y}-${pad(m)}-01`, to: today } },
    { label: "上个月", range: { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDayOf(py, pm))}` } },
    { label: "最近 90 天", range: { from: addDays(today, -89), to: today } },
    { label: "今年", range: { from: `${y}-01-01`, to: today } },
  ];
}

export const sameRange = (a: DateRange, b: DateRange) => a.from === b.from && a.to === b.to;

/** 「2026-02-01 至 2026-02-28」「2026-02-01 以来」「全部时间」 */
export function rangeLabel(r: DateRange): string {
  if (r.from && r.to) return r.from === r.to ? r.from : `${r.from} 至 ${r.to}`;
  if (r.from) return `${r.from} 以来`;
  if (r.to) return `${r.to} 以前`;
  return "全部时间";
}

export function parseTop(param: Param): TopN {
  const n = Number(param);
  return (TOP_CHOICES as readonly number[]).includes(n) ? (n as TopN) : 10;
}

export function parseSort(param: Param): HerbSort {
  return param === "rx" ? "rx" : "grams";
}

/** 地址栏里的账号 id：只收 uuid，别的当成找不到 */
export function parseUuid(param: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param) ? param.toLowerCase() : null;
}

/** 医生显示邮箱；病人账号和没选类型的只显示编号（邮箱数据库本来就不给） */
export function userLabel(row: { user_no: number; email: string | null; account_kind: string | null }): string {
  if (row.account_kind === "clinic") return row.email ? `医生 #${row.user_no} · ${row.email}` : `医生 #${row.user_no}`;
  return `${row.account_kind === "household" ? "病人" : "未选类型"} #${row.user_no}`;
}

/**
 * 纵轴刻度：从 0 开始、步长取 1 / 2 / 5 × 10ⁿ，最多 5 格，最后一格不小于最大值。
 * 处方张数是整数，步长至少 1
 */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((k) => k * pow).find((s) => s >= rough)!,
  );
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** 柱子长度（百分比），按纵轴的最大刻度算。有数的柱子至少 2%，看得见 */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

/** 趋势图下面的日期：每天 `02-03`，每周 `02-02 起`，每月 `2026-02` */
export function bucketLabel(date: string, bucket: string): string {
  if (bucket === "month") return date.slice(0, 7);
  return bucket === "week" ? `${date.slice(5)} 起` : date.slice(5);
}

export const BUCKET_NAMES: Record<string, string> = { day: "每天", week: "每周", month: "每月" };

/** 克数：1000 以上换成千克 */
export function weight(g: number | string | null): string {
  const n = Number(g ?? 0);
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} kg`;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} g`;
}
