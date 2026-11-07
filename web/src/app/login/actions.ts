"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/format";
import { invalidateAll } from "@/lib/invalidate";
import { isAccountKind } from "@/lib/terms";

export type LoginState = { error?: string; info?: string; needsKind?: boolean };

export async function authenticate(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = str(form.get("email"));
  const password = str(form.get("password"));
  const mode = form.get("mode");
  if (!email || !password) return { error: "请填写邮箱和密码" };

  const supabase = await createClient();
  if (mode === "signup") {
    const kind = form.get("account_kind");
    const clinicName = str(form.get("clinic_name"));
    if (!isAccountKind(kind)) return { error: "请选择：你是病人还是医生", needsKind: true };
    if (kind === "clinic" && !clinicName) return { error: "请填写诊所名称", needsKind: true };
    // 写进 user_metadata 只是为了邮箱确认后在选择页预选；真正生效的是 choose_account_kind
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { account_kind: kind, clinic_name: clinicName ?? null } },
    });
    if (error) return { error: error.message };
    if (!data.session) return { info: "注册成功，请去邮箱点确认链接后再登录。" };
    const { error: kindErr } = await supabase.rpc("choose_account_kind", { p_kind: kind, clinic_name: clinicName ?? null });
    // 账号已经建好了，不能退回注册表单（再注册会提示已存在）：去选择页提示重选
    if (kindErr) redirect("/welcome?retry=1");
    invalidateAll();
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "邮箱或密码不对" };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
