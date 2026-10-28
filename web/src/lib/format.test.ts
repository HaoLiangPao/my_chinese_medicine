import { describe, expect, it } from "vitest";
import { grams, money, num, parseJsonField, str } from "./format";

describe("grams", () => {
  it("整数不带小数，小数保留一位", () => {
    expect(grams(15)).toBe("15 g");
    expect(grams("4.5")).toBe("4.5 g");
    expect(grams(-30)).toBe("-30 g");
  });
  it("空值显示 —", () => {
    expect(grams(null)).toBe("—");
    expect(grams(undefined)).toBe("—");
    expect(grams("")).toBe("—");
  });
  it("0 显示 0 g（不是 —）", () => expect(grams(0)).toBe("0 g"));
});

describe("money", () => {
  it("两位小数", () => {
    expect(money(12.5)).toBe("$12.50");
    expect(money("3")).toBe("$3.00");
  });
  it("空值显示 —", () => expect(money(null)).toBe("—"));
});

describe("num", () => {
  it("解析表单数字", () => {
    expect(num("7")).toBe(7);
    expect(num("0")).toBe(0);
    expect(num("2.5")).toBe(2.5);
  });
  it("空/非法 → null", () => {
    expect(num("")).toBeNull();
    expect(num(null)).toBeNull();
    expect(num("abc")).toBeNull();
    expect(num("Infinity")).toBeNull();
  });
});

describe("parseJsonField", () => {
  it("空值用默认值", () => {
    expect(parseJsonField(null, [])).toEqual([]);
    expect(parseJsonField("  ", {})).toEqual({});
  });
  it("合法 JSON", () => expect(parseJsonField('[{"a":1}]', [])).toEqual([{ a: 1 }]));
  it("坏 JSON → undefined（不抛异常）", () => {
    expect(parseJsonField("{oops", [])).toBeUndefined();
    expect(parseJsonField("[1,", [])).toBeUndefined();
  });
});

describe("str", () => {
  it("去首尾空白，空串 → null", () => {
    expect(str("  李医生 ")).toBe("李医生");
    expect(str("   ")).toBeNull();
    expect(str(null)).toBeNull();
  });
});
