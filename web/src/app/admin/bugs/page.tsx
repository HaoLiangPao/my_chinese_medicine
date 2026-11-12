import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { bugActions, bugErrors } from "@/lib/admin-stats";
import { requireAdmin, rows, formatTime } from "../admin";
import { setBugStatus } from "./actions";

const STATUS: Record<string, string> = { new: "新", in_progress: "处理中", fixed: "已修", wontfix: "不修" };
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
};

/** IDEA-5 的反馈（docs/design/0014）：按状态看、改状态。描述是用户自己写的，原样显示 */
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

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filter = typeof sp.status === "string" && sp.status in STATUS ? sp.status : null;
  const { supabase } = await requireAdmin();
  const [all, shown] = await Promise.all([
    supabase.rpc("admin_bug_reports", { p_status: null, p_limit: 500 }),
    supabase.rpc("admin_bug_reports", { p_status: filter, p_limit: 100 }),
  ]);
  const counts = rows<Bug>(all).reduce<Record<string, number>>((m, b) => ({ ...m, [b.status]: (m[b.status] ?? 0) + 1 }), {});
  const bugs = rows<Bug>(shown).map((b) => ({ ...b, actions: bugActions(b.recent_actions), errors: bugErrors(b.recent_errors) }));

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="按状态" data-testid="admin-bug-filter">
        {[null, ...Object.keys(STATUS)].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/bugs?status=${s}` : "/admin/bugs"}
            data-bug-label="反馈按状态筛选"
            aria-current={s === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${s === filter ? "border-cinnabar bg-cinnabar text-white" : "border-line text-muted hover:bg-paper"}`}
          >
            {s ? STATUS[s] : "全部"}（{s ? (counts[s] ?? 0) : rows<Bug>(all).length}）
          </Link>
        ))}
      </nav>
      {!bugs.length ? (
        <p className="card text-sm text-muted">没有反馈。</p>
      ) : (
        <ul className="space-y-3" data-testid="admin-bugs">
          {bugs.map((b) => (
            <li key={b.id} className="card space-y-2" data-testid="admin-bug">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[b.status]}`} data-testid="admin-bug-status">
                    {STATUS[b.status]}
                  </span>
                  <code className="break-all" data-testid="admin-bug-path">
                    {b.page_path}
                  </code>
                </span>
                <span className="text-muted">{formatTime(b.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap" data-testid="admin-bug-description">
                {b.description}
              </p>
              <div className="text-sm text-muted">
                提交人：
                <Reporter b={b} />
              </div>
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
              <form action={setBugStatus} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={b.id} />
                <label className="text-sm text-muted">
                  状态{" "}
                  <select name="status" defaultValue={b.status} className="input inline-block w-auto py-1" aria-label="状态">
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
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
