/**
 * 学堂每日一题、题库、复习（docs/design/0020）。
 * 期望值都从 supabase/data/quiz-questions.json 独立算：今天是哪一题（自己实现一遍选题规则）、正确答案、解析、每个主题的题数。
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RUN, signUp, sql } from "./helpers";

type Q = {
  id: string;
  topics: string[];
  kind: string;
  stem: string;
  options: string[];
  answer: number;
  explanation: string;
  source: string;
  status: string;
};
const BANK = (JSON.parse(readFileSync(path.resolve(__dirname, "../../supabase/data/quiz-questions.json"), "utf8")).questions as Q[]).filter(
  (q) => q.status !== "retired",
);
const byId = new Map(BANK.map((q) => [q.id, q]));
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");

// ---- 独立的期望值 ----
const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monthDay = (day: string) => `${Number(day.slice(5, 7))} 月 ${Number(day.slice(8, 10))} 日`;
/** 0020 §4：题目按 id 的 FNV-1a 哈希排成固定顺序，第 n 天（从 1970-01-01 数）出第 n mod 题数 道 */
function expectedDaily(day: string): Q {
  const fnv = (s: string) => {
    let h = 2166136261;
    for (const ch of s) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };
  const order = BANK.map((q) => q.id).sort((a, b) => fnv(a) - fnv(b) || a.localeCompare(b));
  const n = Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return byId.get(order[n % order.length])!;
}
const wrongIndex = (q: Q) => (q.answer + 1) % q.options.length;

async function answer(scope: ReturnType<Page["getByTestId"]>, index: number) {
  await scope.getByTestId(`quiz-option-${index}`).click();
  await expect(scope.getByTestId("quiz-result")).toBeVisible();
}

async function attemptsOf(email: string) {
  return sql<{ question_id: string; chosen: number; correct: boolean; mode: string; daily_day: string | null }>(
    `select a.question_id, a.chosen, a.correct, a.mode, to_char(a.daily_day, 'YYYY-MM-DD') daily_day
     from quiz_attempts a join auth.users u on u.id = a.user_id where u.email = $1 order by a.answered_at`,
    [email],
  );
}
const countAll = async () => Number((await sql<{ n: string }>("select count(*) n from quiz_attempts"))[0].n);

test("不登录做每日一题：答完显示对错和解析，不记录", { tag: ["@LEARN-4"] }, async ({ page }) => {
  const q = expectedDaily(torontoToday());
  const before = await countAll();
  await page.goto("/learn");
  const card = page.getByTestId("daily-quiz");
  await expect(card.getByRole("heading", { name: /每日一题/ })).toContainText(monthDay(torontoToday()));
  await expect(card.getByTestId("quiz-question")).toHaveAttribute("data-question-id", q.id);
  await expect(card.getByTestId("quiz-stem")).toHaveText(q.stem);
  for (const [i, o] of q.options.entries()) await expect(card.getByTestId(`quiz-option-${i}`)).toContainText(o);
  await expect(card.getByTestId("quiz-disclaimer")).toHaveText("题目由 AI 整理，尚未经医生审核；发现错误请登录后点右下角「反馈问题」。");
  // 答案和解析不在页面里（答完才由服务器返回）
  expect(await page.content()).not.toContain(q.explanation);

  await answer(card, wrongIndex(q));
  await expect(card.getByTestId("quiz-result")).toHaveAttribute("data-correct", "false");
  await expect(card.getByTestId("quiz-result")).toContainText(`正确答案是`);
  await expect(card.getByTestId("quiz-result")).toContainText(`「${q.options[q.answer]}」`);
  await expect(card.getByTestId(`quiz-option-${q.answer}`)).toHaveAttribute("data-state", "answer");
  await expect(card.getByTestId(`quiz-option-${wrongIndex(q)}`)).toHaveAttribute("data-state", "wrong");
  await expect(card.getByTestId("quiz-explanation")).toHaveText(q.explanation);
  await expect(card.getByTestId("quiz-source")).toHaveText(`出处：${q.source}`);
  await expect(card.getByTestId("quiz-login-hint")).toHaveText("登录后可以记录和复习。");
  for (let i = 0; i < q.options.length; i++) await expect(card.getByTestId(`quiz-option-${i}`)).toBeDisabled();
  await page.screenshot({ path: path.join(SHOTS, "learn-quiz-daily-anon.png"), fullPage: true });

  // 不记录：数据库里没多，刷新后又是没答的样子
  expect(await countAll()).toBe(before);
  await page.reload();
  await expect(page.getByTestId("daily-quiz").getByTestId("quiz-result")).toHaveCount(0);
  await expect(page.getByTestId("daily-quiz").getByTestId("daily-streak")).toHaveCount(0);
});

test("不登录按主题练一练：一组 5 题都是这个主题，答对给小动效，不记录", { tag: ["@LEARN-5"] }, async ({ page }) => {
  const before = await countAll();
  await page.goto("/learn/quiz");
  await expect(page.getByTestId("quiz-login-prompt")).toBeVisible();
  await expect(page.getByTestId("quiz-stats")).toHaveCount(0);
  for (const t of ["yinyang", "wuxing", "jingluo", "yangsheng"])
    await expect(page.getByTestId(`topic-${t}-count`)).toHaveText(`${BANK.filter((q) => q.topics.includes(t)).length} 题`);

  await page.getByTestId("topic-wuxing").click();
  await expect(page.getByRole("heading", { name: "练一练 · 五行" })).toBeVisible();
  const seen = new Set<string>();
  for (let i = 1; i <= 5; i++) {
    await expect(page.getByTestId("quiz-progress")).toHaveText(`第 ${i} / 5 题`);
    const box = page.getByTestId("quiz-question");
    const q = byId.get((await box.getAttribute("data-question-id"))!)!;
    expect(q.topics, q.id).toContain("wuxing");
    seen.add(q.id);
    await answer(box, q.answer);
    await expect(box.getByTestId("quiz-result")).toHaveAttribute("data-correct", "true");
    await expect(box.getByTestId("quiz-result")).toContainText("答对了！");
    await page.getByRole("button", { name: i < 5 ? "下一题" : "看结果" }).click();
  }
  expect(seen.size).toBe(5);
  await expect(page.getByTestId("quiz-summary")).toContainText("这一组答对 5 / 5");
  // 再来一组：换一组新的
  await page.getByRole("button", { name: "再来一组" }).click();
  await expect(page.getByTestId("quiz-progress")).toHaveText("第 1 / 5 题");
  expect(await countAll()).toBe(before);

  // 复习和错题本要登录
  await page.goto("/learn/quiz/review");
  await expect(page.getByTestId("quiz-login-prompt")).toBeVisible();
  await page.goto("/learn/quiz/mine?view=wrong");
  await expect(page.getByTestId("quiz-login-prompt")).toBeVisible();
});

test("登录后：每日一题记录、打卡、主题进度、错题本、到期复习", { tag: ["@LEARN-4", "@LEARN-5"] }, async ({ page }) => {
  const me = { email: `quiz+${RUN}@example.com`, password: "secret-quiz-123" };
  const today = torontoToday();
  const q = expectedDaily(today);
  await signUp(page, me);

  // 1. 每日一题答错 → 记下来，打卡 1 天
  await page.goto("/learn");
  const card = page.getByTestId("daily-quiz");
  await expect(card.getByTestId("daily-streak")).toHaveText("今天答一题就开始打卡");
  await expect(card.getByTestId("quiz-disclaimer")).toContainText("发现错误请点右下角「反馈问题」");
  await answer(card, wrongIndex(q));
  await expect(card.getByTestId("quiz-result")).toHaveAttribute("data-correct", "false");
  await expect(card.getByTestId("quiz-login-hint")).toHaveCount(0);
  await expect(card.getByTestId("daily-streak")).toHaveText("已连续打卡 1 天");
  expect(await attemptsOf(me.email)).toEqual([
    { question_id: q.id, chosen: wrongIndex(q), correct: false, mode: "daily", daily_day: today },
  ]);

  // 刷新：还是答过的样子，不能再答
  await page.reload();
  await expect(card.getByTestId("quiz-result")).toHaveAttribute("data-correct", "false");
  await expect(card.getByTestId(`quiz-option-${q.answer}`)).toBeDisabled();
  await expect(card.getByTestId("quiz-explanation")).toHaveText(q.explanation);

  // 2. 题库首页：打卡、错题、进度（按 JSON 独立数）
  await page.goto("/learn/quiz");
  await expect(page.getByTestId("stat-streak")).toContainText("1 天");
  await expect(page.getByTestId("stat-wrong")).toContainText("1 题");
  await expect(page.getByTestId("stat-due")).toContainText("0 题");
  await expect(page.getByTestId("stat-done")).toContainText(`1 / ${BANK.length}`);
  for (const t of ["yinyang", "wuxing", "zangfu", "qixue", "jingluo", "sizhen", "zhongyao", "fangji", "jingdian", "yangsheng"]) {
    const total = BANK.filter((x) => x.topics.includes(t)).length;
    await expect(page.getByTestId(`topic-${t}-count`), t).toHaveText(`${q.topics.includes(t) ? 1 : 0} / ${total}`);
  }

  // 3. 错题本：明天复习
  await page.goto("/learn/quiz/mine?view=wrong");
  const item = page.getByTestId("mine-item");
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute("data-question-id", q.id);
  await expect(item.getByTestId("mine-answer")).toHaveText(q.options[q.answer]);
  await expect(item.getByTestId("mine-review")).toHaveAttribute("data-due", shiftDay(today, 1));
  await expect(item.getByTestId("mine-review")).toContainText(`${monthDay(shiftDay(today, 1))}复习（错过 1 次）`);
  // 按主题筛：不是这个主题的看不到
  const other = ["yinyang", "wuxing", "zangfu", "qixue", "jingluo", "sizhen", "zhongyao", "fangji", "jingdian", "yangsheng"].find(
    (t) => !q.topics.includes(t),
  )!;
  await page.goto(`/learn/quiz/mine?view=wrong&topic=${other}`);
  await expect(page.getByTestId("quiz-empty")).toContainText("错题本是空的");

  // 4. 今天还不用复习
  await page.goto("/learn/quiz/review");
  await expect(page.getByTestId("quiz-empty")).toContainText("今天没有要复习的题");
  await expect(page.getByTestId("quiz-empty")).toContainText(`下一次复习：${monthDay(shiftDay(today, 1))}`);

  // 5. 时间往前拨：每日一题那次改成昨天答的；再加一道前天在练一练里答错的题（超级用户直接写，触发器算对错）
  const q2 = BANK.find((x) => x.id !== q.id && x.kind === "single")!;
  await sql(
    `update quiz_attempts set answered_at = answered_at - interval '1 day'
     where user_id = (select id from auth.users where email = $1)`,
    [me.email],
  );
  await sql(
    `insert into quiz_attempts (user_id, question_id, chosen, mode, answered_at)
     select id, $2, $3, 'practice', now() - interval '2 days' from auth.users where email = $1`,
    [me.email, q2.id, wrongIndex(q2)],
  );
  await page.goto("/learn/quiz");
  await expect(page.getByTestId("stat-due")).toContainText("2 题");
  await page.getByTestId("stat-due").click();
  await expect(page.getByTestId("review-due")).toHaveText("今天要复习 2 题");
  // 到期早的先出：q2（前天答错，昨天到期）→ q（昨天答错，今天到期）
  for (const [i, x] of [q2, q].entries()) {
    await expect(page.getByTestId("quiz-progress")).toHaveText(`第 ${i + 1} / 2 题`);
    const box = page.getByTestId("quiz-question");
    await expect(box).toHaveAttribute("data-question-id", x.id);
    await answer(box, x.answer);
    await expect(box.getByTestId("quiz-result")).toHaveAttribute("data-correct", "true");
    await page.getByRole("button", { name: i === 0 ? "下一题" : "看结果" }).click();
  }
  await expect(page.getByTestId("quiz-summary")).toContainText("这一组答对 2 / 2");
  const reviews = (await attemptsOf(me.email)).filter((a) => a.mode === "review");
  expect(reviews).toEqual([
    { question_id: q2.id, chosen: q2.answer, correct: true, mode: "review", daily_day: null },
    { question_id: q.id, chosen: q.answer, correct: true, mode: "review", daily_day: null },
  ]);

  // 复习答对 → 下一次是 3 天后，错题本里两题都还在（还没掌握）
  await page.goto("/learn/quiz/mine?view=wrong");
  await expect(page.getByTestId("mine-item")).toHaveCount(2);
  for (const r of await page.getByTestId("mine-review").all()) await expect(r).toHaveAttribute("data-due", shiftDay(today, 3));
  await page.goto("/learn/quiz");
  await expect(page.getByTestId("stat-due")).toContainText("0 题");
  await expect(page.getByTestId("stat-done")).toContainText(`2 / ${BANK.length}`);
  await page.screenshot({ path: path.join(SHOTS, "learn-quiz-hub.png"), fullPage: true });

  // 手机 390px：几个页面都不横向溢出
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ["/learn", "/learn/quiz", "/learn/quiz/mine?view=wrong", "/learn/quiz/review", "/learn/quiz/practice?topic=jingluo"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await page.goto("/learn");
  await page.screenshot({ path: path.join(SHOTS, "learn-quiz-daily-390.png"), fullPage: true });
  await page.goto("/learn/quiz/mine?view=wrong");
  await page.screenshot({ path: path.join(SHOTS, "learn-quiz-mine-390.png"), fullPage: true });
});

test("手机 390px：不登录的每日一题和练一练不横向溢出", { tag: ["@LEARN-4", "@PLAT-2"] }, async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const url of ["/learn", "/learn/quiz", "/learn/quiz/practice?topic=sizhen"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  // 选项按钮点得到
  await page.goto("/learn");
  const card = page.getByTestId("daily-quiz");
  const q = expectedDaily(torontoToday());
  await card.getByTestId(`quiz-option-${q.answer}`).click();
  await expect(card.getByTestId("quiz-result")).toHaveAttribute("data-correct", "true");
  await page.screenshot({ path: path.join(SHOTS, "learn-quiz-correct-390.png"), fullPage: true });
  await page.close();
});
