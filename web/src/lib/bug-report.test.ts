import { describe, expect, it } from "vitest";
import { LIMITS, normalizeBugReport, pushCapped, redactText, sanitizeError, sanitizeLabel, sanitizePath, truncate } from "./bug-report";

const UUID = "3f2b8c1e-4a5d-4e6f-9a7b-0123456789ab";

describe("redactText", () => {
  it("遮住邮箱", () => {
    expect(redactText("退出登录 hao.liang+test@example.com")).toBe("退出登录 [邮箱]");
    expect(redactText("a@b.co 和 张三@诊所.cn")).toBe("[邮箱] 和 [邮箱]");
  });
  it("遮住电话（各种写法）", () => {
    for (const phone of [
      "4165550101",
      "416-555-0101",
      "(416) 555-0101",
      "+1 416 555 0101",
      "416.555.0101",
      "138 0013 8000",
      "（010）62771234",
    ]) {
      const out = redactText(`电话 ${phone} 打不通`);
      expect(out, phone).toBe("电话 [数字] 打不通");
    }
  });
  it("遮住长数字（6 位以上），短的留着", () => {
    expect(redactText("身份证 110101199003077758")).toBe("身份证 [数字]");
    expect(redactText("卡号 4111 1111 1111 1111")).toBe("卡号 [数字]");
    expect(redactText("验证码 123456")).toBe("验证码 [数字]");
    expect(redactText("黄芪 30、白术 12、共 7 剂")).toBe("黄芪 30、白术 12、共 7 剂");
    expect(redactText("第 12345 行")).toBe("第 12345 行");
  });
  it("uuid 保留，旁边的照样遮", () => {
    expect(redactText(`找不到 ${UUID}，联系 4165550101`)).toBe(`找不到 ${UUID}，联系 [数字]`);
    expect(redactText(`${UUID}${UUID}`)).toBe(`${UUID}${UUID}`);
  });
  it("重复遮结果一样", () => {
    const once = redactText("a@b.com 4165550101");
    expect(redactText(once)).toBe(once);
  });
});

describe("sanitizePath", () => {
  it("query 只留参数名、去掉值；去掉 # 后面的", () => {
    expect(sanitizePath(`/clinic/prescribe?patient=${UUID}&q=张三#top`)).toBe("/clinic/prescribe?patient&q");
    expect(sanitizePath("/prescriptions?deleted=1")).toBe("/prescriptions?deleted");
    expect(sanitizePath("/login?email=hao@example.com")).toBe("/login?email");
    expect(sanitizePath("/a?x=1&x=2")).toBe("/a?x");
  });
  it("路径里的 uuid 保留", () => {
    expect(sanitizePath(`/clinic/patients/${UUID}`)).toBe(`/clinic/patients/${UUID}`);
    expect(sanitizePath(`http://localhost:3100/prescriptions/${UUID}?from=x`)).toBe(`/prescriptions/${UUID}?from`);
  });
  it("路径里不是 uuid 的邮箱、电话遮住（包括编码过的）", () => {
    expect(sanitizePath("/u/hao@example.com/4165550101")).toBe("/u/[邮箱]/[数字]");
    expect(sanitizePath("/u/hao%40example.com")).toBe("/u/[邮箱]");
    expect(sanitizePath("/a?4165550101=1")).toBe("/a?[数字]");
  });
  it("空的、奇怪的输入", () => {
    expect(sanitizePath("")).toBe("/");
    expect(sanitizePath("/")).toBe("/");
    expect(sanitizePath("/a/%E0%A4%A")).toBe("/a/%E0%A4%A");
    expect(sanitizePath("//evil.example/x?y=1")).not.toContain("=");
  });
  it("最多 300 字", () => {
    expect(sanitizePath("/" + "a".repeat(500))).toHaveLength(LIMITS.path);
  });
});

describe("sanitizeLabel / sanitizeError / truncate", () => {
  it("按钮上的字：压成一行、遮住、最多 40 字", () => {
    expect(sanitizeLabel("  保存\n  处方 ")).toBe("保存 处方");
    expect(sanitizeLabel("张三 416-555-0101")).toBe("张三 [数字]");
    expect(Array.from(sanitizeLabel("药".repeat(100)))).toHaveLength(LIMITS.actionLabel);
  });
  it("错误：message 最多 300 字、stack 最多 1000 字，都遮过", () => {
    const e = sanitizeError("x".repeat(400) + " a@b.com", "at f (a.js:1:2)\n".repeat(200));
    expect(e.message).toHaveLength(LIMITS.errorMessage);
    expect(e.stack).toHaveLength(LIMITS.errorStack);
    expect(sanitizeError("发给 a@b.com 失败", "Error: 4165550101\n at x").message).toBe("发给 [邮箱] 失败");
    expect(sanitizeError("", "Error: 4165550101\n at x").stack).toBe("Error: [数字]\n at x");
  });
  it("先遮再截：截断不会留下半个电话", () => {
    const label = sanitizeLabel("x".repeat(36) + "4165550101");
    expect(label).toBe("x".repeat(36) + "[数字]".slice(0, 4));
    expect(label).not.toMatch(/\d/);
  });
  it("truncate 按字算，不把表情切成两半", () => {
    expect(truncate("药🌿材", 2)).toBe("药🌿");
    expect(truncate("abc", 5)).toBe("abc");
  });
});

describe("pushCapped", () => {
  it("只留最近的 max 条，不改原数组", () => {
    let list: number[] = [];
    for (let i = 1; i <= 25; i++) list = pushCapped(list, i, 20);
    expect(list).toHaveLength(20);
    expect(list[0]).toBe(6);
    expect(list.at(-1)).toBe(25);
    const before = [1, 2];
    pushCapped(before, 3, 2);
    expect(before).toEqual([1, 2]);
  });
});

describe("normalizeBugReport（服务器端，不信任浏览器）", () => {
  const t = "2026-11-10T01:02:03.456Z";
  it("正常的输入原样通过", () => {
    const input = {
      description: "保存按钮点了没反应",
      pagePath: `/clinic/patients/${UUID}`,
      userAgent: "Mozilla/5.0",
      viewport: "390x844",
      actions: [
        { t, kind: "nav", label: `/clinic/patients/${UUID}` },
        { t, kind: "click", label: "保存" },
      ],
      errors: [{ t, message: "boom", stack: "Error: boom\n at x" }],
    };
    expect(normalizeBugReport(input)).toEqual(input);
  });
  it("浏览器没脱敏的，服务器再遮一遍", () => {
    const r = normalizeBugReport({
      description: "  病人电话 4165550101 存不上  ",
      pagePath: "/clinic/prescribe?patient=张三&phone=4165550101",
      actions: [
        { t, kind: "click", label: "张三 416-555-0101" },
        { t, kind: "nav", label: "/x?q=secret" },
      ],
      errors: [{ t, message: "a@b.com", stack: "4165550101" }],
    });
    expect(r.pagePath).toBe("/clinic/prescribe?patient&phone");
    expect(r.actions.map((a) => a.label)).toEqual(["张三 [数字]", "/x?q"]);
    expect(r.errors[0]).toEqual({ t, message: "[邮箱]", stack: "[数字]" });
    // 描述是用户自己写的：只去首尾空格，不遮
    expect(r.description).toBe("病人电话 4165550101 存不上");
  });
  it("条数上限：操作留最近 20 条，错误留最近 5 条", () => {
    const r = normalizeBugReport({
      description: "x",
      pagePath: "/",
      actions: Array.from({ length: 50 }, (_, i) => ({ t, kind: "click", label: `按钮${i}` })),
      errors: Array.from({ length: 12 }, (_, i) => ({ t, message: `错${i}`, stack: "" })),
    });
    expect(r.actions).toHaveLength(LIMITS.actions);
    expect(r.actions[0].label).toBe("按钮30");
    expect(r.actions.at(-1)!.label).toBe("按钮49");
    expect(r.errors).toHaveLength(LIMITS.errors);
    expect(r.errors.map((e) => e.message)).toEqual(["错7", "错8", "错9", "错10", "错11"]);
  });
  it("长度上限", () => {
    const r = normalizeBugReport({
      description: "字".repeat(5000),
      pagePath: "/" + "p".repeat(1000),
      userAgent: "u".repeat(1000),
      actions: [
        { t, kind: "click", label: "l".repeat(500) },
        { t, kind: "nav", label: "/" + "n".repeat(500) },
      ],
      errors: [{ t, message: "m".repeat(5000), stack: "s".repeat(5000) }],
    });
    expect(r.description).toHaveLength(LIMITS.description);
    expect(r.pagePath).toHaveLength(LIMITS.path);
    expect(r.userAgent).toHaveLength(LIMITS.userAgent);
    expect(r.actions[0].label).toHaveLength(LIMITS.actionLabel);
    expect(r.actions[1].label).toHaveLength(LIMITS.actionPath);
    expect(r.errors[0].message).toHaveLength(LIMITS.errorMessage);
    expect(r.errors[0].stack).toHaveLength(LIMITS.errorStack);
  });
  it("最坏情况也在数据库的总长度约束之内（操作 8000、错误 16000）", () => {
    const r = normalizeBugReport({
      description: "x",
      pagePath: "/",
      actions: Array.from({ length: 20 }, () => ({ t, kind: "nav", label: "/" + '"'.repeat(500) })),
      errors: Array.from({ length: 5 }, () => ({ t, message: '"'.repeat(500), stack: "\n".repeat(2000) })),
    });
    expect(JSON.stringify(r.actions).length).toBeLessThanOrEqual(8000);
    expect(JSON.stringify(r.errors).length).toBeLessThanOrEqual(16000);
  });
  it("类型不对的丢掉，不报错", () => {
    for (const bad of [null, undefined, "x", 42, [], { actions: "不是数组", errors: { a: 1 }, description: 5, viewport: 390 }]) {
      const r = normalizeBugReport(bad);
      expect(r).toEqual({ description: "", pagePath: "/", userAgent: null, viewport: null, actions: [], errors: [] });
    }
    const r = normalizeBugReport({
      description: "x",
      pagePath: "/a",
      viewport: "390x844; drop table",
      actions: [null, "点了", 3, { t: "昨天", kind: "keypress", label: { evil: true } }, { t, kind: "click", label: "好的" }],
      errors: [["x"], { t: 5, message: null }],
    });
    expect(r.viewport).toBeNull();
    expect(r.actions).toEqual([
      { t: "", kind: "click", label: "" },
      { t, kind: "click", label: "好的" },
    ]);
    expect(r.errors).toEqual([{ t: "", message: "", stack: "" }]);
  });
  it("多出来的字段不会带进去", () => {
    const r = normalizeBugReport({
      description: "x",
      pagePath: "/",
      status: "fixed",
      reporter_id: "别人",
      actions: [{ t, kind: "click", label: "a", value: "输入框内容" }],
    });
    expect(Object.keys(r).sort()).toEqual(["actions", "description", "errors", "pagePath", "userAgent", "viewport"]);
    expect(r.actions[0]).toEqual({ t, kind: "click", label: "a" });
  });
});
