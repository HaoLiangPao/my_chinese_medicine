"use client";

import { useActionState } from "react";
import { authenticate, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(authenticate, {});

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="mb-1 text-center font-serif text-3xl font-bold text-cinnabar">药柜</h1>
      <p className="mb-6 text-center text-sm text-muted">记下每一张方子、每一罐药材</p>
      <form action={action} className="card space-y-3">
        <div>
          <label className="label" htmlFor="email">邮箱</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">密码</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} className="input" />
        </div>
        {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
        {state.info && <p className="text-sm text-jade">{state.info}</p>}
        <div className="flex gap-2 pt-1">
          <button name="mode" value="signin" disabled={pending} className="btn-primary flex-1">登录</button>
          <button name="mode" value="signup" disabled={pending} className="btn-ghost flex-1">注册</button>
        </div>
      </form>
    </div>
  );
}
