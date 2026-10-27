import { describe, expect, it } from "vitest";
import { lineCosts, moveLine, removeLine, upsertLine, validateLines, type RxLine } from "./rx-lines";

const L = (herbId: string, grams: number, extra: Partial<RxLine> = {}): RxLine => ({ herbId, name: herbId, grams, prep: null, note: null, ...extra });

describe("upsertLine", () => {
  it("新药加在最后", () => {
    expect(upsertLine([L("a", 3)], L("b", 6)).map((l) => l.herbId)).toEqual(["a", "b"]);
  });
  it("同一味药再加一次 = 原位更新，不会出现两行", () => {
    const out = upsertLine([L("a", 3), L("b", 6)], L("a", 9, { note: "后改的" }));
    expect(out).toEqual([L("a", 9, { note: "后改的" }), L("b", 6)]);
  });
  it("不修改原数组", () => {
    const orig = [L("a", 3)];
    upsertLine(orig, L("a", 9));
    expect(orig[0].grams).toBe(3);
  });
});

describe("removeLine / moveLine", () => {
  const ls = [L("a", 1), L("b", 2), L("c", 3)];
  it("删除", () => expect(removeLine(ls, "b").map((l) => l.herbId)).toEqual(["a", "c"]));
  it("上移 / 下移；到头了不动", () => {
    expect(moveLine(ls, "b", -1).map((l) => l.herbId)).toEqual(["b", "a", "c"]);
    expect(moveLine(ls, "b", 1).map((l) => l.herbId)).toEqual(["a", "c", "b"]);
    expect(moveLine(ls, "a", -1)).toBe(ls);
    expect(moveLine(ls, "c", 1)).toBe(ls);
    expect(moveLine(ls, "zzz", 1)).toBe(ls);
  });
});

describe("validateLines", () => {
  it("没有药", () => expect(validateLines([])).toBe("至少要有一味药"));
  it("0 克 / 负数 / NaN", () => {
    expect(validateLines([L("黄芪", 0)])).toBe("黄芪 的克数不对");
    expect(validateLines([L("黄芪", -1)])).toBe("黄芪 的克数不对");
    expect(validateLines([L("黄芪", Number.NaN)])).toBe("黄芪 的克数不对");
  });
  it("多打一个 0 会被拦下", () => expect(validateLines([L("黄芪", 1800)])).toBe("黄芪 1800g 太多了，请确认"));
  it("最多两位小数", () => expect(validateLines([L("甘草", 1.234)])).toBe("甘草 的克数最多两位小数"));
  it("正常", () => expect(validateLines([L("a", 4.5), L("b", 500)])).toBeNull());
});

describe("lineCosts", () => {
  it("有单价算成本（保留 4 位），没单价为 null", () => {
    expect(lineCosts([L("a", 15), L("b", 6)], new Map([["a", 0.016]]))).toEqual([
      { name_zh: "a", grams_per_dose: 15, cost_per_dose: 0.24 },
      { name_zh: "b", grams_per_dose: 6, cost_per_dose: null },
    ]);
  });
  it("单价 0（很便宜）不等于没价格", () => {
    expect(lineCosts([L("a", 3)], new Map([["a", 0]]))[0].cost_per_dose).toBe(0);
  });
});
