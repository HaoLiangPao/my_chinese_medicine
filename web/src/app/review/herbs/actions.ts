"use server";

import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { invalidateAll } from "@/lib/invalidate";
import { str } from "@/lib/format";
import { checkMonograph, nextPending, parseMonographForm } from "@/lib/herb-monograph";
import { listForReview } from "./data";

/** values：刚提交的表单内容。表单提交后 React 会重置成默认值，报错时用它把审核人填的内容放回去 */
export type ReviewState = { error?: string; ok?: string; values?: Record<string, string> };

/** 核对页的三个按钮：通过 / 先存着 / 有问题（docs/design/0010 §3.2） */
export async function reviewHerb(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  const { supabase } = await getContext();
  const herbId = String(form.get("herb_id") ?? "");
  const action = String(form.get("action") ?? "");
  const note = str(form.get("note"));
  const values = Object.fromEntries([...form.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string")) as Record<string, string>;

  const content = action === "flag" ? null : parseMonographForm(form);
  const problem = content && checkMonograph(content);
  if (problem) return { error: problem, values };
  const { error } = await supabase.rpc("review_herb_monograph", { p_herb_id: herbId, p_content: content ?? {}, p_action: action, p_note: note });
  if (error) return { error: error.message, values };
  invalidateAll();

  if (action === "flag") return { ok: "已记下，我们会处理。", values: { ...values, note: "" } };
  if (action === "save") return { ok: "已保存（还是草稿）。" };
  // 已经通过了；找下一味失败也不要显示出错页，回到列表
  let next: string | null = null;
  try {
    next = nextPending(await listForReview(supabase), herbId);
  } catch {
    redirect("/review/herbs");
  }
  redirect(next ? `/review/herbs/${next}?approved=${herbId}` : "/review/herbs?filter=all&done=1");
}
