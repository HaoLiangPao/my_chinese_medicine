"use client";

import { useState } from "react";

/** 发给病人的微信消息：显示 + 一键复制 */
export function MessageBox({ text, highlight }: { text: string; highlight?: boolean }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      // 不支持剪贴板时，选中文字让用户自己复制
      const el = document.getElementById("wechat-message") as HTMLTextAreaElement | null;
      el?.select();
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 2500);
  };
  return (
    <div className={`card space-y-2 ${highlight ? "border-2 border-jade" : ""}`} data-testid="message-box">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg font-bold">发给病人的消息</h2>
        <button type="button" onClick={copy} className="btn-primary py-1">
          {copied === "ok" ? "已复制 ✓" : copied === "fail" ? "已选中，请手动复制" : "复制，粘贴到微信"}
        </button>
      </div>
      {highlight && <p className="text-sm text-jade">处方已保存。复制下面的消息发给病人。</p>}
      <textarea
        id="wechat-message"
        readOnly
        value={text}
        rows={text.split("\n").length + 1}
        className="input font-mono text-sm leading-relaxed"
        data-testid="wechat-message"
        aria-label="微信消息"
      />
      <p className="text-xs text-muted">消息里没有价格。</p>
    </div>
  );
}
