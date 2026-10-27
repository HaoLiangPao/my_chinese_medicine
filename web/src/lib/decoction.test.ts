import { describe, expect, it } from "vitest";
import { buildOverrides, cleanExtras, plannedGrams, varianceStatus, type PlanItem } from "./decoction";

const plan: PlanItem[] = [
  { herb_id: "hq", name: "黄芪", grams_per_dose: 18 },
  { herb_id: "gc", name: "炙甘草", grams_per_dose: 4.5 },
  { herb_id: "bh", name: "薄荷", grams_per_dose: 3 },
];

describe("plannedGrams", () => {
  it("每副 × 副数", () => {
    expect(plannedGrams(plan[0], 3)).toBe(54);
    expect(plannedGrams(plan[1], 7)).toBe(31.5);
  });
  it("0 副 → 0", () => expect(plannedGrams(plan[0], 0)).toBe(0));
});

describe("buildOverrides", () => {
  it("什么都没改 → 空（全部按处方量）", () => {
    expect(buildOverrides(plan, 3, {})).toEqual({ overrides: [], invalid: [] });
  });

  it("多用了几克：只传这一味", () => {
    expect(buildOverrides(plan, 3, { hq: "59" })).toEqual({ overrides: [{ herb_id: "hq", grams: 59 }], invalid: [] });
  });

  it("填的值和处方量一样 → 不算改动", () => {
    expect(buildOverrides(plan, 3, { hq: 54, gc: "13.5" }).overrides).toEqual([]);
  });

  it("填 0 = 这次没放", () => {
    expect(buildOverrides(plan, 2, { bh: "0" }).overrides).toEqual([{ herb_id: "bh", grams: 0 }]);
  });

  it("空字符串 / null 视为没填", () => {
    expect(buildOverrides(plan, 2, { hq: "", gc: null }).overrides).toEqual([]);
  });

  it("负数和非数字报错，不会静默吞掉", () => {
    expect(buildOverrides(plan, 2, { hq: "-5", gc: "abc" })).toEqual({ overrides: [], invalid: ["黄芪", "炙甘草"] });
  });

  it("忽略处方外的 herb_id（处方外的药走 extras）", () => {
    expect(buildOverrides(plan, 1, { other: "10" }).overrides).toEqual([]);
  });

  it("小数精度：13.50 和 13.5 视为相同", () => {
    expect(buildOverrides(plan, 3, { gc: "13.50" }).overrides).toEqual([]);
  });
});

describe("cleanExtras", () => {
  it("去空行、去 0 克、同名合并", () => {
    expect(
      cleanExtras([
        { name: "生姜", grams: 6 },
        { name: "", grams: 5 },
        { name: "大枣", grams: 0 },
        { name: " 生姜", grams: 3 },
        { name: "陈皮", grams: Number.NaN },
      ]),
    ).toEqual([{ name: "生姜", grams: 9 }]);
  });
});

describe("varianceStatus", () => {
  it.each([
    [54, 54, "exact"],
    [54, 59, "over"],
    [54, 50, "under"],
    [9, 0, "omitted"],
    [0, 6, "extra"],
  ] as const)("planned %d actual %d → %s", (p, a, s) => {
    expect(varianceStatus(p, a)).toBe(s);
  });
});
