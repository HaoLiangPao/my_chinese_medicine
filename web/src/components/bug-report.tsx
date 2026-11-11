"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { submitBugReport } from "@/app/bug-report/actions";
import { clickLabel, LIMITS, pushCapped, sanitizeError, sanitizePath, type BugAction, type BugError } from "@/lib/bug-report";

/**
 * 右下角的「反馈问题」按钮和面板（docs/design/0014 §3、§4）。放在根布局里，登录后每个页面都有。
 *
 * 顺便在内存里记最近的操作和前端错误，提交时带上。只记「去了哪个页面、点了哪个按钮」：
 * 从不读输入框的内容，也不读按钮上的字（上面可能有病人姓名）——按钮只记它的 `data-bug-label`（代码里写死的名字），
 * 没有的只记「（按钮）」；链接只记目标路径。
 */

type Snapshot = { pagePath: string; userAgent: string; viewport: string; actions: BugAction[]; errors: BugError[] };
type Result = { ok: true; id: string } | { ok: false; error: string } | null;

const draftKey = (userId: string) => `bug-report-draft:${userId}`;
// sessionStorage 在隐私模式等情况下可能不能用：草稿只是保险，读写失败都不影响提交
const readDraft = (userId: string) => {
  try {
    return window.sessionStorage.getItem(draftKey(userId)) ?? "";
  } catch {
    return "";
  }
};
const writeDraft = (userId: string, text: string) => {
  try {
    if (text) window.sessionStorage.setItem(draftKey(userId), text);
    else window.sessionStorage.removeItem(draftKey(userId));
  } catch {
    // 见上
  }
};

export function BugReport({ userId }: { userId: string }) {
  const pathname = usePathname();
  const actions = useRef<BugAction[]>([]);
  const errors = useRef<BugError[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  // 去了哪个页面
  useEffect(() => {
    const label = sanitizePath(window.location.pathname + window.location.search);
    actions.current = pushCapped(actions.current, { t: new Date().toISOString(), kind: "nav", label }, LIMITS.actions);
  }, [pathname]);

  // 点了哪个按钮 / 链接；没处理的前端错误
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest("button, a[href], [role=button], summary") : null;
      if (!el || el.closest("[data-bug-report]")) return;
      const label = clickLabel({
        tag: el.tagName,
        bugLabel: el.getAttribute("data-bug-label"),
        href: el instanceof HTMLAnchorElement ? el.href : null,
      });
      actions.current = pushCapped(actions.current, { t: new Date().toISOString(), kind: "click", label }, LIMITS.actions);
    };
    const record = (message: string, stack: string) => {
      errors.current = pushCapped(errors.current, { t: new Date().toISOString(), ...sanitizeError(message, stack) }, LIMITS.errors);
    };
    const onError = (e: ErrorEvent) => record(e.message || String(e.error ?? ""), e.error instanceof Error ? (e.error.stack ?? "") : "");
    const onRejection = (e: PromiseRejectionEvent) => {
      const r: unknown = e.reason;
      record(r instanceof Error ? r.message : String(r), r instanceof Error ? (r.stack ?? "") : "");
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  const show = () => {
    // 打开时定格这一次会带上的内容：面板里展开看到的，就是提交的
    setSnapshot({
      pagePath: sanitizePath(window.location.pathname + window.location.search),
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      actions: actions.current,
      errors: errors.current,
    });
    if (!description) setDescription(readDraft(userId));
    setResult(null);
    setOpen(true);
  };
  const edit = (text: string) => {
    setDescription(text);
    writeDraft(userId, text);
  };
  const submit = () => {
    if (!snapshot || !description.trim()) return;
    startTransition(async () => {
      setResult(null);
      try {
        const res = await submitBugReport({ description, ...snapshot });
        setResult(res);
        if (res.ok) edit("");
      } catch {
        setResult({ ok: false, error: "没发出去（可能是网络问题）。写的内容还在，可以再试一次。" });
      }
    });
  };

  const sent = result?.ok ? result : null;
  return (
    <div data-bug-report className="print:hidden">
      <button
        type="button"
        onClick={show}
        aria-label="反馈问题"
        data-testid="bug-report-open"
        className="fixed right-4 bottom-4 z-20 flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-line bg-card text-sm text-muted shadow-md hover:text-ink sm:px-4"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v11H9l-5 4V5z" />
          <path strokeLinecap="round" d="M12 8v3.5M12 13.6v.1" />
        </svg>
        <span className="hidden sm:inline">反馈问题</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-label="反馈问题"
        data-testid="bug-report-panel"
        onClose={() => setOpen(false)}
        // 点遮罩关闭：按下和松开都在遮罩上才算（在文本框里选字、拖到外面松开不关）
        onMouseDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => e.target === e.currentTarget && downOnBackdrop.current && dialogRef.current?.close()}
        className="fixed inset-x-0 top-auto bottom-0 mx-auto mb-0 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-0 text-ink shadow-xl backdrop:bg-black/40"
      >
        {open && snapshot && (
          <form
            className="space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold">反馈问题</h2>
              <button type="button" onClick={() => dialogRef.current?.close()} className="btn-ghost min-h-11 px-3">
                关闭
              </button>
            </div>
            {sent ? (
              <p role="status" className="rounded-lg bg-paper p-3 text-sm" data-testid="bug-report-ok">
                已收到，谢谢！编号 <b className="font-mono">{sent.id.slice(0, 8)}</b>
              </p>
            ) : (
              <>
                <div>
                  <label htmlFor="bug-report-description" className="label">
                    遇到了什么问题？
                  </label>
                  <textarea
                    id="bug-report-description"
                    value={description}
                    onChange={(e) => edit(e.target.value)}
                    maxLength={LIMITS.description}
                    rows={5}
                    required
                    autoFocus
                    placeholder="比如：点了保存没反应。请不要写病人的姓名、电话。"
                    className="input"
                  />
                </div>
                <details className="rounded-lg bg-paper p-3 text-xs text-muted" data-testid="bug-report-attached">
                  <summary className="cursor-pointer">
                    会附带：当前页面的路径、最近去过的页面和点过的按钮（不含按钮上的字和输入的内容）、最近的出错信息、浏览器型号。点开看这一次带上的内容
                  </summary>
                  <dl className="mt-2 space-y-1 break-all">
                    <dt className="font-medium">页面</dt>
                    <dd>{snapshot.pagePath}</dd>
                    <dt className="font-medium">最近的操作（{snapshot.actions.length}）</dt>
                    {snapshot.actions.map((a, i) => (
                      <dd key={i}>
                        {a.t.slice(11, 19)} {a.kind === "nav" ? "打开" : "点"} {a.label}
                      </dd>
                    ))}
                    <dt className="font-medium">最近的出错信息（{snapshot.errors.length}）</dt>
                    {snapshot.errors.map((e, i) => (
                      <dd key={i} className="whitespace-pre-wrap">
                        {e.t.slice(11, 19)} {e.message}
                        {e.stack && `\n${e.stack}`}
                      </dd>
                    ))}
                    <dt className="font-medium">浏览器</dt>
                    <dd>
                      {snapshot.userAgent}（{snapshot.viewport}）
                    </dd>
                  </dl>
                </details>
                {result && !result.ok && (
                  <p role="alert" className="rounded-lg border border-cinnabar p-3 text-sm text-cinnabar" data-testid="bug-report-error">
                    {result.error}
                  </p>
                )}
                <button className="btn-primary min-h-11 w-full" disabled={pending || !description.trim()}>
                  {pending ? "提交中…" : "提交"}
                </button>
              </>
            )}
          </form>
        )}
      </dialog>
    </div>
  );
}
