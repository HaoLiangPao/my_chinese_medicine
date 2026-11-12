"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invalidateAll } from "@/lib/invalidate";
import { normalizeBugReport } from "@/lib/bug-report";
import { notifyBugReport } from "@/lib/bug-notify";

/** 应用内 Bug 反馈（docs/design/0014）。权限、每天 20 条的上限都在数据库里（RLS、列级授权、触发器） */

export type BugReportResult = { ok: true; id: string } | { ok: false; error: string };

export async function submitBugReport(raw: unknown): Promise<BugReportResult> {
  const supabase = await createClient();
  // 不用 getContext()：没登录时它会跳到登录页，面板里写的内容就看不到失败原因了；还没选账号类型的用户也能反馈
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "登录已过期。写的内容还在，重新登录后可以再提交。" };

  // 不信任浏览器：条数、长度、脱敏在这里再做一遍
  const report = normalizeBugReport(raw);
  if (!report.description) return { ok: false, error: "请写一下遇到了什么问题" };

  const { data: ctx } = await supabase.rpc("current_context");
  const workspaceId = (ctx as { workspace_id: string | null }[] | null)?.[0]?.workspace_id ?? null;

  const { data, error } = await supabase
    .from("bug_reports")
    .insert({
      workspace_id: workspaceId,
      page_path: report.pagePath,
      description: report.description,
      user_agent: report.userAgent,
      viewport: report.viewport,
      app_version: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "").slice(0, 64) || null,
      recent_actions: report.actions,
      recent_errors: report.errors,
    })
    .select("id, created_at")
    .single<{ id: string; created_at: string }>();
  if (error || !data) {
    if (error?.message.includes("今天的反馈次数已用完"))
      return { ok: false, error: "今天的反馈次数已用完（每天 20 条），明天再试。写的内容还在。" };
    console.error("bug_reports 写入失败", error?.message);
    return { ok: false, error: "没存上，请再试一次。写的内容还在。" };
  }

  // 响应发出去以后再通知，不拖慢用户；没配置 SLACK_BUG_WEBHOOK_URL 时什么都不做。通知里不带描述
  after(() => notifyBugReport({ id: data.id, pagePath: report.pagePath, createdAt: data.created_at }));
  invalidateAll();
  return { ok: true, id: data.id };
}
