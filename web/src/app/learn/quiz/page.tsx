import Link from "next/link";
import type { Metadata } from "next";
import { dueForReview, topicProgress } from "@/lib/quiz";
import { loadBank, loadMyAttempts, quizContext, summarize } from "./data";

export const metadata: Metadata = { title: "题库 · 药柜学堂" };

/** 题库首页（docs/design/0020 §5）：主题和进度、练一练；登录后有打卡、复习、错题本 */
export default async function QuizHubPage() {
  const { supabase, userId, today } = await quizContext();
  const bank = await loadBank(supabase);
  const mine = userId ? summarize(await loadMyAttempts(supabase), today) : null;
  const progress = topicProgress(bank, mine?.answered ?? new Set());
  const bankIds = new Set(bank.map((q) => q.id));
  const due = mine ? dueForReview(mine.review, Infinity).filter((id) => bankIds.has(id)).length : 0;
  const wrong = mine ? [...mine.review.values()].filter((s) => s.status !== "mastered").length : 0;
  const done = mine ? [...mine.answered].filter((id) => bankIds.has(id)).length : 0;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/learn" className="text-sm text-muted">
          ← 学习路径
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold">题库</h1>
        <p className="mt-1 text-sm text-muted">中医小知识，一共 {bank.length} 题。按主题练一练，答错的题过几天再复习，慢慢积累。</p>
      </div>

      {mine ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="quiz-stats">
          <Stat label="连续打卡" value={`${mine.streak} 天`} testId="stat-streak" />
          <Stat label="今天要复习" value={`${due} 题`} href="/learn/quiz/review" testId="stat-due" />
          <Stat label="错题本" value={`${wrong} 题`} href="/learn/quiz/mine?view=wrong" testId="stat-wrong" />
          <Stat label="做过" value={`${done} / ${bank.length}`} href="/learn/quiz/mine" testId="stat-done" />
        </div>
      ) : (
        <div className="card text-sm" data-testid="quiz-login-prompt">
          不登录也可以答题。
          <Link href="/login" className="text-cinnabar underline">
            登录
          </Link>
          后可以记录作答、打卡、看错题本和复习。
        </div>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-bold">按主题练一练</h2>
          <Link href="/learn/quiz/practice" className="text-sm text-cinnabar">
            全部主题随机 →
          </Link>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="quiz-topics">
          {progress.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/learn/quiz/practice?topic=${t.slug}`}
                className="card flex items-center gap-3 hover:border-cinnabar"
                data-testid={`topic-${t.slug}`}
              >
                <span className="font-serif text-base font-bold">{t.label}</span>
                <span className="flex-1">
                  {mine && (
                    <span className="block h-1.5 overflow-hidden rounded-full bg-paper" aria-hidden>
                      <span className="block h-full bg-jade" style={{ width: `${t.total ? (100 * t.done) / t.total : 0}%` }} />
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted" data-testid={`topic-${t.slug}-count`}>
                  {mine ? `${t.done} / ${t.total}` : `${t.total} 题`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted">
        题目只考知识（理论、典籍、药材归类、方剂组成和出处、经络穴位），不涉及用药和剂量建议。题目由 AI
        按教材通行说法整理，还没有经医生审核。
      </p>
    </div>
  );
}

function Stat({ label, value, href, testId }: { label: string; value: string; href?: string; testId: string }) {
  const body = (
    <div className="card h-full" data-testid={testId}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-serif text-xl font-bold">{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}
