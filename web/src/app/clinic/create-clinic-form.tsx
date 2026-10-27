"use client";

import { useActionState } from "react";
import { createClinic, type ClinicState } from "./actions";

/** 还不在诊所里时显示：创建诊所（之后可以在总览页切换回家里的药柜） */
export function CreateClinicForm({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState<ClinicState, FormData>(createClinic, {});
  return (
    <form action={action} className={compact ? "space-y-2" : "card space-y-3"} data-testid="create-clinic">
      {!compact && (
        <>
          <h2 className="font-serif text-lg font-bold">先创建一个诊所</h2>
          <p className="text-sm text-muted">诊所有自己的病人档案、处方、库存和进货价，和家里的药柜分开。你可以在总览页随时切换。</p>
        </>
      )}
      <div className="flex gap-2">
        <input name="name" required maxLength={40} placeholder="诊所名称，如：李医生诊所" aria-label="诊所名称" className="input" />
        <button disabled={pending} className={compact ? "btn-ghost shrink-0" : "btn-primary shrink-0"}>创建诊所</button>
      </div>
      {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
    </form>
  );
}
