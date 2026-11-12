/** 管理员看板（docs/design/0015）的纯计算：月份参数、账号显示名、柱子长度 */

/** 和数据库里的 admin_min_subjects() 一致，只用来写说明文字 */
export const MIN_SUBJECTS = 5;

/** `?month=2026-11` → 统计函数要的 `2026-11-01`；不合法的（包括 13 月、多余的字符）→ null（= 全部时间） */
export function parseMonth(param: string | string[] | undefined): string | null {
  if (typeof param !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(param);
  if (!m) return null;
  const month = Number(m[2]);
  if (Number(m[1]) < 1900 || month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

/** 从 today（YYYY-MM-DD）所在的月份往前 n 个月，最近的在前 */
export function recentMonths(today: string, n = 12): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const total = y * 12 + (m - 1) - i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

/** `2026-11` → 「2026 年 11 月」 */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

export type UserActivityRow = {
  user_no: number;
  email: string | null;
  account_kind: string | null;
  prescriptions: number;
  herbs: number;
  last_on: string;
  is_me: boolean;
};

/** 医生显示邮箱；病人账号和没选类型的只显示编号（邮箱数据库本来就不给） */
export function userLabel(row: Pick<UserActivityRow, "user_no" | "email" | "account_kind">): string {
  if (row.account_kind === "clinic") return row.email ? `医生 #${row.user_no} · ${row.email}` : `医生 #${row.user_no}`;
  return `${row.account_kind === "household" ? "病人" : "未选类型"} #${row.user_no}`;
}

/** 柱子长度（百分比）。最大值是 0 时都是 0；有数的柱子至少 2%，看得见 */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

/** 趋势图下面的日期：每天 `11-05`，每周 `11-02 起` */
export function bucketLabel(date: string, bucket: "day" | "week"): string {
  const md = date.slice(5);
  return bucket === "week" ? `${md} 起` : md;
}
