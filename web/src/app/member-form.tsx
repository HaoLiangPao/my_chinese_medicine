"use client";

import { useActionState } from "react";
import { inviteMember, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember, {});
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="email" type="email" required placeholder="家人的邮箱" aria-label="邀请邮箱" className="input" />
        <button disabled={pending} className="btn-ghost shrink-0">邀请</button>
      </div>
      {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
      {state.ok && <p className="text-sm text-jade">{state.ok}</p>}
    </form>
  );
}
