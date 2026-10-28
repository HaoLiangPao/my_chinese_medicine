"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/format";

export type LoginState = { error?: string; info?: string };

export async function authenticate(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = str(form.get("email"));
  const password = str(form.get("password"));
  const mode = form.get("mode");
  if (!email || !password) return { error: "请填写邮箱和密码" };

  const supabase = await createClient();
  if (mode === "signup") {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { info: "注册成功，请去邮箱点确认链接后再登录。" };
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
