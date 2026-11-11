"use client";

import type { ReactNode } from "react";

/** 提交前弹一次确认框（用于删除等不可撤销操作） */
export function ConfirmButton({
  message,
  className,
  children,
  "data-bug-label": bugLabel,
}: {
  message: string;
  className?: string;
  children: ReactNode;
  /** Bug 反馈的操作记录里记的名字（docs/design/0014 §4）：只能是写死的字 */
  "data-bug-label"?: string;
}) {
  return (
    <button
      className={className}
      data-bug-label={bugLabel}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
