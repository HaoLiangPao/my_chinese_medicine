import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AccountKind } from "@/lib/terms";

type CurrentContext = {
  account_kind: AccountKind | null;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_kind: AccountKind | null;
};

/** 登录用户 + 账号类型 + 当前药柜。没登录返回 null。 */
const loadContext = cache(async () => {
  // 读 session 要用到当前时间（token 过期判断），必须在请求时执行，不能进预渲染
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: rows, error: ctxErr } = await supabase.rpc("current_context");
  if (ctxErr) throw new Error(`无法获取当前药柜：${ctxErr.message}`);
  return { supabase, user: data.user, current: (rows as CurrentContext[])[0] };
});

/**
 * 当前请求的 Supabase client + 用户 + 药柜。
 * 没登录 → 登录页；还没选账号类型 → 选择页（docs/design/0008）。
 */
export const getContext = cache(async () => {
  const ctx = await loadContext();
  if (!ctx) redirect("/login");
  const { supabase, user, current } = ctx;
  if (!current?.account_kind || !current.workspace_id) redirect("/welcome");
  return {
    supabase,
    user,
    accountKind: current.account_kind,
    workspaceId: current.workspace_id,
    workspaceName: current.workspace_name ?? "",
    // 账号类型和当前药柜类型由数据库保证一致
    workspaceKind: (current.workspace_kind ?? current.account_kind) as AccountKind,
  };
});

/** 只有某种账号能打开的页面（布局里调用）：另一种账号显示「找不到这个页面」 */
export async function requireAccountKind(kind: AccountKind) {
  const { accountKind } = await getContext();
  if (accountKind !== kind) notFound();
}

/** 可选登录（公开页面的导航用）：没登录返回 null，不跳转 */
export const getOptionalContext = cache(async () => {
  const ctx = await loadContext();
  if (!ctx) return null;
  return { user: ctx.user, kind: ctx.current?.account_kind ?? null, name: ctx.current?.workspace_name ?? "" };
});

/** 选择页用：已登录用户的账号类型（null = 还没选） */
export const getSignedInUser = cache(async () => {
  const ctx = await loadContext();
  if (!ctx) redirect("/login");
  return ctx;
});
