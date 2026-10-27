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

  return { supabase, user: data.user, workspaceId: ws as string };
});
