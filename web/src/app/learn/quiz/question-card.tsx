"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { topicLabel, type QuizMode } from "@/lib/quiz";
import { answerQuestion } from "./actions";
import type { PublicQuestion, Reveal } from "./data";

export type Answered = Reveal & { chosen: number; correct: boolean };

const LETTERS = ["A", "B", "C", "D", "E"];

/**
 * 一道题：点选项 → 服务器判对错、返回解析（没登录也能答，只是不记）。
 * initial：已经答过（每日一题今天答过了）时直接显示结果。
 */
export function QuestionCard({
  question,
  mode,
  loggedIn,
  initial,
  onAnswered,
}: {
  question: PublicQuestion;
  mode: QuizMode;
  loggedIn: boolean;
  initial?: Answered | null;
  onAnswered?: (a: Answered) => void;
}) {
  const [result, setResult] = useState<Answered | null>(initial ?? null);
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (i: number) => {
    if (result || pending) return;
    setPicked(i);
    setError(null);
    startTransition(async () => {
      const r = await answerQuestion({ questionId: question.id, chosen: i, mode });
      if (!r.ok) {
        setError(r.error);
        setPicked(null);
        return;
      }
      const a: Answered = { chosen: r.chosen, correct: r.correct, answer: r.answer, explanation: r.explanation, source: r.source };
      setResult(a);
      setNote(r.warning ?? (r.already ? "今天已经答过了，以第一次的答案为准" : null));
      onAnswered?.(a);
    });
  };

  return (
    <div data-testid="quiz-question" data-question-id={question.id}>
      <div className="flex flex-wrap gap-1">
        {question.topics.map((t) => (
          <span key={t} className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">
            {topicLabel(t)}
          </span>
        ))}
      </div>
      <p className="mt-2 font-serif text-lg leading-relaxed" data-testid="quiz-stem">
        {question.stem}
      </p>
      <ul className={`mt-3 grid gap-2 ${question.kind === "judge" ? "grid-cols-2" : "sm:grid-cols-2"}`} data-testid="quiz-options">
        {question.options.map((o, i) => {
          const isAnswer = result?.answer === i;
          const isWrongPick = result && result.chosen === i && !result.correct;
          const tone = isAnswer
            ? "border-jade bg-jade/10 text-jade"
            : isWrongPick
              ? "border-cinnabar bg-cinnabar/10 text-cinnabar"
              : picked === i
                ? "border-cinnabar"
                : "border-line hover:border-cinnabar";
          return (
            <li key={i}>
              <button
                type="button"
                data-bug-label="选答案"
                data-testid={`quiz-option-${i}`}
                data-state={isAnswer ? "answer" : isWrongPick ? "wrong" : undefined}
                disabled={!!result || pending}
                onClick={() => choose(i)}
                className={`flex w-full items-start gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${tone}`}
              >
                {question.kind === "single" && <span className="font-mono text-xs leading-5 text-muted">{LETTERS[i]}</span>}
                <span className="flex-1">{o}</span>
                {isAnswer && <span aria-label="正确答案">✓</span>}
                {isWrongPick && <span aria-label="你选的">✗</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {pending && <p className="mt-3 text-sm text-muted">判分中…</p>}
      {error && (
        <p className="mt-3 text-sm text-cinnabar" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 space-y-2" data-testid="quiz-result" data-correct={result.correct}>
          {result.correct ? (
            <p className="text-base font-bold text-jade">
              <span className="inline-block motion-safe:animate-[quiz-pop_0.6s_ease-out]">答对了！</span>
            </p>
          ) : (
            <p className="text-base font-bold text-cinnabar">
              答错了，正确答案是{question.kind === "single" ? ` ${LETTERS[result.answer]}` : ""}「{question.options[result.answer]}」
            </p>
          )}
          <p className="text-sm leading-relaxed" data-testid="quiz-explanation">
            {result.explanation}
          </p>
          <p className="text-xs text-muted" data-testid="quiz-source">
            出处：{result.source}
          </p>
          {note && <p className="text-xs text-amber">{note}</p>}
          {!loggedIn && (
            <p className="text-sm" data-testid="quiz-login-hint">
              <Link href="/login" className="text-cinnabar underline">
                登录
              </Link>
              后可以记录和复习。
            </p>
          )}
        </div>
      )}

      {question.status === "draft" && (
        <p className="mt-3 text-xs text-muted" data-testid="quiz-disclaimer">
          题目由 AI 整理，尚未经医生审核；发现错误请{loggedIn ? "点右下角「反馈问题」" : "登录后点右下角「反馈问题」"}。
        </p>
      )}
    </div>
  );
}
