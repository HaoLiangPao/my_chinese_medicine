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
  if (s.length <= max) return s; // 字数不会比 UTF-16 单元多
  // 一个字最多 2 个单元：只看前 max * 2 个单元就够了，不把很长的字符串整个拆开
  const chars = Array.from(s.slice(0, max * 2));
  return chars.length <= max && s.length <= max * 2 ? s : chars.slice(0, max).join("");
}

/**
 * 遮之前先切到上限的几倍：遮的正则在很长的字符串上很慢（耗时按长度的平方涨），不能让别人传一个巨长的字段把服务器卡住。
 * 留几倍的余量，是为了「先遮再截」——截断的地方不会留下半个电话。
 */
const bounded = (s: string, max: number) => {
  const cut = s.slice(0, max * 4);
  // 正好切在一个表情中间时，去掉剩下的半个（孤立的代理字符存不进数据库）
  return /[\uD800-\uDBFF]$/.test(cut) && cut.length < s.length ? cut.slice(0, -1) : cut;
};

/** 遮住邮箱和长数字；uuid（内部 id）保留。调用前先用 bounded() 限制长度 */
export function redactText(s: string): string {
  const keep = s.match(UUID) ?? [];
  return s
    .split(UUID)
    .map((part) => part.replace(EMAIL, "[邮箱]").replace(LONG_NUMBER, "[数字]"))
    .reduce((out, part, i) => out + part + (keep[i] ?? ""), "");
}

// 一帧末尾的位置：「at f (https://…/chunks/1255-642c76f13c20a3ec.js:1:234567)」或 Firefox / Safari 的「f@https://…js:1:2」
const FRAME_LOCATION = /\S+:\d+:\d+\)?\s*$/;
/**
 * 堆栈：每一帧末尾的位置（带哈希的文件名和「:行:列」）要留着，不然对不回源码，所以这一段只遮邮箱；
 * 这一行前面的字、别的行（开头的错误信息）和别的文字一样遮。
 */
function redactStack(stack: string): string {
  return stack
    .split("\n")
    .map((line) => {
      const at = line.search(FRAME_LOCATION);
      return at < 0 ? redactText(line) : redactText(line.slice(0, at)) + line.slice(at).replace(EMAIL, "[邮箱]");
    })
    .join("\n");
}

/**
 * 路径脱敏：query 只留参数名、去掉值；去掉 # 后面的；路径里的 uuid 保留，其他段按文字规则遮住。
 * 例：/clinic/prescribe?patient=3f…&q=张三#top → /clinic/prescribe?patient&q
 */
export function sanitizePath(raw: string): string {
  raw = bounded(raw, LIMITS.path);
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

/** 操作记录里的一条文字：压成一行、遮住、截断 */
export function sanitizeLabel(raw: string): string {
  return truncate(redactText(bounded(raw.replace(/\s+/g, " ").trim(), LIMITS.actionLabel)), LIMITS.actionLabel);
}

/**
 * 点了什么（白名单，docs/design/0014 §4）：从不读元素上显示的字——病人姓名、用户起的名字都会出现在按钮上。
 * - 链接：只记目标路径（脱敏过的）
 * - 标了 `data-bug-label` 的按钮：记这个标签（代码里写死的）
 * - 别的：只记元素类型
 */
export function clickLabel(el: { tag: string; bugLabel: string | null; href: string | null }): string {
  if (el.href) return sanitizeLabel(`→ ${sanitizePath(el.href)}`);
  const label = sanitizeLabel(el.bugLabel ?? "");
  if (label) return label;
  return el.tag.toLowerCase() === "summary" ? "（折叠栏）" : "（按钮）";
}

export function sanitizeError(message: string, stack: string): Pick<BugError, "message" | "stack"> {
  return {
    message: truncate(redactText(bounded(message, LIMITS.errorMessage)), LIMITS.errorMessage),
    stack: truncate(redactStack(bounded(stack, LIMITS.errorStack)), LIMITS.errorStack),
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
