import Link from "next/link";
import type { Metadata } from "next";
import { isQuizTopic, QUIZ_TOPICS, topicLabel, type ReviewState } from "@/lib/quiz";
import { loadBank, loadMyAttempts, loadReveals, quizContext, summarize, type AttemptRow } from "../data";

export const metadata: Metadata = { title: "我做过的题 · 药柜学堂" };

/** 我做过的题 / 错题本（docs/design/0020 §5）：按主题看，带解析和复习状态。要登录 */
export default async function MyQuizPage({ searchParams }: PageProps<"/learn/quiz/mine">) {
  const sp = await searchParams;
  const view = sp.view === "wrong" ? "wrong" : "all";
  const topic = isQuizTopic(sp.topic) ? sp.topic : null;
  const { supabase, userId, today } = await quizContext();

  const header = (
    <div>
      <Link href="/learn/quiz" className="text-sm text-muted">
        ← 题库
      </Link>
      <h1 className="mt-1 font-serif text-2xl font-bold">{view === "wrong" ? "错题本" : "我做过的题"}</h1>
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
          后可以看自己做过的题和错题本。
        </div>
      </div>
    );

  const attempts = await loadMyAttempts(supabase);
  const { review } = summarize(attempts, today);
  const last = new Map<string, AttemptRow>();
  for (const a of attempts) last.set(a.question_id, a); // 按时间排的，最后一条留下
  const bank = new Map((await loadBank(supabase)).map((q) => [q.id, q]));
  const ids = [...last.keys()]
    .filter((id) => bank.has(id))
    .filter((id) => (view === "wrong" ? review.has(id) : true))
    .filter((id) => !topic || bank.get(id)!.topics.includes(topic))
    .sort((a, b) => (last.get(b)!.answered_at < last.get(a)!.answered_at ? -1 : 1)); // 最近做的在前
  const reveals = await loadReveals(supabase, ids);
  const href = (v: string, t: string | null) => `/learn/quiz/mine?view=${v}${t ? `&topic=${t}` : ""}`;

  return (
    <div className="space-y-4">
      {header}
      <div className="flex flex-wrap gap-2 text-sm" role="tablist">
        {(["wrong", "all"] as const).map((v) => (
          <Link
            key={v}
            href={href(v, topic)}
            role="tab"
            aria-selected={view === v}
            className={`rounded-full border px-3 py-1 ${view === v ? "border-cinnabar text-cinnabar" : "border-line text-muted"}`}
          >
            {v === "wrong" ? "错题本" : "全部做过的"}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 text-xs" data-testid="mine-topics">
        <Link href={href(view, null)} className={`rounded-full px-2 py-0.5 ${topic ? "text-muted" : "bg-cinnabar text-white"}`}>
          全部主题
        </Link>
        {QUIZ_TOPICS.map((t) => (
          <Link
            key={t.slug}
            href={href(view, t.slug)}
            className={`rounded-full px-2 py-0.5 ${topic === t.slug ? "bg-cinnabar text-white" : "text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {ids.length === 0 ? (
        <div className="card text-center text-sm text-muted" data-testid="quiz-empty">
          {view === "wrong" ? "错题本是空的。" : "还没有做过题。"}
          <Link href="/learn/quiz" className="ml-1 text-cinnabar">
            去练一练 →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="mine-list">
          {ids.map((id) => {
            const q = bank.get(id)!;
            const r = reveals.get(id)!;
            const a = last.get(id)!;
            return (
              <li key={id} className="card" data-testid="mine-item" data-question-id={id}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {q.topics.map((t) => (
                    <span key={t} className="rounded-full bg-paper px-2 py-0.5">
                      {topicLabel(t)}
                    </span>
                  ))}
                  <span className={a.correct ? "text-jade" : "text-cinnabar"}>最近一次{a.correct ? "答对" : "答错"}</span>
                  {review.has(id) && <ReviewBadge state={review.get(id)!} />}
                </div>
                <p className="mt-2 font-serif">{q.stem}</p>
                <p className="mt-1 text-sm">
                  正确答案：<b data-testid="mine-answer">{q.options[r.answer]}</b>
                  {!a.correct && <span className="ml-2 text-cinnabar">（你选的：{q.options[a.chosen]}）</span>}
                </p>
                <details className="mt-1 text-sm">
                  <summary className="cursor-pointer text-muted" data-bug-label="看解析">
                    解析
                  </summary>
                  <p className="mt-1">{r.explanation}</p>
                  <p className="mt-1 text-xs text-muted">出处：{r.source}</p>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ReviewBadge({ state }: { state: ReviewState }) {
  const text =
    state.status === "mastered"
      ? "已掌握"
      : state.status === "due"
        ? "今天复习"
        : `${state.dueDay!.replace(/^\d{4}-0?(\d+)-0?(\d+)$/, "$1 月 $2 日")}复习`;
  return (
    <span className="rounded-full border border-line px-2 py-0.5" data-testid="mine-review" data-due={state.dueDay ?? ""}>
      {text}（错过 {state.wrongCount} 次）
    </span>
  );
}
