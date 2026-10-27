import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * 当前请求的 Supabase client + 用户 + workspace。
 * 第一次登录时自动建一个「我们家」workspace。
 */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const { data: ws, error: wsErr } = await supabase.rpc("ensure_default_workspace");
  if (wsErr) throw new Error(`无法获取 workspace：${wsErr.message}`);

  return { supabase, user: data.user, workspaceId: ws as string };
});
