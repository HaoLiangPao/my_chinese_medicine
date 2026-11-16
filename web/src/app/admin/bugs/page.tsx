import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { bugActions, bugErrors } from "@/lib/admin-stats";
import {
  countBy,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  feedbackHref,
  fieldLabel,
  filterFeedback,
  groupBySubject,
  parseFeedbackFilter,
  statusLabel,
  SUBJECT_NOUN,
  type FeedbackKind,
  type SubjectSummary,
} from "@/lib/content-correction";
import { requireAdmin, rows, formatTime } from "../admin";
import { setBugStatus } from "./actions";

const STATUS_STYLE: Record<string, string> = {
  new: "bg-cinnabar text-white",
  in_progress: "bg-amber/20 text-amber",
  fixed: "bg-jade/15 text-jade",
  wontfix: "bg-line text-muted",
};

type Bug = {
  id: string;
  created_at: string;
  status: string;
  reporter_id: string | null;
  reporter_no: number | null;
  reporter_kind: string | null;
  reporter_email: string | null;
  page_path: string;
  description: string;
  user_agent: string | null;
  viewport: string | null;
  app_version: string | null;
  recent_actions: unknown; // 用户能直接写这一列：显示前用 bugActions / bugErrors 过滤
  recent_errors: unknown;
  // 信息纠错（docs/design/0021）；程序问题这几列是空的
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  subject_label: string | null;
  field: string | null;
  evidence: string | null;
};

/**
 * IDEA-5 的反馈（docs/design/0014）和信息纠错（0021）：按类型、状态、对象看，改状态。描述是用户自己写的，原样显示。
 * 一次拿最近 500 条，筛选、计数、按对象汇总在页面里算（lib/content-correction.ts）
 */
export default function BugsPage({ searchParams }: PageProps<"/admin/bugs">) {
  return (
    <Suspense fallback={<Loading />}>
      <List searchParams={searchParams} />
    </Suspense>
  );
}

function Reporter({ b }: { b: Bug }) {
  if (!b.reporter_id || b.reporter_no === null) return <span>（账号已删除）</span>;
  if (b.reporter_kind === "clinic")
    return (
      <Link href={`/admin/doctors/${b.reporter_id}`} className="break-all hover:text-cinnabar" data-bug-label="反馈打开提交人">
        医生 #{b.reporter_no} · {b.reporter_email}
      </Link>
    );
  if (b.reporter_kind === "household")
    return (
      <Link href={`/admin/patients/${b.reporter_id}`} className="hover:text-cinnabar" data-bug-label="反馈打开提交人">
        病人 #{b.reporter_no}
      </Link>
    );
  return <span>未选类型 #{b.reporter_no}</span>;
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm ${on ? "border-cinnabar bg-cinnabar text-white" : "border-line text-muted hover:bg-paper"}`;

/** 被纠错的对象：药材链到详情页；题目显示编号和题干；已经删掉的写明 */
function Subject({ b }: { b: Bug }) {
  if (!b.subject_id) return <span className="text-muted">（{b.subject_type === "quiz_question" ? "题目" : "药材"}已删除）</span>;
  if (b.subject_type === "herb")
    return (
      <Link href={`/herbs/${b.subject_id}`} className="font-bold underline hover:text-cinnabar" data-bug-label="反馈打开被纠错的药材">
        {b.subject_label}
      </Link>
    );
  return (
    <span>
      题目 <code>{b.subject_id}</code>：{b.subject_label}
    </span>
  );
}

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFeedbackFilter(await searchParams);
  const kind: FeedbackKind | null = f.subject ? "content" : f.kind;
  const { supabase } = await requireAdmin();
  const all = rows<Bug>(await supabase.rpc("admin_feedback_reports", { p_status: null, p_limit: 500 }));
  const kindCounts = countBy(all, (b) => b.kind);
  const ofKind = filterFeedback(all, { kind, status: null, subject: f.subject });
  const statusCounts = countBy(ofKind, (b) => b.status);
  const subjects = groupBySubject(all);
  const bySubject = new Map(subjects.map((s) => [s.key, s]));
  const bugs = filterFeedback(ofKind, { kind: null, status: f.status, subject: null })
    .slice(0, 100)
    .map((b) => ({ ...b, actions: bugActions(b.recent_actions), errors: bugErrors(b.recent_errors) }));
  const current = f.subject ? bySubject.get(f.subject) : undefined;

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="按类型" data-testid="admin-bug-kind-filter">
        {([null, ...Object.keys(FEEDBACK_KINDS)] as (FeedbackKind | null)[]).map((k) => (
          <Link
            key={k ?? "all"}
            href={feedbackHref({ kind: k, status: f.status, subject: null })}
            data-bug-label="反馈按类型筛选"
            aria-current={k === kind && !f.subject ? "page" : undefined}
            className={chip(k === kind && !f.subject)}
          >
            {k ? FEEDBACK_KINDS[k] : "全部类型"}（{k ? (kindCounts[k] ?? 0) : all.length}）
          </Link>
        ))}
      </nav>
      <nav className="flex flex-wrap gap-2" aria-label="按状态" data-testid="admin-bug-filter">
        {[null, ...FEEDBACK_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={feedbackHref({ ...f, kind, status: s })}
            data-bug-label="反馈按状态筛选"
            aria-current={s === f.status ? "page" : undefined}
            className={chip(s === f.status)}
          >
            {s ? statusLabel(kind, s) : "全部"}（{s ? (statusCounts[s] ?? 0) : ofKind.length}）
          </Link>
        ))}
      </nav>
      {f.subject && (
        <p className="text-sm" data-testid="admin-correction-only">
          只看：{current?.label ?? f.subject}{" "}
          <Link
            href={feedbackHref({ kind: "content", status: f.status, subject: null })}
            className="underline"
            data-bug-label="反馈取消按对象筛选"
          >
            看全部纠错
          </Link>
        </p>
      )}
      {kind === "content" && !f.subject && subjects.length > 0 && <SubjectSummaries subjects={subjects.slice(0, 20)} />}
      {!bugs.length ? (
        <p className="card text-sm text-muted">没有反馈。</p>
      ) : (
        <ul className="space-y-3" data-testid="admin-bugs">
          {bugs.map((b) => (
            <li key={b.id} className="card space-y-2" data-testid="admin-bug">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[b.status]}`} data-testid="admin-bug-status">
                    {statusLabel(b.kind, b.status)}
                  </span>
                  {b.kind === "content" && (
                    <span className="rounded-full bg-jade/15 px-2 py-0.5 text-xs text-jade" data-testid="admin-bug-kind">
                      信息纠错
                    </span>
                  )}
                  <code className="break-all" data-testid="admin-bug-path">
                    {b.page_path}
                  </code>
                </span>
                <span className="text-muted">{formatTime(b.created_at)}</span>
              </div>
              {b.kind === "content" ? (
                <CorrectionBody b={b} summary={bySubject.get(`${b.subject_type}:${b.subject_id}`)} />
              ) : (
                <p className="whitespace-pre-wrap" data-testid="admin-bug-description">
                  {b.description}
                </p>
              )}
              <div className="text-sm text-muted">
                提交人：
                <Reporter b={b} />
              </div>
              {b.kind !== "content" && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted" data-bug-label="展开反馈的诊断信息">
                    诊断信息
                  </summary>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-muted">屏幕</dt>
                    <dd>{b.viewport ?? "—"}</dd>
                    <dt className="text-muted">版本</dt>
                    <dd className="break-all">{b.app_version ?? "—"}</dd>
                    <dt className="text-muted">浏览器</dt>
                    <dd className="break-all">{b.user_agent ?? "—"}</dd>
                    <dt className="text-muted">最近操作</dt>
                    <dd>
                      {b.actions.length ? (
                        <ol className="list-decimal pl-5">
                          {b.actions.map((a, i) => (
                            <li key={i} className="break-all">
                              {a.kind === "nav" ? "打开" : "点了"} {a.label}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        "—"
                      )}
                    </dd>
                    <dt className="text-muted">前端错误</dt>
                    <dd>
                      {b.errors.length ? (
                        <ul className="space-y-1">
                          {b.errors.map((e, i) => (
                            <li key={i} className="break-all">
                              <code>{e.message}</code>
                              {e.stack && <pre className="mt-1 overflow-x-auto text-xs whitespace-pre-wrap">{e.stack}</pre>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </dl>
                </details>
              )}
              <form action={setBugStatus} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={b.id} />
                <label className="text-sm text-muted">
                  状态{" "}
                  <select name="status" defaultValue={b.status} className="input inline-block w-auto py-1" aria-label="状态">
                    {FEEDBACK_STATUSES.map((k) => (
                      <option key={k} value={k}>
                        {statusLabel(b.kind, k)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="btn-ghost py-1" data-bug-label="保存反馈状态">
                  保存
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 信息纠错的正文：对象、哪一项、建议、依据、同一个对象被指出几次 */
function CorrectionBody({ b, summary }: { b: Bug; summary: SubjectSummary | undefined }) {
  return (
    <div className="space-y-1">
      <p data-testid="admin-correction-subject">
        <Subject b={b} />
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">哪一项</dt>
        <dd data-testid="admin-correction-field">{fieldLabel(b.subject_type, b.field)}</dd>
        <dt className="text-muted">应该是</dt>
        <dd className="whitespace-pre-wrap" data-testid="admin-bug-description">
          {b.description}
        </dd>
        <dt className="text-muted">依据</dt>
        <dd data-testid="admin-correction-evidence">{b.evidence ?? "—"}</dd>
      </dl>
      {summary && (
        <p className="text-sm text-muted" data-testid="admin-correction-count">
          {b.subject_type === "quiz_question" ? SUBJECT_NOUN.quiz_question : SUBJECT_NOUN.herb}被指出 {summary.total} 次（未处理{" "}
          {summary.open}）
          {summary.total > 1 && (
            <>
              {" · "}
              <Link
                href={feedbackHref({ kind: "content", status: null, subject: summary.key })}
                className="underline"
                data-bug-label="反馈按对象筛选"
              >
                只看这些
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** 按对象汇总：被多人指出、还没处理的排前面（0021 §5.3） */
function SubjectSummaries({ subjects }: { subjects: SubjectSummary[] }) {
  return (
    <section className="card space-y-2" data-testid="admin-correction-subjects">
      <h2 className="font-serif text-lg font-bold">按对象汇总</h2>
      <ol className="divide-y divide-line text-sm">
        {subjects.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-testid="admin-correction-subject-row">
            <Link
              href={feedbackHref({ kind: "content", status: null, subject: s.key })}
              className="min-w-0 break-all hover:text-cinnabar"
              data-bug-label="反馈按对象筛选"
            >
              <span className="text-muted">{s.subjectType === "herb" ? "药材" : `题目 ${s.subjectId}`}</span> {s.label}
            </Link>
            <span className="text-muted" data-testid="admin-correction-subject-count">
              被指出 {s.total} 次 · 未处理 {s.open}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
