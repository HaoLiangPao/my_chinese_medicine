import { describe, expect, it } from "vitest";
import { maxDosesFromStock, mergeLines, perDoseTotal, pricePerGram, round2, toGrams } from "./rx";

describe("mergeLines", () => {
  it("合并同名药材的克数，保留第一次出现的脚注和顺序", () => {
    const out = mergeLines([
      { name: "黄芪", grams: 15, prep: null },
      { name: "薄荷", grams: 3, prep: "后下" },
      { name: " 黄芪 ", grams: 5, prep: "先煎" },
    ]);
    expect(out).toEqual([
      { name: "黄芪", grams: 20, prep: null },
      { name: "薄荷", grams: 3, prep: "后下" },
    ]);
  });

  it("跳过空名字", () => {
    expect(mergeLines([{ name: "  ", grams: 3 }, { name: "", grams: 1 }])).toEqual([]);
  });

  it("小数克数不会出现浮点误差", () => {
    expect(mergeLines([{ name: "甘草", grams: 0.1 }, { name: "甘草", grams: 0.2 }])[0].grams).toBe(0.3);
  });

  it("不修改原数组里的对象", () => {
    const input = [{ name: "甘草", grams: 3 }, { name: "甘草", grams: 3 }];
    mergeLines(input);
    expect(input[0].grams).toBe(3);
  });
});

describe("perDoseTotal", () => {
  it("接受数字和字符串（Postgres numeric 会返回字符串）", () => {
    expect(perDoseTotal([{ grams: 9 }, { grams: "4.5" }, { grams: 3 }])).toBe(16.5);
  });
  it("空方为 0", () => expect(perDoseTotal([])).toBe(0));
});

describe("maxDosesFromStock", () => {
  const items = [
    { herb_id: "hq", grams_per_dose: 15 },
    { herb_id: "md", grams_per_dose: "10" },
  ];

  it("取各味药能配副数的最小值", () => {
    expect(maxDosesFromStock(items, new Map([["hq", 100], ["md", 35]]))).toBe(3);
  });
  it("刚好够的边界：45g / 15g = 3 副", () => {
    expect(maxDosesFromStock(items, new Map([["hq", 45], ["md", 30]]))).toBe(3);
  });
  it("浮点库存（44.99999…）不会少算一副", () => {
    expect(maxDosesFromStock([{ herb_id: "a", grams_per_dose: 0.3 }], new Map([["a", 0.1 + 0.2]]))).toBe(1);
  });
  it("缺任意一味药 → 0", () => {
    expect(maxDosesFromStock(items, new Map([["hq", 1000]]))).toBe(0);
  });
  it("库存为负 → 0，不会是负数", () => {
    expect(maxDosesFromStock(items, new Map([["hq", -30], ["md", 100]]))).toBe(0);
  });
  it("空方 → 0", () => expect(maxDosesFromStock([], new Map())).toBe(0));
  it("忽略每副 0 克的脏数据", () => {
    expect(maxDosesFromStock([{ herb_id: "a", grams_per_dose: 0 }, { herb_id: "b", grams_per_dose: 5 }], new Map([["b", 12]]))).toBe(2);
  });
});

describe("toGrams", () => {
  it("处方：1 钱 = 3 g，1 两 = 30 g", () => {
    expect(toGrams(3, "钱", "prescription")).toBe(9);
    expect(toGrams(1, "两", "prescription")).toBe(30);
  });
  it("采购：1 斤 = 500 g，1 两 = 50 g（和处方的两不一样）", () => {
    expect(toGrams(1, "斤", "market")).toBe(500);
    expect(toGrams(2, "两", "market")).toBe(100);
    expect(toGrams(0.5, "斤", "market")).toBe(250);
  });
  it("英制：1 lb ≈ 453.59 g，4 oz ≈ 113.4 g", () => {
    expect(toGrams(1, "lb", "market")).toBe(453.59);
    expect(toGrams(4, "oz", "market")).toBe(113.4);
  });
  it("处方里不能用「斤」", () => {
    expect(() => toGrams(1, "斤", "prescription")).toThrow(/不适用于处方/);
  });
  it("拒绝负数和 NaN", () => {
    expect(() => toGrams(-1, "g", "market")).toThrow();
    expect(() => toGrams(Number.NaN, "g", "market")).toThrow();
  });
});

describe("pricePerGram / round2", () => {
  it("12.5 元 / 500 g = 0.025", () => expect(pricePerGram(12.5, 500)).toBe(0.025));
  it("0 克 → null（避免除以 0）", () => expect(pricePerGram(5, 0)).toBeNull());
  it("round2 四舍五入到两位", () => {
    expect(round2(1.005 + 0.0001)).toBe(1.01);
    expect(round2(2.344)).toBe(2.34);
  });
});
