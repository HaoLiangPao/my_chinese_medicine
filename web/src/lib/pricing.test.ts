import { describe, expect, it } from "vitest";
import { parseStrategy, per100g, strategyParam, summarizeCost } from "./pricing";

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

  it("成本恰好为 0（很便宜四舍五入）也算有价格；null 才是没价格", () => {
    expect(summarizeCost([{ name_zh: "甘草", grams_per_dose: 3, cost_per_dose: "0.0000" }], 1, null).complete).toBe(true);
    expect(summarizeCost([{ name_zh: "甘草", grams_per_dose: 3, cost_per_dose: null }], 1, null).complete).toBe(false);
  });

  it("空方 → 不完整", () => {
    expect(summarizeCost([], 7, 10).complete).toBe(false);
  });

  it("总价用不取整的每副成本乘副数（线上 bug：$1.554 × 5 显示成 $7.75）", () => {
    // 黄芪 15g×$0.02 + 党参 12g×$0.04 + 白术 9g×$0.032 + 茯苓 9g×$0.024 + 砂仁 3g×$0.09
    const four = [
      { name_zh: "黄芪", grams_per_dose: 15, cost_per_dose: "0.3000" },
      { name_zh: "党参", grams_per_dose: 12, cost_per_dose: "0.4800" },
      { name_zh: "白术", grams_per_dose: 9, cost_per_dose: "0.2880" },
      { name_zh: "茯苓", grams_per_dose: 9, cost_per_dose: "0.2160" },
      { name_zh: "砂仁", grams_per_dose: 3, cost_per_dose: "0.2700" },
    ];
    const s = summarizeCost(four, 5, null);
    expect(s.perDose).toBe(1.55); // 1.554
    expect(s.total).toBe(7.77); // 1.554 × 5 = 7.77，不是 1.55 × 5 = 7.75
    // 诊所那张：炙甘草 6g×$0.024 + 法半夏 9g×$0.04 = 0.504 → 7 剂 3.528
    const clinic = summarizeCost(
      [
        { name_zh: "炙甘草", grams_per_dose: 6, cost_per_dose: "0.1440" },
        { name_zh: "法半夏", grams_per_dose: 9, cost_per_dose: "0.3600" },
      ],
      7,
      null,
    );
    expect([clinic.perDose, clinic.total]).toEqual([0.5, 3.53]);
  });

  it("和诊所比较也用不取整的值", () => {
    // 每副 1.554；诊所 5 副共 $10 → 每副 2；每副省 0.446 → $0.45；0.446 / 2 = 22.3%（用取整后的 0.45 算会是 22.5%）
    const s = summarizeCost([{ name_zh: "黄芪", grams_per_dose: 1, cost_per_dose: 1.554 }], 5, 10);
    expect([s.clinicPerDose, s.savingPerDose, s.savingPct]).toEqual([2, 0.45, 22.3]);
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
