import { describe, expect, it } from "vitest";
import { buildHerbIndex, initialsOf, letterOf, searchHerbs, type HerbRow } from "./herb-index";

const rows: HerbRow[] = [
  { id: "gc", name_zh: "甘草", pinyin: "gan cao", base_herb_id: null },
  { id: "zgc", name_zh: "炙甘草", pinyin: "zhi gan cao", base_herb_id: "gc" },
  { id: "hq", name_zh: "黄芪", pinyin: "huang qi", base_herb_id: null },
  { id: "zhq", name_zh: "炙黄芪", pinyin: "zhi huang qi", base_herb_id: "hq" },
  { id: "hl", name_zh: "黄连", pinyin: "huang lian", base_herb_id: null },
  { id: "bx", name_zh: "半夏", pinyin: "ban xia", base_herb_id: null },
  { id: "fbx", name_zh: "法半夏", pinyin: "fa ban xia", base_herb_id: "bx" },
  { id: "jbx", name_zh: "姜半夏", pinyin: "jiang ban xia", base_herb_id: "bx" },
  { id: "fs", name_zh: "茯神", pinyin: null, base_herb_id: null }, // 用户新加的，没有拼音
  { id: "orphan", name_zh: "某炮制品", pinyin: "mou pao zhi pin", base_herb_id: "missing" }, // 原药材不在列表里
  { id: "x", name_zh: "？？", pinyin: null, base_herb_id: null }, // 算不出拼音
];
const fallback = (n: string) => ({ 茯神: "fu shen" })[n] ?? "";

describe("initialsOf / letterOf", () => {
  it("首字母", () => {
    expect(initialsOf("huang qi")).toBe("hq");
    expect(initialsOf(" Zhi  Gan Cao ")).toBe("zgc");
    expect(letterOf("huang qi")).toBe("H");
    expect(letterOf("")).toBe("#");
  });
  it("带声调或 ü 的拼音也能处理（非 a-z 字符被去掉）", () => {
    expect(letterOf("nǚ zhen zi")).toBe("N");
  });
});

describe("buildHerbIndex", () => {
  const idx = buildHerbIndex(rows, fallback);

  it("炮制品挂在原药材下面，不单独出现", () => {
    const names = idx.entries.map((e) => e.name);
    expect(names).not.toContain("炙甘草");
    expect(names).not.toContain("法半夏");
    expect(idx.groups.G.find((e) => e.name === "甘草")!.variants).toEqual([{ id: "zgc", name: "炙甘草" }]);
    expect(idx.groups.B[0].variants.map((v) => v.name).sort()).toEqual(["姜半夏", "法半夏"].sort());
  });

  it("炮制品按原药材的字母归类：炙甘草在 G，不在 Z", () => {
    expect(idx.groups.Z).toBeUndefined();
  });

  it("同一字母内按拼音排序：黄连 huang lian 在 黄芪 huang qi 前面", () => {
    expect(idx.groups.H.map((e) => e.name)).toEqual(["黄连", "黄芪"]);
  });

  it("没有拼音的用 fallback 补；补不出来的放 #，# 排最后", () => {
    expect(idx.groups.F.map((e) => e.name)).toEqual(["茯神"]);
    expect(idx.groups["#"].map((e) => e.name)).toEqual(["？？"]);
    expect(idx.letters.at(-1)).toBe("#");
    expect(idx.letters).toEqual(["B", "F", "G", "H", "M", "#"]);
  });

  it("原药材不在列表里的炮制品，自己作为一条", () => {
    expect(idx.groups.M.map((e) => e.name)).toEqual(["某炮制品"]);
  });
});

describe("searchHerbs", () => {
  const idx = buildHerbIndex(rows, fallback);
  const names = (q: string) => searchHerbs(idx, q).map((e) => e.name);

  it("汉字：完全匹配排最前；也能搜到炮制品所在的原药材", () => {
    expect(names("黄")).toEqual(["黄连", "黄芪"]);
    expect(names("炙甘草")).toEqual(["甘草"]);
    expect(names("半夏")[0]).toBe("半夏");
  });
  it("全拼前缀（忽略空格、大小写）", () => {
    expect(names("huangq")).toEqual(["黄芪"]);
    expect(names("Huang Qi")).toEqual(["黄芪"]);
  });
  it("首字母：hq → 黄芪，h → 黄连、黄芪", () => {
    expect(names("hq")).toEqual(["黄芪"]);
    expect(names("hl")).toEqual(["黄连"]);
  });
  it("空查询 / 查不到", () => {
    expect(names("  ")).toEqual([]);
    expect(names("xyz")).toEqual([]);
  });
  it("最多返回 limit 条", () => {
    expect(searchHerbs(idx, "h")).toHaveLength(2);
    expect(searchHerbs(idx, "h", 1)).toHaveLength(1);
  });
});
