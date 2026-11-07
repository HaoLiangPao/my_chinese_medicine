"use client";

import { useState } from "react";
import type { AccountKind } from "@/lib/terms";

const OPTIONS: { kind: AccountKind; label: string; hint: string }[] = [
  { kind: "household", label: "我是病人", hint: "记自己和家人的药方、管家里的药柜" },
  { kind: "clinic", label: "我是医生", hint: "给病人开方、管诊所的库存" },
];

/** 选账号类型（注册表单、选择页共用）。选诊所时要填诊所名称，除非已经有诊所。 */
export function AccountKindFields({
  defaultKind,
  defaultClinicName,
  needsClinicName = true,
}: {
  defaultKind?: AccountKind | null;
  defaultClinicName?: string | null;
  needsClinicName?: boolean;
}) {
  const [kind, setKind] = useState<AccountKind | null>(defaultKind ?? null);
  return (
    <fieldset className="space-y-2" data-testid="account-kind">
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => (
          <label
            key={o.kind}
            className={`cursor-pointer rounded-lg border p-3 text-sm ${kind === o.kind ? "border-cinnabar bg-paper" : "border-line"}`}
          >
            <input
              type="radio"
              name="account_kind"
              value={o.kind}
              checked={kind === o.kind}
              onChange={() => setKind(o.kind)}
              aria-label={o.label}
              className="mr-1.5 accent-cinnabar"
            />
            <span className="font-medium">{o.label}</span>
            <span className="mt-1 block text-xs text-muted">{o.hint}</span>
          </label>
        ))}
      </div>
      {kind === "clinic" && needsClinicName && (
        <input
          name="clinic_name"
          maxLength={40}
          defaultValue={defaultClinicName ?? ""}
          placeholder="诊所名称，如：李医生诊所"
          aria-label="诊所名称"
          className="input"
        />
      )}
      <p className="text-xs text-muted">选好以后不能更改。两种都要用的话，用另一个邮箱再注册一个账号。</p>
    </fieldset>
  );
}
