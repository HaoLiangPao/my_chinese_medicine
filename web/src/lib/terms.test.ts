import { describe, expect, it } from "vitest";
import { isAccountKind, termsFor } from "./terms";

describe("termsFor", () => {
  it("家庭：药方、药柜、采购、副", () => {
    expect(termsFor("household")).toEqual({ rx: "药方", stock: "药柜", purchase: "采购", dose: "副" });
  });
  it("诊所：处方、库存、进货、剂", () => {
    expect(termsFor("clinic")).toEqual({ rx: "处方", stock: "库存", purchase: "进货", dose: "剂" });
  });
  it("没选类型（未登录、旧账号）按家庭", () => {
    expect(termsFor(null)).toEqual(termsFor("household"));
    expect(termsFor(undefined)).toEqual(termsFor("household"));
  });
});

describe("isAccountKind", () => {
  it("只认两种", () => {
    expect(isAccountKind("household")).toBe(true);
    expect(isAccountKind("clinic")).toBe(true);
    expect(isAccountKind("shop")).toBe(false);
    expect(isAccountKind(null)).toBe(false);
  });
});
