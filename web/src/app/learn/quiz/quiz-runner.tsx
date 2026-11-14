"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { QuizTopic } from "@/lib/quiz";
import { drawPractice, drawReview } from "./actions";
import type { PublicQuestion } from "./data";
import { QuestionCard } from "./question-card";

/**
 * 一组题（练一练 / 复习），一题一题做。这一组在浏览器里固定下来：
 * 答题后 invalidateAll() 会刷新页面数据，但不会换掉正在做的这一组。
 */
export function QuizRunner({
  initial,
  mode,
  topic,
  loggedIn,
}: {
  initial: PublicQuestion[];
  mode: "practice" | "review";
  topic: QuizTopic | null;
  loggedIn: boolean;
}) {
  const [round, setRound] = useState(0);
  const [questions, setQuestions] = useState(initial);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const again = () =>
    startTransition(async () => {
      const r = mode === "review" ? await drawReview() : await drawPractice(topic);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      setQuestions(r.questions);
      setIndex(0);
      setAnswered(false);
      setCorrect(0);
      setRound((n) => n + 1);
    });

  if (questions.length === 0)
    return (
      <div className="card text-center text-sm text-muted" data-testid="quiz-empty">
        {mode === "review" ? "今天没有要复习的题。" : "这个主题还没有题。"}
        <div className="mt-2">
          <Link href="/learn/quiz" className="text-cinnabar">
            回到题库 →
          </Link>
        </div>
      </div>
    );

  const finished = index >= questions.length;
  return (
    <div className="space-y-4">
      {!finished ? (
        <div className="card">
          <p className="mb-2 text-xs text-muted" data-testid="quiz-progress">
            第 {index + 1} / {questions.length} 题
          </p>
          <QuestionCard
            key={`${round}-${questions[index].id}`}
            question={questions[index]}
            mode={mode}
            loggedIn={loggedIn}
            onAnswered={(a) => {
              setAnswered(true);
              if (a.correct) setCorrect((n) => n + 1);
            }}
          />
          {answered && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="btn-primary"
                data-bug-label="下一题"
                onClick={() => {
                  setIndex((i) => i + 1);
                  setAnswered(false);
                }}
              >
                {index + 1 < questions.length ? "下一题" : "看结果"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center" data-testid="quiz-summary">
          <p className="font-serif text-xl font-bold">
            这一组答对 <span className="text-cinnabar">{correct}</span> / {questions.length}
          </p>
          <p className="mt-1 text-sm text-muted">
            {mode === "review"
              ? "答对的题，下次复习的间隔会拉长；答错的明天再来。"
              : loggedIn
                ? "答错的题进了错题本，明天开始复习。"
                : "登录后可以记录作答，答错的题进错题本。"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" data-bug-label="再来一组" disabled={pending} onClick={again}>
              {pending ? "抽题中…" : mode === "review" ? "再复习一组" : "再来一组"}
            </button>
            <Link href="/learn/quiz" className="btn-ghost">
              回到题库
            </Link>
          </div>
          {error && (
            <p className="mt-2 text-sm text-cinnabar" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
