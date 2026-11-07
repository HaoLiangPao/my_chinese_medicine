import { describe, expect, it } from "vitest";
import { buildAzIndex, searchAz } from "./herb-az";

const rows = [
  { name_zh: "黄芪", pinyin: "huang qi" },
  { name_zh: "黄芩", pinyin: "huang qin" },
  { name_zh: "炙黄芪", pinyin: "zhi huang qi" },
  { name_zh: "甘草", pinyin: "gan cao" },
  { name_zh: "炙甘草", pinyin: "zhi gan cao" },
  { name_zh: "半夏", pinyin: "ban xia" },
  { name_zh: "法半夏", pinyin: "fa ban xia" },
  { name_zh: "白术", pinyin: "bai zhu" },
  { name_zh: "麦冬", pinyin: "mai dong" },
  { name_zh: "怪药", pinyin: "" }, // 没有拼音（服务器也没算出来）
  { name_zh: "女贞子", pinyin: "nü zhen zi" }, // pinyin-pro 现算的带 ü
  { name_zh: "测试驴", pinyin: "lǘ" }, // 带声调的 ü
];
const index = buildAzIndex(rows, { 北芪: "黄芪", 黄耆: "黄芪", 麦门冬: "麦冬", 生甘草: "甘草" });
const names = (letter: string) => index.groups[letter]?.map((e) => e.name);

describe("buildAzIndex：按药名本身的第一个字归类", () => {
  it("炮制品单独成一条，按自己的名字归类：炙甘草在 Z，法半夏在 F", () => {
    expect(names("Z")).toEqual(["炙甘草", "炙黄芪"]);
    expect(names("F")).toEqual(["法半夏"]);
    expect(names("G")).toEqual(["甘草"]);
    expect(names("B")).toEqual(["白术", "半夏"]);
    expect(names("H")).toEqual(["黄芪", "黄芩"]);
  });
  it("字母按 A–Z，没有拼音的放在 #，排最后", () => {
    expect(index.letters).toEqual(["B", "F", "G", "H", "L", "M", "N", "Z", "#"]);
    expect(names("#")).toEqual(["怪药"]);
  });
  it("ü 写成 v：女贞子 nv zhen zi，首字母 nzz", () => {
    expect(index.entries.find((e) => e.name === "女贞子")).toMatchObject({ pinyin: "nv zhen zi", initials: "nzz", letter: "N" });
    expect(index.entries.find((e) => e.name === "测试驴")).toMatchObject({ pinyin: "lv", letter: "L" }); // 带声调的 ǘ 也写成 v
  });
  it("别名挂在标准名上", () => {
    expect(index.entries.find((e) => e.name === "黄芪")!.aliases).toEqual(["北芪", "黄耆"]);
  });
});

describe("searchAz", () => {
  const hit = (q: string) => searchAz(index, q).map((h) => (h.via ? `${h.via}→${h.entry.name}` : h.entry.name));
  it("汉字：完全一样的排最前，包含的也找得到（搜「黄芪」也会出现炙黄芪）", () => {
    expect(hit("黄芪")).toEqual(["黄芪", "炙黄芪"]);
  });
  it("全拼（忽略空格）", () => {
    expect(hit("huangqi")).toEqual(["黄芪", "黄芩"]);
    expect(hit("mai dong")).toEqual(["麦冬"]);
  });
  it("首字母", () => {
    expect(hit("hq")).toEqual(["黄芪", "黄芩"]);
    expect(hit("zgc")).toEqual(["炙甘草"]);
  });
  it("别名：「北芪」找到黄芪，并标出是通过别名找到的", () => {
    expect(hit("北芪")).toEqual(["北芪→黄芪"]);
    expect(hit("麦门")).toEqual(["麦门冬→麦冬"]);
  });
  it("空的、找不到的", () => {
    expect(hit("  ")).toEqual([]);
    expect(hit("人参")).toEqual([]);
  });
});
