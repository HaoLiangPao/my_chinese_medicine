/**
 * Bug 反馈的脱敏和截断（docs/design/0014 §4）。纯函数：浏览器收集时用一遍，server action 收到后再用一遍。
 */

export const LIMITS = {
  description: 2000,
  path: 300,
  userAgent: 300,
  actions: 20,
  actionLabel: 40,
  actionPath: 120,
  errors: 5,
  errorMessage: 300,
  errorStack: 1000,
} as const;

export type BugAction = { t: string; kind: "nav" | "click"; label: string };
export type BugError = { t: string; message: string; stack: string };
export type BugReportInput = {
  description: string;
  pagePath: string;
  userAgent: string | null;
  viewport: string | null;
  actions: BugAction[];
  errors: BugError[];
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// 6 位以上的数字，中间可以有空格、-、.、括号，开头可以有 +：电话、身份证号、卡号
const LONG_NUMBER = /[+(（]?(?:\d[\s\-.()（）]*){5,}\d/g;

/** 按字（不是 UTF-16 单元）截断，不会把一个表情切成两半 */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join("");
}

/** 遮住邮箱和长数字；uuid（内部 id）保留 */
export function redactText(s: string): string {
  const keep = s.match(UUID) ?? [];
  return s
    .split(UUID)
    .map((part) => part.replace(EMAIL, "[邮箱]").replace(LONG_NUMBER, "[数字]"))
    .reduce((out, part, i) => out + part + (keep[i] ?? ""), "");
}

/**
 * 路径脱敏：query 只留参数名、去掉值；去掉 # 后面的；路径里的 uuid 保留，其他段按文字规则遮住。
 * 例：/clinic/prescribe?patient=3f…&q=张三#top → /clinic/prescribe?patient&q
 */
export function sanitizePath(raw: string): string {
  let pathname = raw;
  let search = "";
  try {
    const u = new URL(raw, "http://x");
    pathname = u.pathname;
    search = u.search;
  } catch {
    pathname = raw.split(/[?#]/)[0];
  }
  const segments = pathname.split("/").map((seg) => {
    let s = seg;
    try {
      s = decodeURIComponent(seg);
    } catch {
      // 不是合法的编码就原样处理
    }
    return redactText(s);
  });
  const keys = [...new Set([...new URLSearchParams(search).keys()].map(redactText))];
  const path = (segments.join("/") || "/") + (keys.length ? `?${keys.join("&")}` : "");
  return truncate(path.startsWith("/") ? path : `/${path}`, LIMITS.path);
}

/** 按钮上的字：压成一行、遮住、截断 */
export function sanitizeLabel(raw: string): string {
  return truncate(redactText(raw.replace(/\s+/g, " ").trim()), LIMITS.actionLabel);
}

export function sanitizeError(message: string, stack: string): Pick<BugError, "message" | "stack"> {
  return {
    message: truncate(redactText(message), LIMITS.errorMessage),
    stack: truncate(redactText(stack), LIMITS.errorStack),
  };
}

/** 往队列里加一条，只留最近的 max 条（返回新数组） */
export function pushCapped<T>(list: readonly T[], item: T, max: number): T[] {
  return [...list, item].slice(-max);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : "");
/** 时间只收 ISO 格式（浏览器用 toISOString 生成），别的一律变成空 */
const isoTime = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) ? v : "");

/**
 * 服务器端：不信任浏览器传来的东西。类型不对的丢掉，条数和长度截到上限，文字再遮一遍。
 * 描述是用户自己写的，只去掉首尾空格和截断，不遮。
 */
export function normalizeBugReport(raw: unknown): BugReportInput {
  const r = isRecord(raw) ? raw : {};
  const viewport = text(r.viewport);
  const actions = (Array.isArray(r.actions) ? r.actions : [])
    .filter(isRecord)
    .slice(-LIMITS.actions)
    .map((a): BugAction => {
      const kind = a.kind === "nav" ? "nav" : "click";
      const label = kind === "nav" ? truncate(sanitizePath(text(a.label)), LIMITS.actionPath) : sanitizeLabel(text(a.label));
      return { t: isoTime(a.t), kind, label };
    });
  const errors = (Array.isArray(r.errors) ? r.errors : [])
    .filter(isRecord)
    .slice(-LIMITS.errors)
    .map((e): BugError => ({ t: isoTime(e.t), ...sanitizeError(text(e.message), text(e.stack)) }));
  return {
    description: truncate(text(r.description).trim(), LIMITS.description),
    pagePath: sanitizePath(text(r.pagePath) || "/"),
    userAgent: truncate(text(r.userAgent), LIMITS.userAgent) || null,
    viewport: /^\d{1,5}x\d{1,5}$/.test(viewport) ? viewport : null,
    actions,
    errors,
  };
}
