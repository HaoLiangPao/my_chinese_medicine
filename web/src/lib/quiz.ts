/**
 * 学堂每日一题、题库、复习的纯计算（docs/design/0020）。
 * 日期一律是多伦多的日历日（"YYYY-MM-DD"）：服务器是 UTC，用户在多伦多。
 */

/** 主题（第一版）。slug 存在数据库的 quiz_questions.topics 里，顺序就是页面上的顺序 */
export const QUIZ_TOPICS = [
  { slug: "yinyang", label: "阴阳" },
  { slug: "wuxing", label: "五行" },
  { slug: "zangfu", label: "脏腑" },
  { slug: "qixue", label: "气血津液" },
  { slug: "jingluo", label: "经络与腧穴" },
  { slug: "sizhen", label: "四诊" },
  { slug: "zhongyao", label: "中药" },
  { slug: "fangji", label: "方剂" },
  { slug: "jingdian", label: "经典" },
  { slug: "yangsheng", label: "养生" },
] as const;
export type QuizTopic = (typeof QUIZ_TOPICS)[number]["slug"];

const TOPIC_LABELS: Record<string, string> = Object.fromEntries(QUIZ_TOPICS.map((t) => [t.slug, t.label]));
export const topicLabel = (slug: string) => TOPIC_LABELS[slug] ?? slug;
export const isQuizTopic = (s: unknown): s is QuizTopic => typeof s === "string" && s in TOPIC_LABELS;

/** 答错以后多少天再复习：答错 → 1 天；之后每答对一次换下一个间隔；最后一个间隔也答对 → 掌握了 */
export const REVIEW_INTERVALS = [1, 3, 7, 14] as const;
/** 每次复习、练习的题数 */
export const QUIZ_BATCH = 5;

export type QuizMode = "daily" | "practice" | "review";
export const QUIZ_MODES: readonly QuizMode[] = ["daily", "practice", "review"];

// ---------- 日期 ----------

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const toUtcMs = (day: string) => {
  if (!DAY.test(day)) throw new Error(`日期格式不对：${day}`);
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** 某个时刻在多伦多是哪一天 */
export function torontoDay(at: Date | string | number = new Date()): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** 日历日加减天数（按 UTC 算，不受夏令时影响） */
export function addDays(day: string, n: number): string {
  return new Date(toUtcMs(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** b - a 相差几天 */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

// ---------- 每日一题 ----------

/** FNV-1a 32 位：每道题一个固定的「随机」序号，和题目加入的先后无关 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 每日一题的出题顺序：按题目 id 的哈希排（打乱主题），哈希相同按 id */
export function dailyOrder(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((a, b) => fnv1a(a) - fnv1a(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * 某一天的每日一题：所有人同一题。按固定顺序每天往下走一题，走完一轮从头再来，
 * 所以题库不变时，同一道题两次出现至少隔「题库题数」天。题库为空返回 null。
 * 题库加题、下架以后顺序会整体错开（当天的题可能换）：已经答过的人页面上显示他答过的那题（0020 §4）。
 */
export function dailyQuestionId(ids: readonly string[], day: string): string | null {
  const order = dailyOrder(ids);
  if (order.length === 0) return null;
  const n = daysBetween("1970-01-01", day);
  return order[((n % order.length) + order.length) % order.length];
}

// ---------- 连续打卡 ----------

/** 连续打卡天数（只算每日一题）：今天答了从今天往前数；今天还没答从昨天往前数（今天还来得及） */
export function dailyStreak(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- 间隔复习 ----------

export type QuizAttempt = { questionId: string; correct: boolean; answeredAt: string };

export type ReviewState = {
  questionId: string;
  /** waiting：还没到复习的日子；due：今天该复习；mastered：已经掌握 */
  status: "waiting" | "due" | "mastered";
  /** 下一次复习的日子（掌握了就是 null） */
  dueDay: string | null;
  /** 上一次答错以后，按时复习答对了几次 */
  level: number;
  wrongCount: number;
  lastDay: string;
};

/**
 * 每道答错过的题现在的复习状态。只有答错过的题进复习（第一次就答对的算会了）。
 * 规则（按时间顺序看每一次作答，日期按多伦多）：
 * - 答错：从这一天起 1 天后复习，进度清零（任何时候答错都算，包括没到复习日）
 * - 答对：到了复习日（或者过了）才算一次复习，进度 +1，下一次间隔是 REVIEW_INTERVALS[进度]；
 *   没到复习日答对（比如练一练又抽到了）不改变复习日
 * - 进度到了 REVIEW_INTERVALS 的长度（14 天那次也答对了）→ 掌握了
 */
export function reviewStates(attempts: readonly QuizAttempt[], today: string): Map<string, ReviewState> {
  const sorted = [...attempts].sort((a, b) => (a.answeredAt < b.answeredAt ? -1 : a.answeredAt > b.answeredAt ? 1 : 0));
  const states = new Map<string, ReviewState>();
  for (const a of sorted) {
    const day = torontoDay(a.answeredAt);
    const s = states.get(a.questionId);
    if (!a.correct) {
      states.set(a.questionId, {
        questionId: a.questionId,
        status: "waiting",
        dueDay: addDays(day, REVIEW_INTERVALS[0]),
        level: 0,
        wrongCount: (s?.wrongCount ?? 0) + 1,
        lastDay: day,
      });
      continue;
    }
    if (!s) continue; // 没答错过：不进复习
    s.lastDay = day;
    if (s.dueDay === null || day < s.dueDay) continue;
    s.level++;
    s.dueDay = s.level >= REVIEW_INTERVALS.length ? null : addDays(day, REVIEW_INTERVALS[s.level]);
  }
  for (const s of states.values()) s.status = s.dueDay === null ? "mastered" : s.dueDay <= today ? "due" : "waiting";
  return states;
}

/** 今天该复习的题：到期最早的在前，同一天按 id；最多 limit 道 */
export function dueForReview(states: Map<string, ReviewState>, limit = QUIZ_BATCH): string[] {
  return [...states.values()]
    .filter((s) => s.status === "due")
    .sort((a, b) => (a.dueDay! < b.dueDay! ? -1 : a.dueDay! > b.dueDay! ? 1 : a.questionId < b.questionId ? -1 : 1))
    .slice(0, limit)
    .map((s) => s.questionId);
}

// ---------- 主题进度、练一练 ----------

export type TopicProgress = { slug: QuizTopic; label: string; done: number; total: number };

/** 每个主题做过几道 / 一共几道（一道题可以属于几个主题，每个主题都算） */
export function topicProgress(
  questions: readonly { id: string; topics: readonly string[] }[],
  answered: ReadonlySet<string>,
): TopicProgress[] {
  return QUIZ_TOPICS.map(({ slug, label }) => {
    const inTopic = questions.filter((q) => q.topics.includes(slug));
    return { slug, label, total: inTopic.length, done: inTopic.filter((q) => answered.has(q.id)).length };
  });
}

/** 练一练抽题：先抽没做过的，不够再从做过的里补；同一组不重复。random 可以注入（测试用） */
export function pickPractice(
  ids: readonly string[],
  answered: ReadonlySet<string>,
  n = QUIZ_BATCH,
  random: () => number = Math.random,
): string[] {
  const shuffle = (xs: string[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  };
  const unique = [...new Set(ids)];
  const fresh = shuffle(unique.filter((id) => !answered.has(id)));
  const seen = shuffle(unique.filter((id) => answered.has(id)));
  return [...fresh, ...seen].slice(0, n);
}
