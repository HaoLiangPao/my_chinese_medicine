"use client";

import { useActionState } from "react";
import type { AccountKind } from "@/lib/terms";
import { AccountKindFields } from "../login/account-kind-fields";
import { signOut } from "../login/actions";
import { chooseAccountKind, type WelcomeState } from "./actions";

export function WelcomeForm(props: {
  email: string;
  retry: boolean;
  defaultKind: AccountKind | null;
  defaultClinicName: string | null;
  hasClinic: boolean;
  hasBoth: boolean;
}) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(chooseAccountKind, {});
  return (
    <div className="space-y-3">
      <form action={action} className="card space-y-3" data-testid="welcome">
        {props.retry && !state.error && (
          <p className="text-sm text-cinnabar" data-testid="retry">
            账号注册好了，但账号类型没有保存成功，请再选一次。
          </p>
        )}
        {props.hasBoth && (
          <p className="rounded-md bg-paper p-2 text-sm" data-testid="has-both">
            你现在同时有家庭药柜和诊所。选了一种以后，另一种会隐藏起来（数据不删）。两种都要用的话，用另一个邮箱再注册一个账号。
          </p>
        )}
        <AccountKindFields defaultKind={props.defaultKind} defaultClinicName={props.defaultClinicName} needsClinicName={!props.hasClinic} />
        {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
        <button data-bug-label="确定账号类型" disabled={pending} className="btn-primary w-full">
          确定
        </button>
      </form>
      <form action={signOut} className="text-center">
        <button data-bug-label="退出登录" className="text-sm text-muted underline">
          退出登录 {props.email}
        </button>
      </form>
    </div>
  );
}
