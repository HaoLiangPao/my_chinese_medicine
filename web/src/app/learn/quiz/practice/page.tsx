import Link from "next/link";
import type { Metadata } from "next";
import { isQuizTopic, pickPractice, QUIZ_BATCH, topicLabel } from "@/lib/quiz";
import { loadBank, loadMyAttempts, quizContext, summarize } from "../data";
import { QuizRunner } from "../quiz-runner";

export const metadata: Metadata = { title: "练一练 · 药柜学堂" };

/** 练一练：按主题随机抽一组（先抽没做过的）。没登录也能练，只是不记录 */
export default async function PracticePage({ searchParams }: PageProps<"/learn/quiz/practice">) {
  const sp = await searchParams;
  const topic = isQuizTopic(sp.topic) ? sp.topic : null;
  const { supabase, userId, today } = await quizContext();
  const bank = (await loadBank(supabase)).filter((q) => !topic || q.topics.includes(topic));
  const answered = userId ? summarize(await loadMyAttempts(supabase), today).answered : new Set<string>();
  const byId = new Map(bank.map((q) => [q.id, q]));
  const questions = pickPractice(
    bank.map((q) => q.id),
    answered,
    QUIZ_BATCH,
  ).map((id) => byId.get(id)!);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/learn/quiz" className="text-sm text-muted">
          ← 题库
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold">练一练 · {topic ? topicLabel(topic) : "全部主题"}</h1>
        <p className="mt-1 text-sm text-muted">每组 {QUIZ_BATCH} 题，先出没做过的。</p>
      </div>
      <QuizRunner initial={questions} mode="practice" topic={topic} loggedIn={!!userId} />
    </div>
  );
}
