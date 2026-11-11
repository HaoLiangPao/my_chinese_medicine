"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { patientReuseSources } from "../actions";
import { filterSources, herbSummary, sourceLabel, type ReuseScope, type ReuseSource } from "@/lib/rx-reuse";

const SCOPES: { scope: ReuseScope; label: string }[] = [
  { scope: "templates", label: "预设药方" },
  { scope: "patient", label: "当前病人的" },
  { scope: "all", label: "全部处方" },
];

/**
 * 「从已有药方开始」（IDEA-3，docs/design/0013 §3.1）：选一个预设药方或一张以前的处方，药材导入开方表单。
 * 「全部处方」只显示日期和药材组成，不显示病人（数据里也没有病人名字）。
 * 和 A–Z 选药一样用原生 <dialog> + portal（不在开方的 <form> 里，搜索框按 Enter 不会提交处方）。
 */
export function ReusePicker({
  sources,
  recentLimit,
  patientId,
  onPick,
}: {
  sources: ReuseSource[];
  recentLimit: number;
  patientId: string | null;
  onPick: (s: ReuseSource) => void;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ReuseScope>("templates");
  const [q, setQ] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const picked = useRef<ReuseSource | null>(null);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  // 「当前病人的」：页面只带了 URL 里那个病人的全部处方；开方时换了病人，就按需加载这个病人的
  const [loaded, setLoaded] = useState<Record<string, ReuseSource[]>>({});
  const [loading, startLoading] = useTransition();
  const [loadFailed, setLoadFailed] = useState<string | null>(null); // 加载失败的病人 id
  const ensurePatient = () => {
    if (!patientId || loaded[patientId]) return;
    const id = patientId;
    setLoadFailed(null);
    startLoading(async () => {
      // 出错（断网、数据库报错）只在面板里提示，不能让整个开方页变成错误页：正在填的处方会丢
      try {
        const more = await patientReuseSources(id);
        setLoaded((m) => ({ ...m, [id]: more }));
      } catch {
        setLoadFailed(id);
      }
    });
  };
  const all = useMemo(() => {
    const seen = new Set(sources.map((s) => `${s.kind}:${s.id}`));
    return [
      ...sources,
      ...Object.values(loaded)
        .flat()
        .filter((s) => !seen.has(`${s.kind}:${s.id}`)),
    ];
  }, [sources, loaded]);
  const list = useMemo(() => filterSources(all, scope, patientId, q), [all, scope, patientId, q]);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  const close = () => dialogRef.current?.close();
  const onClosed = () => {
    setOpen(false);
    setQ("");
    // 关上以后再交给表单（焦点先回到打开按钮，表单再处理），和 A–Z 选药一样
    if (picked.current) onPick(picked.current);
    picked.current = null;
  };
  const pick = (s: ReuseSource) => {
    picked.current = s;
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (scope === "patient") ensurePatient();
        }}
        disabled={!hydrated}
        className="btn-ghost w-full"
        data-testid="reuse-open"
      >
        从已有药方开始
      </button>
      {hydrated &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-label="从已有药方开始"
            data-testid="reuse-picker"
            onClose={onClosed}
            onClick={(e) => e.target === e.currentTarget && close()}
            className="fixed inset-x-0 top-auto bottom-0 mx-auto mb-0 max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-card p-0 text-ink shadow-xl backdrop:bg-black/40 open:flex"
          >
            {open && (
              <>
                <div className="space-y-2 border-b border-line p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.preventDefault()}
                      placeholder="搜预设名字或药材，如：黄芪"
                      aria-label="搜药方"
                      className="input flex-1"
                    />
                    <button type="button" onClick={close} className="btn-ghost min-h-11 shrink-0">
                      关闭
                    </button>
                  </div>
                  <div className="flex gap-1" role="group" aria-label="范围">
                    {SCOPES.map((s) => (
                      <button
                        key={s.scope}
                        type="button"
                        aria-pressed={scope === s.scope}
                        onClick={() => {
                          setScope(s.scope);
                          if (s.scope === "patient") ensurePatient();
                        }}
                        className={`btn min-h-10 flex-1 text-sm ${scope === s.scope ? "border border-cinnabar bg-cinnabar text-white" : "btn-ghost"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="reuse-list">
                  {scope === "patient" && loading && <li className="p-4 text-sm text-muted">加载中…</li>}
                  {scope === "patient" && !loading && patientId && loadFailed === patientId && (
                    <li className="flex items-center justify-between gap-2 p-4 text-sm text-cinnabar" role="alert">
                      这个病人更早的处方没加载出来（下面只有最近的）。
                      <button type="button" onClick={ensurePatient} className="btn-ghost min-h-11 shrink-0">
                        重试
                      </button>
                    </li>
                  )}
                  {list.length === 0 && !(scope === "patient" && (loading || (patientId !== null && loadFailed === patientId))) && (
                    <li className="p-4 text-sm text-muted">
                      {scope === "patient" && !patientId
                        ? "先选一个病人，这里会列出他以前的处方。"
                        : scope === "templates" && !q.trim()
                          ? "还没有预设药方。开方保存时可以勾「存成预设药方」。"
                          : "没有找到。"}
                    </li>
                  )}
                  {list.map((s) => (
                    <li key={`${s.kind}-${s.id}`} className="border-b border-line last:border-0">
                      <button
                        type="button"
                        onClick={() => pick(s)}
                        className="w-full space-y-0.5 px-4 py-3 text-left hover:bg-paper"
                        data-testid="reuse-item"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{sourceLabel(s)}</span>
                          <span className="shrink-0 text-xs text-muted">
                            {s.kind === "template" ? (s.useCount ? `用过 ${s.useCount} 次` : "还没用过") : `${s.doses} 剂`}
                          </span>
                        </span>
                        <span className="block text-sm text-muted">{herbSummary(s.lines)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1 border-t border-line p-2 text-center text-sm">
                  {scope === "all" && (
                    <p className="text-xs text-muted">只列最近 {recentLimit} 张；更早的在病人的病历里找，或者选「当前病人的」。</p>
                  )}
                  {/* 新标签页打开：这边正在开的方子不会丢 */}
                  <Link href="/clinic/templates" target="_blank" rel="noopener" className="text-muted underline">
                    管理预设药方（新标签页）
                  </Link>
                </div>
              </>
            )}
          </dialog>,
          document.body,
        )}
    </>
  );
}

const noopSubscribe = () => () => {};
