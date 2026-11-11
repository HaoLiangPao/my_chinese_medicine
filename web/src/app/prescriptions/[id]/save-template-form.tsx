"use client";

import { useActionState, useState } from "react";
import { saveTemplateFromPrescription, type TemplateState } from "@/app/clinic/templates/actions";

/** 诊所处方详情页「存成预设药方」（docs/design/0013 §3.4） */
export function SaveTemplateForm({ prescriptionId }: { prescriptionId: string }) {
  const [open, setOpen] = useState(false);
  // 受控输入：出错时 React 会重置表单，不受控的输入框会被清空
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState<TemplateState, FormData>(saveTemplateFromPrescription, {});
  if (state.ok)
    return (
      <p className="text-sm text-jade" role="status">
        {state.ok}
      </p>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost min-h-11 text-sm">
        存成预设药方
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="prescription_id" value={prescriptionId} />
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="预设的名字，如：四君子汤加减"
        aria-label="预设药方的名字"
        className="input w-60"
      />
      <button disabled={pending} className="btn-primary min-h-11 text-sm">
        存
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted underline">
        取消
      </button>
      {state.error && <span className="w-full text-sm text-cinnabar">{state.error}</span>}
    </form>
  );
}
