"use server";

import { invalidateAll } from "@/lib/invalidate";
import { dueForReview, isQuizTopic, pickPractice, QUIZ_BATCH, QUIZ_MODES, type QuizMode } from "@/lib/quiz";
import { loadBank, loadMyAttempts, quizContext, summarize, todaysQuestionId, type PublicQuestion } from "./data";

/**
 * 学堂答题（docs/design/0020 §4、§5）。没登录也能答：只返回对错和解析，不记录。
 * 对错在服务器上按题库算（数据库的触发器再算一遍写进记录），浏览器拿不到还没答的题的答案。
 */

export type AnswerResult =
  | {
      ok: true;
      chosen: number;
      correct: boolean;
      answer: number;
      explanation: string;
      source: string;
      /** 记进了自己的作答记录 */
      recorded: boolean;
      /** 每日一题今天已经答过（比如另一个窗口）：以第一次为准 */
      already?: boolean;
      warning?: string;
    }
  | { ok: false; error: string };

export async function answerQuestion(raw: unknown): Promise<AnswerResult> {
  const input = raw as { questionId?: unknown; chosen?: unknown; mode?: unknown } | null;
  const questionId = typeof input?.questionId === "string" && /^[a-z]+-\d{3}$/.test(input.questionId) ? input.questionId : null;
  const chosen = Number.isInteger(input?.chosen) ? (input!.chosen as number) : -1;
  const mode = QUIZ_MODES.includes(input?.mode as QuizMode) ? (input!.mode as QuizMode) : null;
  if (!questionId || chosen < 0 || chosen > 4 || !mode) return { ok: false, error: "提交的内容不对，刷新页面再试" };

  const { supabase, userId, today } = await quizContext();
  const { data: q } = await supabase
    .from("quiz_questions")
    .select("options, answer, explanation, source, status")
    .eq("id", questionId)
    .maybeSingle<{ options: string[]; answer: number; explanation: string; source: string; status: string }>();
  if (!q || q.status === "retired") return { ok: false, error: "这道题已经下架了，刷新页面看看别的题" };
  if (chosen >= q.options.length) return { ok: false, error: "没有这个选项" };
  if (mode === "daily" && todaysQuestionId(await loadBank(supabase), today) !== questionId)
    return { ok: false, error: "日期变了，刷新页面看今天的题" };

  const reveal = { answer: q.answer, explanation: q.explanation, source: q.source };
  const result = { ok: true as const, chosen, correct: chosen === q.answer, ...reveal, recorded: false };
  if (!userId) return result;

  const { error } = await supabase
    .from("quiz_attempts")
    .insert({ question_id: questionId, chosen, mode, daily_day: mode === "daily" ? today : null });
  if (error) {
    if (error.code === "23505") {
      // 每日一题今天已经答过：显示第一次的答案
      const first = (await loadMyAttempts(supabase)).find((a) => a.daily_day === today);
      if (first?.question_id === questionId) {
        invalidateAll();
        return { ...result, chosen: first.chosen, correct: first.correct, already: true };
      }
      // 今天答的是另一题（当天题库变了，0020 §4）：这一题不算
      if (first) return { ...result, warning: "今天已经答过每日一题了，这一题没有再记" };
    }
    if (error.message.includes("答题次数太多")) return { ...result, warning: "今天答题次数太多了，这一题没有记下来，明天再来" };
    console.error("quiz_attempts 写入失败", error.message);
    return { ...result, warning: "这一题没有记下来（网络或日期变了），刷新页面再试" };
  }
  invalidateAll();
  return { ...result, recorded: true };
}

export type DrawResult = { ok: true; questions: PublicQuestion[] } | { ok: false; error: string };

/** 练一练：按主题（不传就是全部）抽一组，先抽没做过的 */
export async function drawPractice(topic: unknown): Promise<DrawResult> {
  if (topic !== null && !isQuizTopic(topic)) return { ok: false, error: "没有这个主题" };
  const { supabase, userId, today } = await quizContext();
  const bank = (await loadBank(supabase)).filter((q) => !topic || q.topics.includes(topic));
  const answered = userId ? summarize(await loadMyAttempts(supabase), today).answered : new Set<string>();
  const byId = new Map(bank.map((q) => [q.id, q]));
  return {
    ok: true,
    questions: pickPractice(
      bank.map((q) => q.id),
      answered,
      QUIZ_BATCH,
    ).map((id) => byId.get(id)!),
  };
}

/** 复习：今天到期的一组（要登录） */
export async function drawReview(): Promise<DrawResult> {
  const { supabase, userId, today } = await quizContext();
  if (!userId) return { ok: false, error: "登录后才能复习" };
  const bank = await loadBank(supabase);
  const byId = new Map(bank.map((q) => [q.id, q]));
  const due = dueForReview(summarize(await loadMyAttempts(supabase), today).review, Infinity).filter((id) => byId.has(id)); // 下架的题不复习
  return { ok: true, questions: due.slice(0, QUIZ_BATCH).map((id) => byId.get(id)!) };
}
