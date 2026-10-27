import { describe, expect, it } from "vitest";
import { cheapest, parseStrategy, per100g, strategyParam, summarizeCost } from "./pricing";

const uuid = "4c1d1c3e-8a1b-4f9e-9a39-2d6c1e1f0a11";

describe("parseStrategy / strategyParam", () => {
  it("默认 cheapest", () => {
    expect(parseStrategy(undefined)).toEqual({ kind: "cheapest" });
    expect(parseStrategy("nonsense")).toEqual({ kind: "cheapest" });
    expect(parseStrategy("store:not-a-uuid")).toEqual({ kind: "cheapest" });
  });
  it("average / store:<uuid>", () => {
    expect(parseStrategy("average")).toEqual({ kind: "average" });
    expect(parseStrategy(`store:${uuid}`)).toEqual({ kind: "store", storeId: uuid });
    expect(parseStrategy(["average", "cheapest"])).toEqual({ kind: "average" });
  });
  it("来回转换不丢信息", () => {
    for (const s of ["cheapest", "average", `store:${uuid}`]) expect(strategyParam(parseStrategy(s))).toBe(s);
  });
});

describe("summarizeCost", () => {
  const rows = [
    { name_zh: "黄芪", grams_per_dose: 15, cost_per_dose: "0.2400" },
    { name_zh: "大枣", grams_per_dose: 6, cost_per_dose: 0.12 },
  ];

  it("每副 / 总价 / 和诊所比", () => {
    expect(summarizeCost(rows, 7, 7)).toEqual({
      perDose: 0.36,
      total: 2.52,
      missing: [],
      complete: true,
      clinicPerDose: 1,
      savingPerDose: 0.64,
      savingPct: 64,
    });
  });

  it("有药没价格 → 不完整，不和诊所比（避免误导）", () => {
    const s = summarizeCost([...rows, { name_zh: "防风", grams_per_dose: 6, cost_per_dose: null }], 7, 7);
    expect(s.complete).toBe(false);
    expect(s.missing).toEqual(["防风"]);
    expect(s.perDose).toBe(0.36);
    expect(s.savingPerDose).toBeNull();
    expect(s.savingPct).toBeNull();
  });

  it("没填诊所价格", () => {
    const s = summarizeCost(rows, 7, null);
    expect(s.clinicPerDose).toBeNull();
    expect(s.savingPerDose).toBeNull();
  });

  it("自己买更贵 → 负数", () => {
    expect(summarizeCost(rows, 2, 0.5).savingPerDose).toBe(-0.11);
  });

  it("赠品成本 0 也算有价格", () => {
    expect(summarizeCost([{ name_zh: "甘草", grams_per_dose: 3, cost_per_dose: "0.0000" }], 1, null).complete).toBe(true);
  });

  it("空方 → 不完整", () => {
    expect(summarizeCost([], 7, 10).complete).toBe(false);
  });

  it("副数为 0 时不除以 0", () => {
    expect(summarizeCost(rows, 0, 10).clinicPerDose).toBeNull();
  });
});

describe("per100g", () => {
  it("0.016/g → $1.60/100g", () => expect(per100g("0.016000")).toBe(1.6));
  it("空 → null", () => {
    expect(per100g(null)).toBeNull();
    expect(per100g("")).toBeNull();
  });
});

describe("cheapest", () => {
  it("忽略赠品，取最低价；同价取店名靠前", () => {
    expect(
      cheapest([
        { store: "B", ppg: 0.02 },
        { store: "A", ppg: 0 },
        { store: "D", ppg: 0.016 },
        { store: "C", ppg: 0.016 },
      ]),
    ).toEqual({ store: "C", ppg: 0.016 });
  });
  it("只有赠品 / 没有报价 → null", () => {
    expect(cheapest([{ store: "A", ppg: 0 }])).toBeNull();
    expect(cheapest([])).toBeNull();
  });
});
