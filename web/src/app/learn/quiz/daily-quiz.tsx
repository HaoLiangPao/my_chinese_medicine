import Link from "next/link";
import { loadBank, loadMyAttempts, loadReveals, quizContext, summarize, todaysQuestionId } from "./data";
import { QuestionCard } from "./question-card";

/**
 * 学堂首页顶部的「每日一题」（docs/design/0020 §4）。同一天所有人同一题；没登录也能做，只是不记录。
 * 登录用户今天已经答过：显示他答的那一题和结果（当天题库变了也不会换题）。
 */
export async function DailyQuiz() {
  const { supabase, userId, today } = await quizContext();
  const bank = await loadBank(supabase);
  const mine = userId ? summarize(await loadMyAttempts(supabase), today) : null;
  const done = mine?.todayDaily ?? null;
  const questionId = done?.question_id ?? todaysQuestionId(bank, today);
  if (!questionId) return null;

  let question = bank.find((q) => q.id === questionId);
  if (!question && done) {
    // 今天答过以后这题下架了：还是显示答过的那题
    const { data } = await supabase
      .from("quiz_questions")
      .select("id, kind, stem, options, topics, status")
      .eq("id", done.question_id)
      .maybeSingle();
    question = data ?? undefined;
  }
  if (!question) return null;
  const reveal = done ? (await loadReveals(supabase, [done.question_id])).get(done.question_id) : undefined;
  const [, month, day] = today.split("-").map(Number);

  return (
    <section className="card border-cinnabar/40" data-testid="daily-quiz" aria-labelledby="daily-quiz-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="daily-quiz-title" className="font-serif text-lg font-bold">
          每日一题 <span className="text-sm font-normal text-muted">{`${month} 月 ${day} 日`}</span>
        </h2>
        {mine && (
          <span className="text-sm text-muted" data-testid="daily-streak">
            {mine.streak > 0 ? (
              <>
                已连续打卡 <b className="text-cinnabar">{mine.streak}</b> 天
              </>
            ) : (
              "今天答一题就开始打卡"
            )}
          </span>
        )}
      </div>
      <QuestionCard
        key={question.id}
        question={question}
        mode="daily"
        loggedIn={!!userId}
        initial={done && reveal ? { ...reveal, chosen: done.chosen, correct: done.correct } : null}
      />
      <div className="mt-4 border-t border-line pt-3 text-sm">
        <Link href="/learn/quiz" className="text-cinnabar">
          题库：按主题练一练{userId ? "、错题本、复习" : ""} →
        </Link>
      </div>
    </section>
  );
}
