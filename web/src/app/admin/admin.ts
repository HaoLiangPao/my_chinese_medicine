import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";

/**
 * 管理员看板的每个页面、每个写操作都先调它（docs/design/0015 §3.4）。
 * layout 和 page 是同时渲染的，只在 layout 里查不够：页面自己也要查，非管理员根本不去调统计函数。
 */
export const requireAdmin = cache(async () => {
  const ctx = await getContext();
  const { data } = await ctx.supabase.rpc("is_platform_admin");
  if (data !== true) notFound();
  return ctx;
});

/** 多伦多的今天 YYYY-MM-DD（和数据库里统计用的时区一致） */
export const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

/** rpc 的结果：出错就抛（显示出错页），否则当成 T[] */
export function rows<T>(r: { data: unknown; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T[];
}

export const formatTime = (t: string) =>
  new Date(t).toLocaleString("zh-CN", { timeZone: "America/Toronto", hour12: false, dateStyle: "short", timeStyle: "short" });
