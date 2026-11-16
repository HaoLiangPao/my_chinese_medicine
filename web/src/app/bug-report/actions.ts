"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invalidateAll } from "@/lib/invalidate";
import { normalizeBugReport } from "@/lib/bug-report";
import { normalizeCorrection } from "@/lib/content-correction";
import { notifyBugReport } from "@/lib/bug-notify";

/**
 * 应用内 Bug 反馈（docs/design/0014）和信息纠错（docs/design/0021）。
 * 权限、每天 20 条的上限（两种共用）都在数据库里（RLS、列级授权、触发器）
 */

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
      app_version: appVersion(),
      recent_actions: report.actions,
      recent_errors: report.errors,
    })
    .select("id, created_at")
    .single<{ id: string; created_at: string }>();
  if (error || !data) return insertFailed(error?.message);

  // 响应发出去以后再通知，不拖慢用户；没配置 SLACK_BUG_WEBHOOK_URL 时什么都不做。通知里不带描述
  after(() => notifyBugReport({ id: data.id, pagePath: report.pagePath, createdAt: data.created_at }));
  invalidateAll();
  return { ok: true, id: data.id };
}

const appVersion = () => (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "").slice(0, 64) || null;

function insertFailed(message: string | undefined): BugReportResult {
  if (message?.includes("今天的反馈次数已用完"))
    return { ok: false, error: "今天的反馈次数已用完（每天 20 条），明天再试。写的内容还在。" };
  console.error("bug_reports 写入失败", message);
  return { ok: false, error: "没存上，请再试一次。写的内容还在。" };
}

/**
 * 信息纠错：指出一味药 / 一道题的某一项有误（docs/design/0021）。
 * 不带操作记录、前端错误、浏览器、药柜（数据库的 check 约束也挡着）；对象必须存在（外键 + RLS）
 */
export async function submitCorrection(raw: unknown): Promise<BugReportResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "登录已过期。写的内容还在，重新登录后可以再提交。" };

  const parsed = normalizeCorrection(raw);
  if (!parsed.ok) return parsed;
  const c = parsed.value;

  const { data, error } = await supabase
    .from("bug_reports")
    .insert({
      kind: "content",
      subject_type: c.subjectType,
      subject_herb_id: c.subjectType === "herb" ? c.subjectId : null,
      subject_question_id: c.subjectType === "quiz_question" ? c.subjectId : null,
      field: c.field,
      description: c.description,
      evidence: c.evidence,
      page_path: c.pagePath,
      app_version: appVersion(),
    })
    .select("id, created_at")
    .single<{ id: string; created_at: string }>();
  if (error || !data) {
    // 外键：药 / 题已经不在了（比如刚被合并、下架后删除）
    if (error?.code === "23503") return { ok: false, error: "找不到这味药 / 这道题，可能刚被改过。刷新页面再试。" };
    return insertFailed(error?.message);
  }

  after(() => notifyBugReport({ id: data.id, pagePath: c.pagePath, createdAt: data.created_at, kind: "content" }));
  invalidateAll();
  return { ok: true, id: data.id };
}
