/**
 * 学堂题库（supabase/data/quiz-questions.json，docs/design/0020 §3）的格式检查。
 * 内容对不对要人工审核；这里只挡住格式错误、答案不在选项里、出了用量题或治疗题，以及「改了 JSON 忘了生成 migration」。
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { QUIZ_TOPICS } from "./quiz";

type Question = {
  id: string;
  topics: string[];
  difficulty: number;
  kind: string;
  stem: string;
  options: string[];
  answer: number;
  explanation: string;
  source: string;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

const root = path.resolve(import.meta.dirname, "../../..");
const { questions } = JSON.parse(readFileSync(path.join(root, "supabase/data/quiz-questions.json"), "utf8")) as { questions: Question[] };

// 测试自己写一份，不用实现里的（实现写错时这里要能发现）
const TOPICS = ["yinyang", "wuxing", "zangfu", "qixue", "jingluo", "sizhen", "zhongyao", "fangji", "jingdian", "yangsheng"];
// 用量：数字 + 单位（「犊鼻下 3 寸」「365 种」这种不算）
const DOSE = /\d+(\.\d+)?\s*(g|克|钱|两|mg|毫克|ml|毫升|丸|片|粒|袋|次\/日)/i;
// 治疗 / 用药建议的说法（AI 只做科普，0020 §2）
const ADVICE = /用量|剂量|服用|服法|主治|适应证|适应症|吃什么药|用什么药|该吃|可以吃|每日.{0,4}次|治疗.{0,6}(病|症)|患者/;

describe("题库格式", () => {
  it("主题列表和页面用的一致", () => {
    expect(QUIZ_TOPICS.map((t) => t.slug)).toEqual(TOPICS);
  });

  it("约 100 题，每个主题（按主主题）8–15 题", () => {
    expect(questions.length).toBeGreaterThanOrEqual(90);
    expect(questions.length).toBeLessThanOrEqual(150);
    for (const t of TOPICS) {
      const n = questions.filter((q) => q.topics[0] === t).length;
      expect(n, t).toBeGreaterThanOrEqual(8);
      expect(n, t).toBeLessThanOrEqual(15);
    }
  });

  it("id 唯一、格式是 <主主题>-<三位数>", () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    for (const q of questions) expect(q.id, q.id).toMatch(new RegExp(`^${q.topics[0]}-\\d{3}$`));
  });

  it("主题合法、不重复，最多 4 个；难度 1–3；状态合法", () => {
    for (const q of questions) {
      expect(q.topics.length, q.id).toBeGreaterThanOrEqual(1);
      expect(q.topics.length, q.id).toBeLessThanOrEqual(4);
      expect(new Set(q.topics).size, q.id).toBe(q.topics.length);
      for (const t of q.topics) expect(TOPICS, q.id).toContain(t);
      expect([1, 2, 3], q.id).toContain(q.difficulty);
      expect(["draft", "reviewed", "retired"], q.id).toContain(q.status);
      if (q.status === "reviewed") expect(q.reviewed_by && q.reviewed_at, q.id).toBeTruthy();
    }
  });

  it("这一版都是 draft（AI 整理，还没有医生审核）", () => {
    expect(questions.filter((q) => q.status !== "draft").map((q) => q.id)).toEqual([]);
  });

  it("答案在选项里；选项不重复、不为空；判断题是「对 / 错」", () => {
    for (const q of questions) {
      expect(["single", "judge"], q.id).toContain(q.kind);
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      expect(q.options.length, q.id).toBeLessThanOrEqual(5);
      expect(new Set(q.options).size, q.id).toBe(q.options.length);
      for (const o of q.options) expect(o.trim(), q.id).not.toBe("");
      expect(Number.isInteger(q.answer), q.id).toBe(true);
      expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.id).toBeLessThan(q.options.length);
      if (q.kind === "judge") {
        expect(q.options, q.id).toEqual(["对", "错"]);
        expect(q.stem, q.id).toMatch(/^判断：/);
      } else expect(q.options.length, q.id).toBe(4);
    }
  });

  it("单选题的正确答案位置大致分散（不能总是 A）", () => {
    const singles = questions.filter((q) => q.kind === "single");
    for (let i = 0; i < 4; i++) {
      const share = singles.filter((q) => q.answer === i).length / singles.length;
      expect(share, `答案是第 ${i + 1} 个的比例`).toBeGreaterThan(0.15);
      expect(share, `答案是第 ${i + 1} 个的比例`).toBeLessThan(0.35);
    }
  });

  it("题干、解析、出处都有，长度合理", () => {
    for (const q of questions) {
      expect(q.stem.trim().length, q.id).toBeGreaterThanOrEqual(4);
      expect(q.stem.length, q.id).toBeLessThanOrEqual(200);
      expect(q.explanation.trim().length, q.id).toBeGreaterThanOrEqual(4);
      expect(q.explanation.length, `${q.id} 解析一两句就够`).toBeLessThanOrEqual(120);
      expect(q.source.trim().length, q.id).toBeGreaterThanOrEqual(2);
      expect(q.source.length, q.id).toBeLessThanOrEqual(120);
    }
  });

  it("不出用量题、不出治疗题", () => {
    for (const q of questions) {
      const text = [q.stem, ...q.options, q.explanation].join(" ");
      expect(text, q.id).not.toMatch(DOSE);
      expect(text, q.id).not.toMatch(ADVICE);
    }
  });

  it("检查本身管用（反向）", () => {
    expect("麻黄常用量 9 g").toMatch(DOSE);
    expect("每次 3 丸").toMatch(DOSE);
    expect("感冒了该吃什么药").toMatch(ADVICE);
    expect("这首方主治外感风寒").toMatch(ADVICE);
    expect("足三里在犊鼻下 3 寸").not.toMatch(DOSE);
    expect("收药 365 种").not.toMatch(DOSE);
  });

  it("最新的题库 migration 和 JSON 一致（改了 JSON 要生成新的 migration）", () => {
    const dir = path.join(root, "supabase/migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const withQuiz = files.filter((f) => readFileSync(path.join(dir, f), "utf8").includes("$quiz$"));
    expect(withQuiz.length, "没有找到题库 migration").toBeGreaterThan(0);
    const sql = readFileSync(path.join(dir, withQuiz.at(-1)!), "utf8");
    const literal = sql.slice(sql.indexOf("$quiz$") + 6, sql.lastIndexOf("$quiz$"));
    const inMigration = JSON.parse(literal) as Question[];
    const expected = questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      source: q.source,
      topics: q.topics,
      difficulty: q.difficulty,
      status: q.status,
      reviewed_by: q.reviewed_by ?? null,
      reviewed_at: q.reviewed_at ?? null,
    }));
    expect(
      inMigration,
      `${withQuiz.at(-1)} 和 supabase/data/quiz-questions.json 不一致：node scripts/gen-quiz-questions.mjs 生成新的 migration`,
    ).toEqual(expected);
  });
});
