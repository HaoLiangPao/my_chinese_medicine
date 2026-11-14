import { describe, expect, it } from "vitest";
import { aliasHit, buildHerbIndex, canAddHerb, initialsOf, letterOf, searchHerbs, type HerbEntry, type HerbRow } from "./herb-index";

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

describe("别名（2026-11-13 目录扩到 400 多味，别名 200 多个）", () => {
  const idx = buildHerbIndex(rows, fallback, { 北芪: "黄芪", 炙芪: "炙黄芪", 川连: "黄连", 国老: "甘草", 不在目录: "没有这味药" });
  const names = (q: string) => searchHerbs(idx, q).map((e) => e.name);

  it("别名挂在原药材那一条上；指向炮制品的也挂在原药材上，记着指的是哪一个", () => {
    const hq = idx.entries.find((e) => e.name === "黄芪")!;
    expect(hq.aliases).toEqual([
      { alias: "北芪", id: "hq", name: "黄芪" },
      { alias: "炙芪", id: "zhq", name: "炙黄芪" },
    ]);
    expect(idx.entries.flatMap((e) => e.aliases.map((a) => a.alias))).not.toContain("不在目录");
  });
  it("别名完全一样排在药名包含前面、拼音前面", () => {
    expect(names("北芪")).toEqual(["黄芪"]);
    expect(names("川连")).toEqual(["黄连"]);
    expect(names("国")).toEqual(["甘草"]); // 别名包含
  });
  it("药名完全一样仍然排最前：搜「黄连」不会因为别名「川连」排序变化", () => {
    expect(names("黄连")[0]).toBe("黄连");
  });
  it("aliasHit：通过别名搜到的才返回别名；药名本身就含搜索词时返回 null", () => {
    const hq = idx.entries.find((e) => e.name === "黄芪")!;
    expect(aliasHit(hq, " 炙芪 ")).toEqual({ alias: "炙芪", id: "zhq", name: "炙黄芪" });
    expect(aliasHit(hq, "芪")).toBeNull(); // 「黄芪」本身含「芪」
    expect(aliasHit(hq, "北")).toEqual({ alias: "北芪", id: "hq", name: "黄芪" });
    expect(aliasHit(hq, "")).toBeNull();
  });
  it("aliasHit：别名完全一样时，即使某个炮制品的名字含它也算（炒枳壳 → 麸炒枳壳）", () => {
    const zk = buildHerbIndex(
      [
        { id: "zk", name_zh: "枳壳", pinyin: "zhi ke", base_herb_id: null },
        { id: "fczk", name_zh: "麸炒枳壳", pinyin: "fu chao zhi ke", base_herb_id: "zk" },
      ],
      undefined,
      { 炒枳壳: "麸炒枳壳" },
    ).entries[0];
    expect(aliasHit(zk, "炒枳壳")).toEqual({ alias: "炒枳壳", id: "fczk", name: "麸炒枳壳" });
    expect(aliasHit(zk, "枳壳")).toBeNull(); // 药名本身
  });
});

describe("canAddHerb", () => {
  const banxia: HerbEntry = {
    id: "1",
    name: "半夏",
    pinyin: "ban xia",
    initials: "bx",
    variants: [
      { id: "2", name: "法半夏" },
      { id: "3", name: "姜半夏" },
    ],
    aliases: [{ alias: "生半夏", id: "1", name: "半夏" }],
  };
  it("拼音 / 首字母 / 夹字母的搜索不提示新增（线上：搜 bx 提示「新增『bx』」）", () => {
    expect(canAddHerb("bx", [banxia])).toBe(false);
    expect(canAddHerb("banxia", [])).toBe(false);
    expect(canAddHerb("半夏2", [])).toBe(false);
  });
  it("已有同名药材或同名炮制品 → 不提示（否则会建出重复的「法半夏」）", () => {
    expect(canAddHerb("半夏", [banxia])).toBe(false);
    expect(canAddHerb(" 法半夏 ", [banxia])).toBe(false);
  });
  it("搜的正好是别名 → 不提示（「＋ 新增『生半夏』」点了其实选的是半夏）", () => {
    expect(canAddHerb("生半夏", [banxia])).toBe(false);
  });
  it("汉字药名、结果里没有 → 提示", () => {
    expect(canAddHerb("鸡血藤", [])).toBe(true);
    expect(canAddHerb("清半夏", [banxia])).toBe(true); // 部分匹配到半夏，但目录里确实没有清半夏
  });
  it("空搜索不提示", () => expect(canAddHerb("  ", [])).toBe(false));
});
