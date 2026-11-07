import { describe, expect, it } from "vitest";
import { nextPending } from "./review-order";

describe("nextPending", () => {
  const m = (herb_id: string, name_zh: string, pinyin: string | null, status = "draft") => ({ herb_id, name_zh, pinyin, status });
  const all = [m("hq", "黄芪", "huang qi"), m("bz", "白术", "bai zhu", "reviewed"), m("md", "麦冬", "mai dong"), m("gc", "甘草", "gan cao")];
  it("按拼音排在后面的第一味草稿", () => {
    expect(nextPending(all, "gc")).toBe("hq"); // gan → huang → mai
    expect(nextPending(all, "hq")).toBe("md");
  });
  it("后面没有了从头找，跳过已审核的", () => {
    expect(nextPending(all, "md")).toBe("gc"); // bai 已审核
  });
  it("只剩自己 / 都审核完了 → null", () => {
    expect(nextPending([m("md", "麦冬", "mai dong")], "md")).toBeNull();
    expect(nextPending([m("md", "麦冬", "mai dong", "reviewed")], "x")).toBeNull();
  });
  it("没有拼音的（用户自己加的药）按现算的拼音排，不按汉字编码", () => {
    // 拼音：丙 bing → 甲 jia → 乙 yi；按编码是 丙 → 乙 → 甲
    expect(nextPending([m("y", "乙药", null), m("j", "甲药", null), m("b", "丙药", null)], "b")).toBe("j");
  });
});
