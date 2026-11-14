import { describe, expect, it } from "vitest";
import {
  addDays,
  dailyOrder,
  dailyQuestionId,
  dailyStreak,
  daysBetween,
  dueForReview,
  pickPractice,
  reviewStates,
  topicProgress,
  torontoDay,
  type QuizAttempt,
} from "./quiz";

describe("多伦多日期", () => {
  it("UTC 凌晨在多伦多还是前一天", () => {
    // 冬令时 UTC-5：UTC 04:59 = 多伦多 23:59
    expect(torontoDay("2026-11-15T04:59:00Z")).toBe("2026-11-14");
    expect(torontoDay("2026-11-15T05:00:00Z")).toBe("2026-11-15");
    // 夏令时 UTC-4
    expect(torontoDay("2026-07-01T03:59:00Z")).toBe("2026-06-30");
    expect(torontoDay("2026-07-01T04:00:00Z")).toBe("2026-07-01");
  });

  it("加减天数跨月、跨年、跨夏令时切换", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09"); // 2026-03-08 多伦多换夏令时
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-14", "2026-11-01")).toBe(-13);
    expect(() => addDays("2026/11/14", 1)).toThrow();
  });
});

describe("每日一题", () => {
  const ids = Array.from({ length: 37 }, (_, i) => `t-${String(i).padStart(3, "0")}`);

  it("同一天结果一样，和传入的顺序无关", () => {
    const shuffled = [...ids].reverse();
    expect(dailyQuestionId(shuffled, "2026-11-14")).toBe(dailyQuestionId(ids, "2026-11-14"));
    expect(dailyQuestionId(ids, "2026-11-14")).not.toBeNull();
  });

  it("连续 N 天（N = 题数）每道题正好出现一次，第 N+1 天才回到第一题", () => {
    const start = "2026-11-14";
    const seen = Array.from({ length: ids.length }, (_, i) => dailyQuestionId(ids, addDays(start, i)));
    expect(new Set(seen).size).toBe(ids.length);
    expect(dailyQuestionId(ids, addDays(start, ids.length))).toBe(seen[0]);
    // 相邻两天不会是同一题
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it("从任何一天开始数都成立（包括 1970 年以前，取模不出负数）", () => {
    for (const start of ["2027-02-27", "1969-12-25"]) {
      const seen = Array.from({ length: ids.length }, (_, i) => dailyQuestionId(ids, addDays(start, i)));
      expect(new Set(seen).size, start).toBe(ids.length);
    }
  });

  it("顺序打乱了主题，不是按 id 排", () => {
    expect(dailyOrder(ids)).not.toEqual(ids);
    expect([...dailyOrder(ids)].sort()).toEqual(ids);
  });

  it("加题以后，原来的题之间的先后不变", () => {
    const before = dailyOrder(ids);
    const after = dailyOrder([...ids, "new-001", "new-002"]).filter((id) => !id.startsWith("new-"));
    expect(after).toEqual(before);
  });

  it("重复的 id 只算一次；题库为空返回 null", () => {
    expect(dailyOrder(["a-001", "a-001", "b-001"])).toHaveLength(2);
    expect(dailyQuestionId([], "2026-11-14")).toBeNull();
  });
});

describe("连续打卡", () => {
  it("今天答了：从今天往前数", () => {
    expect(dailyStreak(["2026-11-12", "2026-11-13", "2026-11-14"], "2026-11-14")).toBe(3);
  });
  it("今天还没答：从昨天往前数（还来得及）", () => {
    expect(dailyStreak(["2026-11-12", "2026-11-13"], "2026-11-14")).toBe(2);
  });
  it("断了一天：只算断了以后的", () => {
    expect(dailyStreak(["2026-11-10", "2026-11-11", "2026-11-13", "2026-11-14"], "2026-11-14")).toBe(2);
  });
  it("前天以前的不算", () => {
    expect(dailyStreak(["2026-11-11", "2026-11-12"], "2026-11-14")).toBe(0);
    expect(dailyStreak([], "2026-11-14")).toBe(0);
  });
  it("跨月", () => {
    expect(dailyStreak(["2026-10-31", "2026-11-01"], "2026-11-01")).toBe(2);
  });
});

describe("间隔复习：1 → 3 → 7 → 14 天", () => {
  // 时间用多伦多的中午（UTC 17:00，冬令时），日期一目了然
  const at = (day: string, hhmm = "17:00") => `${day}T${hhmm}:00Z`;
  const a = (day: string, correct: boolean, id = "q-001", hhmm?: string): QuizAttempt => ({
    questionId: id,
    correct,
    answeredAt: at(day, hhmm),
  });

  it("第一次就答对的题不进复习", () => {
    expect(reviewStates([a("2026-11-01", true)], "2026-11-01").size).toBe(0);
  });

  it("答错：第二天到期", () => {
    const attempts = [a("2026-11-01", false)];
    expect(reviewStates(attempts, "2026-11-01").get("q-001")).toMatchObject({
      status: "waiting",
      dueDay: "2026-11-02",
      level: 0,
      wrongCount: 1,
    });
    expect(reviewStates(attempts, "2026-11-02").get("q-001")).toMatchObject({ status: "due", dueDay: "2026-11-02" });
    // 过期了也还是 due
    expect(reviewStates(attempts, "2026-11-20").get("q-001")!.status).toBe("due");
  });

  it("按时答对，间隔变成 3、7、14 天，再答对就掌握了", () => {
    const steps: [QuizAttempt, string | null][] = [
      [a("2026-11-01", false), "2026-11-02"],
      [a("2026-11-02", true), "2026-11-05"], // +3
      [a("2026-11-05", true), "2026-11-12"], // +7
      [a("2026-11-13", true), "2026-11-27"], // 晚了一天复习：从答的那天 +14
      [a("2026-11-27", true), null], // 掌握
    ];
    const done: QuizAttempt[] = [];
    for (const [attempt, due] of steps) {
      done.push(attempt);
      expect(reviewStates(done, "2026-12-31").get("q-001")!.dueDay, attempt.answeredAt).toBe(due);
    }
    expect(reviewStates(done, "2026-12-31").get("q-001")).toMatchObject({ status: "mastered", level: 4 });
  });

  it("没到复习日答对（比如练一练又抽到）不改变复习日", () => {
    const s = reviewStates([a("2026-11-01", false), a("2026-11-02", true), a("2026-11-03", true), a("2026-11-04", true)], "2026-11-04");
    expect(s.get("q-001")).toMatchObject({ dueDay: "2026-11-05", level: 1, status: "waiting", lastDay: "2026-11-04" });
  });

  it("任何时候答错都从头来；掌握了以后答错也一样", () => {
    const early = reviewStates([a("2026-11-01", false), a("2026-11-02", true), a("2026-11-03", false)], "2026-11-03");
    expect(early.get("q-001")).toMatchObject({ dueDay: "2026-11-04", level: 0, wrongCount: 2 });
    const mastered = [a("2026-11-01", false), a("2026-11-02", true), a("2026-11-05", true), a("2026-11-12", true), a("2026-11-26", true)];
    expect(reviewStates(mastered, "2026-12-01").get("q-001")!.status).toBe("mastered");
    const again = reviewStates([...mastered, a("2026-12-01", false)], "2026-12-01");
    expect(again.get("q-001")).toMatchObject({ status: "waiting", dueDay: "2026-12-02", level: 0, wrongCount: 2 });
  });

  it("按多伦多日期算：晚上 10 点答错，第二天就到期", () => {
    // 2026-11-02T03:00Z = 多伦多 11-01 22:00
    const s = reviewStates([a("2026-11-02", false, "q-001", "03:00")], "2026-11-02");
    expect(s.get("q-001")).toMatchObject({ lastDay: "2026-11-01", dueDay: "2026-11-02", status: "due" });
  });

  it("作答的先后按时间，不按传入的顺序", () => {
    const s = reviewStates([a("2026-11-02", true), a("2026-11-01", false)], "2026-11-02");
    expect(s.get("q-001")).toMatchObject({ level: 1, dueDay: "2026-11-05" });
  });

  it("今天的复习：到期最早的在前，同一天按 id，最多 5 题", () => {
    const attempts = [
      a("2026-11-03", false, "q-c"),
      a("2026-11-01", false, "q-b"),
      a("2026-11-01", false, "q-a"),
      a("2026-11-09", false, "q-later"), // 11-10 才到期
      ...["q-1", "q-2", "q-3", "q-4"].map((id) => a("2026-11-05", false, id)),
      a("2026-11-01", true, "q-never-wrong"),
    ];
    const due = dueForReview(reviewStates(attempts, "2026-11-09"));
    expect(due).toEqual(["q-a", "q-b", "q-c", "q-1", "q-2"]);
    expect(dueForReview(reviewStates(attempts, "2026-11-09"), 10)).toEqual(["q-a", "q-b", "q-c", "q-1", "q-2", "q-3", "q-4"]);
  });
});

describe("主题进度、练一练", () => {
  const questions = [
    { id: "wx-1", topics: ["wuxing"] },
    { id: "wx-2", topics: ["wuxing", "zangfu"] },
    { id: "zf-1", topics: ["zangfu"] },
  ];

  it("一道题属于几个主题，每个主题都算", () => {
    const p = topicProgress(questions, new Set(["wx-2"]));
    expect(p.find((t) => t.slug === "wuxing")).toMatchObject({ label: "五行", done: 1, total: 2 });
    expect(p.find((t) => t.slug === "zangfu")).toMatchObject({ label: "脏腑", done: 1, total: 2 });
    expect(p.find((t) => t.slug === "yinyang")).toMatchObject({ done: 0, total: 0 });
    expect(p).toHaveLength(10);
  });

  it("先抽没做过的，不够再补做过的；一组里不重复", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const answered = new Set(["a", "b", "c", "d", "e"]);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pick = pickPractice(ids, answered, 5, rand);
    expect(pick).toHaveLength(5);
    expect(new Set(pick).size).toBe(5);
    expect(new Set(pick.slice(0, 2))).toEqual(new Set(["f", "g"]));
    expect(pick.slice(2).every((id) => answered.has(id))).toBe(true);
  });

  it("题不够一组就全给", () => {
    expect(pickPractice(["a", "b"], new Set(), 5).sort()).toEqual(["a", "b"]);
    expect(pickPractice([], new Set(), 5)).toEqual([]);
  });
});
