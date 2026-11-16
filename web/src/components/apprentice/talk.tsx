"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { DISCLAIMER, type ApprenticeAction } from "@/lib/apprentice";
import { ApprenticeScene } from "./scenes";

const noopSubscribe = () => () => {};

/**
 * 小学徒 + 说话框（docs/design/0019 §4）。lines 是服务端洗好的顺序，第一次显示第一句，点一下说下一句，
 * 客户端不再随机（服务端和浏览器渲染出来的一样，没有 hydration 不一致）。
 */
export function ApprenticeTalk({
  action,
  lines,
  size = "sm",
  children,
}: {
  action: ApprenticeAction;
  lines: string[];
  size?: "sm" | "md";
  children?: ReactNode;
}) {
  const [i, setI] = useState(0);
  // 浏览器接管以前点了也没反应，先禁用（E2E 也靠它等到能点）
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const line = lines.length ? lines[i % lines.length] : null;
  return (
    <div className="flex items-start gap-1" data-testid="apprentice">
      <ApprenticeScene action={action} className={`shrink-0 ${size === "md" ? "h-24 w-32 sm:h-28 sm:w-[150px]" : "h-20 w-[107px]"}`} />
      <div className="relative mt-1 min-w-0 flex-1">
        {/* 说话框的小尖角，指向小学徒 */}
        <span aria-hidden className="absolute top-4 -left-1.5 h-3 w-3 rotate-45 border-b border-l border-line bg-card" />
        <div className="rounded-xl border border-line bg-card px-3 py-2" aria-live="polite">
          {line && (
            <button
              type="button"
              onClick={() => setI((x) => x + 1)}
              disabled={!ready}
              className="block w-full text-left text-sm leading-relaxed"
              data-bug-label="小学徒换一句"
              data-testid="apprentice-line"
              data-index={i}
              title="点一下换一句"
            >
              {line}
              <span className="ml-1 text-xs whitespace-nowrap text-muted">↻ 换一句</span>
            </button>
          )}
          <p className="mt-1 text-[11px] leading-tight text-muted" data-testid="apprentice-disclaimer">
            {DISCLAIMER}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
