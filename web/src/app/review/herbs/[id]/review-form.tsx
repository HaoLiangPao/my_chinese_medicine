"use client";

import { useActionState } from "react";
import { NATURES, TOXICITY, type Monograph } from "@/lib/herb-monograph";
import { reviewHerb, type ReviewState } from "../actions";

/** 一味药的资料：每个字段都能改；三个按钮（docs/design/0010 §3.2） */
export function ReviewForm({ m, inherited }: { m: Monograph; inherited: Partial<Record<string, string>> | null }) {
  const isProcessed = inherited !== null;
  const [state, action, pending] = useActionState<ReviewState, FormData>(reviewHerb, {});
  // 提交后 React 会把表单重置成 defaultValue：报错时用刚提交的值，免得审核人改的内容丢掉
  const v = (name: string, value: string | null) => state.values?.[name] ?? value ?? "";
  const field = (name: string, label: string, value: string | null, opts: { long?: boolean; hint?: string } = {}) => {
    // 炮制品空着的字段显示原药材的：审核人要看到继承下来的内容
    const from = inherited?.[name];
    const placeholder = from ? `空着 = 同原药材：${from}` : undefined;
    return (
      <div>
        <label className="label" htmlFor={name}>
          {label}
        </label>
        {opts.long ? (
          <textarea id={name} name={name} defaultValue={v(name, value)} placeholder={placeholder} rows={2} className="input min-h-16" />
        ) : (
          <input id={name} name={name} defaultValue={v(name, value)} placeholder={placeholder} className="input" />
        )}
        {opts.hint && <p className="mt-1 text-xs text-muted">{opts.hint}</p>}
      </div>
    );
  };

  return (
    <form action={action} className="card space-y-3" data-testid="review-form">
      <input type="hidden" name="herb_id" value={m.herb_id} />
      <div className="grid gap-3 sm:grid-cols-3">
        {field("flavors", "味", m.flavors.join("、"), { hint: "用顿号分开，如：甘、微苦" })}
        <div>
          <label className="label" htmlFor="nature">
            性
          </label>
          <select id="nature" name="nature" defaultValue={v("nature", m.nature)} className="input">
            {NATURES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        {field("meridians", "归经", m.meridians.join("、"), { hint: "如：心、肺、胃" })}
      </div>
      {field("traditional_use", "传统用途", m.traditional_use, { long: true, hint: "不写用量" })}
      <div>
        <label className="label" htmlFor="toxicity">
          毒性
        </label>
        <select id="toxicity" name="toxicity" defaultValue={v("toxicity", m.toxicity)} className="input">
          {isProcessed && <option value="">同原药材{inherited?.toxicity ? `（${inherited.toxicity}）` : ""}</option>}
          {Object.entries(TOXICITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {field("cautions", "使用注意", m.cautions, { long: true })}
      {field("source", "来源", m.source, { long: true })}
      {field("latin_name", "拉丁名", m.latin_name)}
      {field("processing", "炮制", m.processing)}
      {field("regions", "道地产区", m.regions)}
      {field("quality", "选品", m.quality, { long: true })}
      {field("storage", "保存", m.storage)}

      {state.error && (
        <p className="text-sm text-cinnabar" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-sm text-jade" role="status">
          {state.ok}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button name="action" value="approve" disabled={pending} className="btn-primary min-h-11 flex-1">
          通过，下一味
        </button>
        <button name="action" value="save" disabled={pending} className="btn-ghost min-h-11">
          先存着
        </button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">有问题？</summary>
        <div className="mt-2 space-y-2">
          <textarea
            name="note"
            aria-label="问题备注"
            defaultValue={v("note", null)}
            placeholder="写一句是什么问题，我们来处理"
            rows={2}
            className="input"
          />
          <button name="action" value="flag" disabled={pending} className="btn-ghost">
            记下问题
          </button>
        </div>
      </details>
    </form>
  );
}
