import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 当前请求的 Supabase client + 用户 + workspace。
 * 第一次登录时自动建一个「我们家」workspace。
 */
export const getContext = cache(async () => {
  // 读 session 要用到当前时间（token 过期判断），必须在请求时执行，不能进预渲染
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const { data: ws, error: wsErr } = await supabase.rpc("ensure_default_workspace");
  if (wsErr) throw new Error(`无法获取 workspace：${wsErr.message}`);

  const { data: w } = await supabase.from("workspaces").select("name, kind").eq("id", ws).single();
  return {
    supabase,
    user: data.user,
    workspaceId: ws as string,
    workspaceName: (w?.name as string | undefined) ?? "",
    workspaceKind: ((w?.kind as string | undefined) ?? "household") as "household" | "clinic",
  };
});

/** 可选登录（公开页面的导航用）：没登录返回 null，不跳转 */
export const getOptionalContext = cache(async () => {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: ws } = await supabase.rpc("my_workspaces");
  const active = ((ws ?? []) as { kind: string; is_active: boolean; name: string }[]).find((w) => w.is_active);
  return { user: data.user, kind: active?.kind ?? "household", name: active?.name ?? "" };
});
