"use client";

import { useActionState } from "react";
import { addMember, type MemberState } from "./actions";

export function MemberForm() {
  const [state, action, pending] = useActionState<MemberState, FormData>(addMember, {});
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="email" type="email" required placeholder="家人的注册邮箱" className="input" />
        <button disabled={pending} className="btn-ghost shrink-0">添加</button>
      </div>
      {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
      {state.ok && <p className="text-sm text-jade">{state.ok}</p>}
    </form>
  );
}
