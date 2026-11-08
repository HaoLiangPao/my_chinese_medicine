"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { buildAzIndex, searchAz, type AzRow } from "@/lib/herb-az";

/**
 * A–Z 通讯录式选药（RX-5）：从底部弹出；上面搜索（汉字 / 全拼 / 首字母 / 别名）；
 * 按药名第一个字分组；右边字母条可以点、也可以按住上下滑。选一味就关上，药加进表单。
 *
 * 用浏览器自带的 <dialog>（showModal）：焦点只在面板里循环、背景不能操作、Esc 关闭（输入法组字时按 Esc 只取消候选词）、
 * 关闭后焦点回到打开按钮；整个面板在最上层，盖得住顶部导航。
 * dialog 挂到 body 下（portal）：放在录方 <form> 里的话，搜索框按 Enter 会提交整张药方。
 */
export function HerbPicker({ rows, aliases, onPick }: { rows: AzRow[]; aliases: Record<string, string>; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const index = useMemo(() => buildAzIndex(rows, aliases), [rows, aliases]);
  const hits = useMemo(() => searchAz(index, q), [index, q]);
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 水合完成前按钮点了没反应：先置灰（和拍照按钮一样）
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    // 弹出时页面本身不跟着滚
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 关上（Esc、点遮罩、关闭按钮、选了药）都走 dialog 的 close 事件
  const close = () => dialogRef.current?.close();
  const picked = useRef<string | null>(null);
  const onClosed = () => {
    setOpen(false);
    setQ("");
    // 选的药在关上以后才交给表单：浏览器先把焦点还给打开按钮，表单再把焦点移到克数框，顺序固定
    if (picked.current) onPick(picked.current);
    picked.current = null;
  };
  const pick = (name: string) => {
    picked.current = name;
    close();
  };
  const jump = (letter: string) => {
    const list = listRef.current;
    const section = list?.querySelector<HTMLElement>(`[data-az-section="${letter}"]`);
    if (!list || !section) return;
    list.scrollTop = section.offsetTop - list.offsetTop;
    setActive(letter);
  };
  // 按住字母条上下滑：手指 / 鼠标下面是哪个字母就跳到哪
  const letterAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.dataset.azLetter;
  const onBarPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const l = letterAt(e.clientX, e.clientY);
    if (l) jump(l);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={!hydrated} className="btn-ghost w-full" data-testid="az-open">
        A–Z 选药
      </button>
      {hydrated &&
        createPortal(
      <dialog
        ref={dialogRef}
        aria-label="选药"
        data-testid="az-picker"
        onClose={onClosed}
        // 点到面板外面（遮罩）就关上
        onClick={(e) => e.target === e.currentTarget && close()}
        className="fixed inset-x-0 top-auto bottom-0 mx-auto mb-0 max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-card p-0 text-ink shadow-xl backdrop:bg-black/40 open:flex"
      >
        {open && (
          <>
            <div className="flex items-center gap-2 border-b border-line p-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                // Enter 选第一条结果（不提交任何表单）；输入法组字时的 Enter 是确认候选词，不算
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (hits[0]) pick(hits[0].entry.name);
                }}
                placeholder="搜药名、拼音、首字母或别名"
                aria-label="搜药材"
                className="input flex-1"
              />
              <button type="button" onClick={close} className="btn-ghost min-h-11 shrink-0">关闭</button>
            </div>

            {q.trim() ? (
              <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="az-results">
                {hits.length === 0 && <li className="p-4 text-sm text-muted">目录里没有「{q.trim()}」。可以直接在表单里输入，保存时会新建。</li>}
                {hits.map(({ entry, via }) => (
                  <li key={entry.name}>
                    <button type="button" onClick={() => pick(entry.name)} className="flex min-h-12 w-full items-center justify-between px-4 text-left hover:bg-paper" data-testid={`az-herb-${entry.name}`}>
                      <span>
                        {via && <span className="text-muted">{via} → </span>}
                        <span className="font-medium">{entry.name}</span>
                      </span>
                      <span className="text-xs text-muted">{entry.pinyin}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="relative flex min-h-0 flex-1">
                <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto pr-10" data-testid="az-list">
                  {index.letters.map((l) => (
                    <section key={l} data-az-section={l} data-testid={`az-group-${l}`}>
                      <h3 className="sticky top-0 bg-paper px-4 py-1 text-xs font-bold text-muted">{l}</h3>
                      <ul>
                        {index.groups[l].map((e) => (
                          <li key={e.name}>
                            <button type="button" onClick={() => pick(e.name)} className="flex min-h-11 w-full items-center justify-between px-4 text-left hover:bg-paper" data-testid={`az-herb-${e.name}`}>
                              <span className="font-medium">{e.name}</span>
                              <span className="text-xs text-muted">{e.pinyin}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
                {/* 字母条：可以点，也可以按住上下滑 */}
                <div
                  role="group"
                  aria-label="按字母跳转"
                  className="absolute inset-y-0 right-0 flex w-10 touch-none select-none flex-col items-center justify-center py-1"
                  onPointerDown={onBarPointer}
                  onPointerMove={onBarPointer}
                  data-testid="az-letter-bar"
                >
                  {index.letters.map((l) => (
                    <button
                      key={l}
                      type="button"
                      data-az-letter={l}
                      onClick={() => jump(l)}
                      aria-label={`跳到 ${l}`}
                      className={`w-full flex-1 text-xs leading-none font-bold ${active === l ? "text-cinnabar" : "text-muted"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </dialog>,
          document.body,
        )}
    </>
  );
}

const noopSubscribe = () => () => {};
