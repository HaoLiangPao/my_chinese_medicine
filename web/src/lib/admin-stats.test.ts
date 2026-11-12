import { describe, expect, it } from "vitest";
import {
  barPercent,
  bucketLabel,
  niceTicks,
  parseDate,
  parseRange,
  parseSort,
  parseTop,
  parseUuid,
  rangeLabel,
  rangePresets,
  rangeQuery,
  userLabel,
  weight,
} from "./admin-stats";

describe("parseDate", () => {
  it("真实存在的日期原样返回", () => {
    expect(parseDate("2026-02-28")).toBe("2026-02-28");
    expect(parseDate("2024-02-29")).toBe("2024-02-29");
  });
  it("不合法的是 null", () => {
    for (const v of [undefined, "", "2026-02-30", "2026-13-01", "2026-2-3", "2026-02-03T00:00", "1989-12-31", "2100-01-02", "x' or 1=1"]) {
      expect(parseDate(v), String(v)).toBeNull();
    }
    expect(parseDate(["2026-01-01"])).toBeNull();
  });
});

describe("parseRange / rangeQuery", () => {
  it("开始晚于结束就对调；不合法的一头当成不限", () => {
    expect(parseRange({ from: "2026-03-01", to: "2026-02-01" })).toEqual({ from: "2026-02-01", to: "2026-03-01" });
    expect(parseRange({ from: "bad", to: "2026-02-01" })).toEqual({ from: null, to: "2026-02-01" });
    expect(parseRange({})).toEqual({ from: null, to: null });
  });
  it("写回地址栏", () => {
    expect(rangeQuery({ from: "2026-02-01", to: null })).toBe("?from=2026-02-01");
    expect(rangeQuery({ from: null, to: null })).toBe("");
    expect(rangeQuery({ from: "2026-02-01", to: "2026-02-28" }, { top: 20, sort: undefined })).toBe(
      "?from=2026-02-01&to=2026-02-28&top=20",
    );
  });
});

describe("rangePresets", () => {
  const byLabel = (today: string) => Object.fromEntries(rangePresets(today).map((p) => [p.label, p.range]));
  it("最近 N 天包含今天", () => {
    expect(byLabel("2026-03-05")["最近 7 天"]).toEqual({ from: "2026-02-27", to: "2026-03-05" });
    expect(byLabel("2026-03-05")["最近 30 天"]).toEqual({ from: "2026-02-04", to: "2026-03-05" });
  });
  it("本月、上个月（跨年）、今年", () => {
    expect(byLabel("2026-01-15")["本月"]).toEqual({ from: "2026-01-01", to: "2026-01-15" });
    expect(byLabel("2026-01-15")["上个月"]).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(byLabel("2024-03-10")["上个月"]).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(byLabel("2026-11-12")["今年"]).toEqual({ from: "2026-01-01", to: "2026-11-12" });
  });
});

describe("rangeLabel", () => {
  it("几种写法", () => {
    expect(rangeLabel({ from: "2026-02-01", to: "2026-02-28" })).toBe("2026-02-01 至 2026-02-28");
    expect(rangeLabel({ from: "2026-02-03", to: "2026-02-03" })).toBe("2026-02-03");
    expect(rangeLabel({ from: "2026-02-01", to: null })).toBe("2026-02-01 以来");
    expect(rangeLabel({ from: null, to: null })).toBe("全部时间");
  });
});

describe("parseTop / parseSort / parseUuid", () => {
  it("只收列出来的值", () => {
    expect(parseTop("30")).toBe(30);
    expect(parseTop("25")).toBe(10);
    expect(parseTop(undefined)).toBe(10);
    expect(parseSort("rx")).toBe("rx");
    expect(parseSort("name")).toBe("grams");
    expect(parseUuid("00000000-0000-0000-0000-00000000000A")).toBe("00000000-0000-0000-0000-00000000000a");
    expect(parseUuid("123")).toBeNull();
  });
});

describe("userLabel", () => {
  it("医生显示邮箱", () => {
    expect(userLabel({ user_no: 3, email: "doc@example.com", account_kind: "clinic" })).toBe("医生 #3 · doc@example.com");
  });
  it("病人账号只有编号；就算给了邮箱也不显示", () => {
    expect(userLabel({ user_no: 7, email: "p@example.com", account_kind: "household" })).toBe("病人 #7");
    expect(userLabel({ user_no: 9, email: "x@example.com", account_kind: null })).toBe("未选类型 #9");
  });
});

describe("niceTicks", () => {
  it("从 0 开始，步长 1 / 2 / 5 × 10ⁿ，最后一格不小于最大值", () => {
    expect(niceTicks(2)).toEqual([0, 1, 2]);
    expect(niceTicks(9)).toEqual([0, 5, 10]);
    expect(niceTicks(13)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(240)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(1)).toEqual([0, 1]);
  });
  it("没有数据时也有一格", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
  it("最多 5 格", () => {
    for (const max of [1, 3, 7, 11, 19, 23, 99, 101, 999, 12345]) expect(niceTicks(max).length, String(max)).toBeLessThanOrEqual(6);
  });
});

describe("barPercent", () => {
  it("按最大刻度算；0 和很小的值", () => {
    expect(barPercent(9, 10)).toBe(90);
    expect(barPercent(0, 9)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
    expect(barPercent(1, 1000)).toBe(2);
  });
});

describe("bucketLabel / weight", () => {
  it("天、周、月", () => {
    expect(bucketLabel("2026-02-03", "day")).toBe("02-03");
    expect(bucketLabel("2026-02-02", "week")).toBe("02-02 起");
    expect(bucketLabel("2026-02-01", "month")).toBe("2026-02");
  });
  it("克数", () => {
    expect(weight(210)).toBe("210 g");
    expect(weight("12.5")).toBe("12.5 g");
    expect(weight(1500)).toBe("1.5 kg");
    expect(weight(25000)).toBe("25 kg");
  });
});
