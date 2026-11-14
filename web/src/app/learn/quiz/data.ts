import "server-only";
import { connection } from "next/server";
import { getOptionalContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dailyQuestionId, dailyStreak, reviewStates, torontoDay, type QuizAttempt, type QuizMode } from "@/lib/quiz";

/** 学堂题库的读取（docs/design/0020）。学堂是公开的：没登录也能读题，只是不读、不记作答 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 发给浏览器的题：没有答案和解析（答完由 answerQuestion 返回） */
export type PublicQuestion = { id: string; kind: "single" | "judge"; stem: string; options: string[]; topics: string[]; status: string };
export type Reveal = { answer: number; explanation: string; source: string };
export type AttemptRow = {
  question_id: string;
  chosen: number;
  correct: boolean;
  mode: QuizMode;
  daily_day: string | null;
  answered_at: string;
};

const PUBLIC_COLS = "id, kind, stem, options, topics, status";

/** 当前请求：Supabase client + 登录用户 id（没登录是 null）+ 今天（多伦多） */
export async function quizContext() {
  await connection(); // 每日一题跟着日期变，不能预渲染
  const ctx = await getOptionalContext();
  return { supabase: await createClient(), userId: ctx?.user.id ?? null, today: torontoDay() };
}

/** 题库里还在用的题（不含下架的），按 id 排 */
export async function loadBank(supabase: Supabase): Promise<PublicQuestion[]> {
  const { data, error } = await supabase.from("quiz_questions").select(PUBLIC_COLS).neq("status", "retired").order("id");
  if (error) throw new Error(`读题库失败：${error.message}`);
  return (data ?? []) as PublicQuestion[];
}

export async function loadReveals(supabase: Supabase, ids: string[]): Promise<Map<string, Reveal>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("quiz_questions").select("id, answer, explanation, source").in("id", ids);
  if (error) throw new Error(`读解析失败：${error.message}`);
  return new Map(
    (data ?? []).map((r) => [
      r.id as string,
      { answer: r.answer as number, explanation: r.explanation as string, source: r.source as string },
    ]),
  );
}

/** 自己的全部作答，按时间排（RLS 只给自己的） */
export async function loadMyAttempts(supabase: Supabase): Promise<AttemptRow[]> {
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("question_id, chosen, correct, mode, daily_day, answered_at")
    .order("answered_at")
    .limit(10_000);
  if (error) throw new Error(`读作答记录失败：${error.message}`);
  return (data ?? []) as AttemptRow[];
}

export const toQuizAttempts = (rows: AttemptRow[]): QuizAttempt[] =>
  rows.map((r) => ({ questionId: r.question_id, correct: r.correct, answeredAt: r.answered_at }));

export function todaysQuestionId(bank: PublicQuestion[], today: string) {
  return dailyQuestionId(
    bank.map((q) => q.id),
    today,
  );
}

/** 自己的学习概况：打卡天数、今天的每日一题记录、复习状态、做过的题 */
export function summarize(attempts: AttemptRow[], today: string) {
  const daily = attempts.filter((a) => a.daily_day);
  return {
    streak: dailyStreak(
      daily.map((a) => a.daily_day!),
      today,
    ),
    todayDaily: daily.find((a) => a.daily_day === today) ?? null,
    review: reviewStates(toQuizAttempts(attempts), today),
    answered: new Set(attempts.map((a) => a.question_id)),
  };
}
