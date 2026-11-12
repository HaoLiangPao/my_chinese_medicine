import { describe, expect, it } from "vitest";
import { barPercent, bucketLabel, monthLabel, parseMonth, recentMonths, userLabel } from "./admin-stats";

describe("parseMonth", () => {
  it("YYYY-MM → 这个月的 1 号", () => {
    expect(parseMonth("2026-11")).toBe("2026-11-01");
    expect(parseMonth("2001-02")).toBe("2001-02-01");
  });
  it("不合法的当成全部时间", () => {
    for (const v of [undefined, "", "all", "2026-13", "2026-00", "2026-1", "2026-11-05", "2026-11'--", " 2026-11", "0001-01"]) {
      expect(parseMonth(v), String(v)).toBeNull();
    }
    expect(parseMonth(["2026-11", "2026-10"])).toBeNull();
  });
});

describe("recentMonths", () => {
  it("从这个月往前，跨年", () => {
    expect(recentMonths("2026-02-15", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
    expect(recentMonths("2026-11-30")).toHaveLength(12);
    expect(recentMonths("2026-11-30").at(-1)).toBe("2025-12");
  });
});

describe("monthLabel", () => {
  it("中文月份", () => expect(monthLabel("2026-03")).toBe("2026 年 3 月"));
});

describe("userLabel", () => {
  it("医生显示邮箱", () => {
    expect(userLabel({ user_no: 3, email: "doc@example.com", account_kind: "clinic" })).toBe("医生 #3 · doc@example.com");
  });
  it("病人账号只有编号；就算给了邮箱也不显示", () => {
    expect(userLabel({ user_no: 7, email: null, account_kind: "household" })).toBe("病人 #7");
    expect(userLabel({ user_no: 7, email: "p@example.com", account_kind: "household" })).toBe("病人 #7");
    expect(userLabel({ user_no: 9, email: "x@example.com", account_kind: null })).toBe("未选类型 #9");
  });
});

describe("barPercent", () => {
  it("按最大值算", () => {
    expect(barPercent(9, 9)).toBe(100);
    expect(barPercent(6, 9)).toBe(67);
  });
  it("0 和很小的值", () => {
    expect(barPercent(0, 9)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
    expect(barPercent(1, 1000)).toBe(2);
  });
});

describe("bucketLabel", () => {
  it("天和周", () => {
    expect(bucketLabel("2026-02-03", "day")).toBe("02-03");
    expect(bucketLabel("2026-02-02", "week")).toBe("02-02 起");
  });
});
