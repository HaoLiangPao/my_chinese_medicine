import { describe, expect, it } from "vitest";
import { defaultPrescriberId, NEW_PRESCRIBER, parsePrescriberChoice, prescriberLabel } from "./prescribers";

const ID = "3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f";

describe("parsePrescriberChoice", () => {
  it("空 = 不填", () => {
    expect(parsePrescriberChoice("", "张医生")).toEqual({ kind: "none" });
    expect(parsePrescriberChoice(null, null)).toEqual({ kind: "none" });
  });
  it("选已有的医生", () => {
    expect(parsePrescriberChoice(ID, "")).toEqual({ kind: "existing", id: ID });
  });
  it("不是 id 的值被拦下", () => {
    expect(parsePrescriberChoice("李医生", "")).toMatchObject({ kind: "error" });
  });
  it("新增：名字去空格，中间的连续空白合成一个", () => {
    expect(parsePrescriberChoice(NEW_PRESCRIBER, "  李  医生 ")).toEqual({ kind: "new", name: "李 医生" });
  });
  it("新增但没填名字 / 太长", () => {
    expect(parsePrescriberChoice(NEW_PRESCRIBER, "   ")).toEqual({ kind: "error", message: "请填写新医生的名字" });
    expect(parsePrescriberChoice(NEW_PRESCRIBER, "长".repeat(101))).toEqual({ kind: "error", message: "医生名字太长" });
  });
});

describe("defaultPrescriberId", () => {
  const list = [{ id: "a" }, { id: "b" }];
  it("上一次用的医生", () => expect(defaultPrescriberId(list, "b")).toBe("b"));
  it("从没用过 → 不填", () => expect(defaultPrescriberId(list, null)).toBe(""));
  it("上一次的医生不在列表里 → 不填", () => expect(defaultPrescriberId(list, "x")).toBe(""));
});

describe("prescriberLabel", () => {
  it("优先用医生记录", () => expect(prescriberLabel({ prescriber: "李大夫", prescribers: { name: "李医生" } })).toBe("李医生"));
  it("老药方只有文字", () => expect(prescriberLabel({ prescriber: " 王大夫 ", prescribers: null })).toBe("王大夫"));
  it("都没有", () => expect(prescriberLabel({ prescriber: "  ", prescribers: null })).toBeNull());
});
