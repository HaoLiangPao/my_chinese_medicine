/**
 * 信息纠错（docs/design/0021）：指出药材和题目里的错误。纯函数：
 * - 「哪一项有误」的列表（和 migration 20261115000028 的 check 约束一致，单元测试比对）
 * - 入口按钮和反馈面板之间传的对象（浏览器事件）
 * - 服务器端整理用户提交的内容（不信任浏览器）
 * - 管理员看板的筛选、计数、按对象汇总
 */
import { sanitizePath, truncate, LIMITS } from "./bug-report";

export const CORRECTION_EVENT = "content-correction:open";

export const SUBJECT_TYPES = ["herb", "quiz_question"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const HERB_FIELDS = {
  name: "药名",
  pinyin: "拼音",
  aliases: "别名",
  category: "功效分类",
  origin_kind: "来源（植物 / 动物 / 矿物……）",
  medicinal_part: "入药部位",
  base_herb: "原药材 / 炮制品的对应",
  properties: "性味归经",
  monograph: "其他资料（功效、炮制、产区、毒性、使用注意等）",
  photo: "照片",
  other: "其他",
} as const;
export const QUIZ_FIELDS = {
  stem: "题干",
  options: "选项",
  answer: "答案",
  explanation: "解析",
  source: "出处",
  other: "其他",
} as const;
export type HerbField = keyof typeof HERB_FIELDS;
export type QuizField = keyof typeof QUIZ_FIELDS;

const FIELDS: Record<SubjectType, Record<string, string>> = { herb: HERB_FIELDS, quiz_question: QUIZ_FIELDS };

export const SUBJECT_NOUN: Record<SubjectType, string> = { herb: "这味药", quiz_question: "这道题" };

export const CORRECTION_LIMITS = { evidence: 200, label: 60 } as const;

const isSubjectType = (v: unknown): v is SubjectType => typeof v === "string" && (SUBJECT_TYPES as readonly string[]).includes(v);
const isField = (type: SubjectType, f: unknown): f is string => typeof f === "string" && Object.hasOwn(FIELDS[type], f);

/** 「哪一项」的中文名；不认识的原样返回（看板上显示用，数据库约束保证不会有） */
export function fieldLabel(type: string | null, field: string | null): string {
  if (!field) return "—";
  return isSubjectType(type) && isField(type, field) ? FIELDS[type][field] : field;
}

/**
 * 药材页上能选哪几项：页面上没显示的不给选（0021 §3.2）。
 * - 没有资料：没有「性味归经」「其他资料」
 * - 显示的不是默认照片（本罐照片是用户自己拍的，或者没照片）：没有「照片」
 */
export function herbCorrectionFields(page: { hasMonograph: boolean; showsDefaultPhoto: boolean }): HerbField[] {
  return (Object.keys(HERB_FIELDS) as HerbField[]).filter(
    (f) => !((f === "properties" || f === "monograph") && !page.hasMonograph) && !(f === "photo" && !page.showsDefaultPhoto),
  );
}

export const QUIZ_CORRECTION_FIELDS = Object.keys(QUIZ_FIELDS) as QuizField[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_ID = /^[a-z]+-[0-9]{3}$/;
const isSubjectId = (type: SubjectType, id: unknown): id is string =>
  typeof id === "string" && (type === "herb" ? UUID.test(id) : QUESTION_ID.test(id));

/** 入口按钮发给反馈面板的：对象、显示的名字、能选的几项 */
export type CorrectionSubject = { type: SubjectType; id: string; label: string; fields: string[] };

/** 浏览器事件里带的东西也检查一遍：格式不对就不打开面板 */
export function parseCorrectionSubject(detail: unknown): CorrectionSubject | null {
  if (typeof detail !== "object" || detail === null) return null;
  const d = detail as Record<string, unknown>;
  if (!isSubjectType(d.type) || !isSubjectId(d.type, d.id)) return null;
  const type = d.type;
  const fields = (Array.isArray(d.fields) ? d.fields : Object.keys(FIELDS[type])).filter((f): f is string => isField(type, f));
  if (!fields.length) return null;
  const label = truncate(typeof d.label === "string" ? d.label.replace(/\s+/g, " ").trim() : "", CORRECTION_LIMITS.label);
  return { type, id: d.id as string, label, fields: [...new Set(fields)] };
}

export type CorrectionInput = {
  subjectType: SubjectType;
  subjectId: string;
  field: string;
  description: string;
  evidence: string | null;
  pagePath: string;
};

/**
 * 服务器端：不信任浏览器。对象类型、id 格式、这种对象有没有这一项都检查；
 * 描述（应该是什么）和依据是用户自己写的，只去掉首尾空格、截断，不遮（和 Bug 反馈的描述一样，0014 §4）。
 */
export function normalizeCorrection(raw: unknown): { ok: true; value: CorrectionInput } | { ok: false; error: string } {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  if (!isSubjectType(r.subjectType) || !isSubjectId(r.subjectType, r.subjectId)) return { ok: false, error: "不知道是哪味药 / 哪道题" };
  if (!isField(r.subjectType, r.field)) return { ok: false, error: "请选一下哪一项有误" };
  const description = truncate(typeof r.description === "string" ? r.description.trim() : "", LIMITS.description);
  if (!description) return { ok: false, error: "请写一下应该是什么" };
  const evidence = truncate(typeof r.evidence === "string" ? r.evidence.replace(/\s+/g, " ").trim() : "", CORRECTION_LIMITS.evidence);
  return {
    ok: true,
    value: {
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      field: r.field,
      description,
      evidence: evidence || null,
      pagePath: sanitizePath(typeof r.pagePath === "string" && r.pagePath ? r.pagePath : "/"),
    },
  };
}

// ---------------------------------------------------------------------------
// 管理员看板（0021 §5.3）
// ---------------------------------------------------------------------------

export const FEEDBACK_KINDS = { bug: "程序问题", content: "信息纠错" } as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;
export const FEEDBACK_STATUSES = ["new", "in_progress", "fixed", "wontfix"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** 状态的叫法：数据库里一样，纠错说「已改 / 不改」 */
export function statusLabel(kind: string | null, status: string): string {
  const content = kind === "content";
  return (
    { new: "新", in_progress: "处理中", fixed: content ? "已改" : "已修", wontfix: content ? "不改" : "不修" }[status as FeedbackStatus] ??
    status
  );
}

export type FeedbackRow = {
  id: string;
  created_at: string;
  status: string;
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  subject_label: string | null;
};

export type FeedbackFilter = { kind: FeedbackKind | null; status: FeedbackStatus | null; subject: string | null };

export const subjectKey = (type: string | null, id: string | null) => (type && id ? `${type}:${id}` : null);

/** 地址栏 → 筛选条件；不认识的值当成不筛 */
export function parseFeedbackFilter(sp: Record<string, string | string[] | undefined>): FeedbackFilter {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const kind = one("kind");
  const status = one("status");
  const subject = one("subject");
  const [type, ...rest] = (subject ?? "").split(":");
  const id = rest.join(":");
  return {
    kind: kind && Object.hasOwn(FEEDBACK_KINDS, kind) ? (kind as FeedbackKind) : null,
    status: status && (FEEDBACK_STATUSES as readonly string[]).includes(status) ? (status as FeedbackStatus) : null,
    subject: isSubjectType(type) && isSubjectId(type, id) ? `${type}:${id}` : null,
  };
}

/** 筛选条件 → 地址栏（只写有值的；按对象筛选时一定是纠错） */
export function feedbackHref(f: FeedbackFilter): string {
  const q = new URLSearchParams();
  const kind = f.subject ? "content" : f.kind;
  if (kind) q.set("kind", kind);
  if (f.status) q.set("status", f.status);
  if (f.subject) q.set("subject", f.subject);
  const s = q.toString();
  return s ? `/admin/bugs?${s}` : "/admin/bugs";
}

export function filterFeedback<T extends FeedbackRow>(rows: readonly T[], f: FeedbackFilter): T[] {
  return rows.filter(
    (r) =>
      (!f.kind || r.kind === f.kind) &&
      (!f.status || r.status === f.status) &&
      (!f.subject || subjectKey(r.subject_type, r.subject_id) === f.subject),
  );
}

export function countBy<T>(rows: readonly T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
}

const isOpen = (status: string) => status === "new" || status === "in_progress";

export type SubjectSummary = {
  key: string;
  subjectType: SubjectType;
  subjectId: string;
  label: string | null;
  total: number;
  open: number;
  lastAt: string;
};

/**
 * 按对象汇总纠错：同一味药 / 同一道题被指出几次、还有几次没处理。
 * 未处理的多的排前面，再按总次数、最近一次。对象已经删掉的（外键变空）不汇总。
 */
export function groupBySubject(rows: readonly FeedbackRow[]): SubjectSummary[] {
  const by = new Map<string, SubjectSummary>();
  for (const r of rows) {
    const key = subjectKey(r.subject_type, r.subject_id);
    if (r.kind !== "content" || !key || !isSubjectType(r.subject_type)) continue;
    const s = by.get(key) ?? {
      key,
      subjectType: r.subject_type,
      subjectId: r.subject_id as string,
      label: r.subject_label,
      total: 0,
      open: 0,
      lastAt: r.created_at,
    };
    s.total += 1;
    if (isOpen(r.status)) s.open += 1;
    if (r.created_at > s.lastAt) s.lastAt = r.created_at;
    by.set(key, s);
  }
  return [...by.values()].sort((a, b) => b.open - a.open || b.total - a.total || b.lastAt.localeCompare(a.lastAt));
}
