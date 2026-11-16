"use client";

import { CORRECTION_EVENT, type CorrectionSubject } from "@/lib/content-correction";

/**
 * 「信息有误？」/「这题有误？」（docs/design/0021 §5.1）。点了发一个浏览器事件，
 * 根布局里的反馈面板（components/bug-report.tsx）收到后打开纠错的样子，带上这味药 / 这道题。
 * 只在登录后放：没登录时反馈面板不在页面上。
 */
export function CorrectionButton({ subject, children, className }: { subject: CorrectionSubject; children: string; className?: string }) {
  return (
    <button
      type="button"
      data-bug-label="指出信息错误"
      data-testid="correction-open"
      onClick={() => window.dispatchEvent(new CustomEvent(CORRECTION_EVENT, { detail: subject }))}
      className={`inline-flex min-h-11 items-center text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-cinnabar ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
