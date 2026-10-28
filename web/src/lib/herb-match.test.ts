import { describe, expect, it } from "vitest";
import { buildMatcher } from "./herb-match";

const match = buildMatcher({ names: ["黄芪", "麦冬", "炙甘草"], aliases: { 北芪: "黄芪", 麦门冬: "麦冬" } });

describe("buildMatcher（和数据库 match_herb 规则一致）", () => {
  it("标准名", () => expect(match("黄芪")).toEqual({ kind: "name", canonical: "黄芪" }));
  it("别名 → 标准名（之前会被误标成「不在目录里」）", () => {
    expect(match("北芪")).toEqual({ kind: "alias", canonical: "黄芪" });
    expect(match("麦门冬")).toEqual({ kind: "alias", canonical: "麦冬" });
  });
  it("首尾空格不影响", () => {
    expect(match("  北芪 ")).toEqual({ kind: "alias", canonical: "黄芪" });
    expect(match(" 炙甘草")).toEqual({ kind: "name", canonical: "炙甘草" });
  });
  it("空 / 只有空格", () => {
    expect(match("")).toEqual({ kind: "empty" });
    expect(match("   ")).toEqual({ kind: "empty" });
  });
  it("目录里没有 → unknown；不做模糊匹配（「甘草」不等于「炙甘草」）", () => {
    expect(match("鸡血藤")).toEqual({ kind: "unknown" });
    expect(match("甘草")).toEqual({ kind: "unknown" });
  });
  it("标准名优先于别名", () => {
    const m = buildMatcher({ names: ["当归"], aliases: { 当归: "酒当归" } });
    expect(m("当归")).toEqual({ kind: "name", canonical: "当归" });
  });
});
