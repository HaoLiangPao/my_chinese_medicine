"use client";

import { useActionState, useState } from "react";
import { renameTemplate, type TemplateState } from "./actions";

export function RenameForm({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  // 受控输入：出错时 React 会重置表单，不受控的输入框会被清空
  const [value, setValue] = useState(name);
  // 改好了就收起来；下次点「改名」重新打开
  const [state, action, pending] = useActionState<TemplateState, FormData>(async (prev, form) => {
    const result = await renameTemplate(prev, form);
    if (result.ok) setEditing(false);
    return result;
  }, {});
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="btn-ghost min-h-11 text-sm">
        改名
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={40}
        aria-label="新名字"
        className="input w-48"
      />
      <button disabled={pending} className="btn-primary min-h-11 text-sm">
        保存
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted underline">
        取消
      </button>
      {state.error && <span className="w-full text-sm text-cinnabar">{state.error}</span>}
    </form>
  );
}
