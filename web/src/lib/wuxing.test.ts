import { describe, expect, it } from "vitest";
import { CORRESPONDENCE, ELEMENTS, controlledBy, controls, generatedBy, generates, relation, shichen, yangShare } from "./wuxing";

describe("五行相生", () => {
  it.each([
    ["木", "火"],
    ["火", "土"],
    ["土", "金"],
    ["金", "水"],
    ["水", "木"],
  ] as const)("%s 生 %s", (a, b) => {
    expect(generates(a)).toBe(b);
    expect(generatedBy(b)).toBe(a);
  });
});

describe("五行相克", () => {
  it.each([
    ["木", "土"],
    ["土", "水"],
    ["水", "火"],
    ["火", "金"],
    ["金", "木"],
  ] as const)("%s 克 %s", (a, b) => {
    expect(controls(a)).toBe(b);
    expect(controlledBy(b)).toBe(a);
  });
});

describe("relation", () => {
  it("任意一个元素看其他四个，恰好是 我生/生我/我克/克我 各一个", () => {
    for (const a of ELEMENTS) {
      const rels = ELEMENTS.filter((b) => b !== a).map((b) => relation(a, b)).sort();
      expect(rels).toEqual(["克我", "我克", "我生", "生我"].sort());
    }
  });
  it("关系是对称的：a 生 b ⇔ b 的「生我」是 a；a 克 b ⇔ b 的「克我」是 a", () => {
    for (const a of ELEMENTS)
      for (const b of ELEMENTS) {
        if (relation(a, b) === "我生") expect(relation(b, a)).toBe("生我");
        if (relation(a, b) === "我克") expect(relation(b, a)).toBe("克我");
      }
  });
  it("自己 → same", () => expect(relation("土", "土")).toBe("same"));
});

describe("五行对应", () => {
  it("五脏、五腑互不重复", () => {
    expect(new Set(ELEMENTS.map((e) => CORRESPONDENCE[e].zang)).size).toBe(5);
    expect(new Set(ELEMENTS.map((e) => CORRESPONDENCE[e].fu)).size).toBe(5);
  });
  it("几组常见对应", () => {
    expect(CORRESPONDENCE.木).toMatchObject({ zang: "肝", fu: "胆", sense: "目", taste: "酸" });
    expect(CORRESPONDENCE.水).toMatchObject({ zang: "肾", fu: "膀胱", sense: "耳", emotion: "恐" });
  });
});

describe("阴阳消长（示意）", () => {
  it("子时阳最少、午时阳最盛、卯酉各半", () => {
    expect(yangShare(0)).toBe(0);
    expect(yangShare(12)).toBe(1);
    expect(yangShare(6)).toBe(0.5);
    expect(yangShare(18)).toBe(0.5);
  });
  it("跨天取模", () => {
    expect(yangShare(24)).toBe(yangShare(0));
    expect(yangShare(-6)).toBe(yangShare(18));
  });
  it("单调：0→12 增加，12→24 减少", () => {
    for (let h = 0; h < 12; h++) expect(yangShare(h + 1)).toBeGreaterThan(yangShare(h));
    for (let h = 12; h < 24; h++) expect(yangShare(h + 1)).toBeLessThan(yangShare(h));
  });
});

describe("十二时辰", () => {
  it.each([
    [23, "子时"],
    [0, "子时"],
    [1, "丑时"],
    [11, "午时"],
    [12, "午时"],
    [13, "未时"],
    [22, "亥时"],
  ] as const)("%d 点是 %s", (h, s) => expect(shichen(h)).toBe(s));
});
