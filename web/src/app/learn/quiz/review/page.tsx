import Link from "next/link";
import type { Metadata } from "next";
import { dueForReview, QUIZ_BATCH, REVIEW_INTERVALS } from "@/lib/quiz";
import { loadBank, loadMyAttempts, quizContext, summarize } from "../data";
import { QuizRunner } from "../quiz-runner";

export const metadata: Metadata = { title: "复习 · 药柜学堂" };

/** 复习（docs/design/0020 §5）：今天到期的错题，一组 5 题。要登录 */
export default async function ReviewPage() {
  const { supabase, userId, today } = await quizContext();
  const header = (
    <div>
      <Link href="/learn/quiz" className="text-sm text-muted">
        ← 题库
      </Link>
      <h1 className="mt-1 font-serif text-2xl font-bold">复习</h1>
      <p className="mt-1 text-sm text-muted">
        答错的题过 {REVIEW_INTERVALS[0]} 天再出现；按时答对，间隔拉长到 {REVIEW_INTERVALS.slice(1).join("、")} 天；{REVIEW_INTERVALS.at(-1)}{" "}
        天那次也答对，就算掌握了。
      </p>
    </div>
  );
  if (!userId)
    return (
      <div className="space-y-5">
        {header}
        <div className="card text-sm" data-testid="quiz-login-prompt">
          <Link href="/login" className="text-cinnabar underline">
            登录
          </Link>
          后才能记录作答和复习。
        </div>
      </div>
    );

  const bank = await loadBank(supabase);
  const byId = new Map(bank.map((q) => [q.id, q]));
  const { review } = summarize(await loadMyAttempts(supabase), today);
  const due = dueForReview(review, Infinity).filter((id) => byId.has(id));
  const next = [...review.values()]
    .filter((s) => s.status === "waiting" && byId.has(s.questionId))
    .map((s) => s.dueDay!)
    .sort()[0];

  return (
    <div className="space-y-5">
      {header}
      {due.length > 0 ? (
        <>
          <p className="text-sm" data-testid="review-due">
            今天要复习 <b className="text-cinnabar">{due.length}</b> 题
          </p>
          <QuizRunner initial={due.slice(0, QUIZ_BATCH).map((id) => byId.get(id)!)} mode="review" topic={null} loggedIn />
        </>
      ) : (
        <div className="card text-center text-sm text-muted" data-testid="quiz-empty">
          今天没有要复习的题。
          {next && <div className="mt-1">下一次复习：{next.replace(/^\d{4}-0?(\d+)-0?(\d+)$/, "$1 月 $2 日")}</div>}
          <div className="mt-2">
            <Link href="/learn/quiz" className="text-cinnabar">
              去练一练 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
