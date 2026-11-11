"use client";

import { useActionState } from "react";
import { authenticate, type LoginState } from "./actions";
import { AccountKindFields } from "./account-kind-fields";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(authenticate, {});

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="mb-1 text-center font-serif text-3xl font-bold text-cinnabar">药柜</h1>
      <p className="mb-6 text-center text-sm text-muted">记下每一张方子、每一罐药材</p>
      <form action={action} className="card space-y-3">
        <div>
          <label className="label" htmlFor="email">
            邮箱
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            密码
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} className="input" />
        </div>
        <details open={state.needsKind || undefined} className="border-t border-line pt-3">
          <summary data-bug-label="第一次用？" className="cursor-pointer text-sm text-muted">
            第一次用？先选你是病人还是医生，再点「注册」
          </summary>
          <div className="mt-2">
            <AccountKindFields />
          </div>
        </details>
        {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
        {state.info && <p className="text-sm text-jade">{state.info}</p>}
        <div className="flex gap-2 pt-1">
          <button data-bug-label="登录" name="mode" value="signin" disabled={pending} className="btn-primary flex-1">
            登录
          </button>
          <button data-bug-label="注册" name="mode" value="signup" disabled={pending} className="btn-ghost flex-1">
            注册
          </button>
        </div>
      </form>
    </div>
  );
}
