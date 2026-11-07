import { describe, expect, it } from "vitest";
import { byPinyin } from "./pinyin-order";

const h = (name_zh: string, pinyin: string | null) => ({ name_zh, pinyin });
const names = (list: ReturnType<typeof h>[]) => [...list].sort(byPinyin).map((x) => x.name_zh);

describe("byPinyin", () => {
  it("按拼音，不按汉字编码", () => {
    // 按编码是 川芎(5ddd) → 甘草(7518) → 白术(767d) → 黄芪(9ec4)
    expect(names([h("黄芪", "huang qi"), h("甘草", "gan cao"), h("白术", "bai zhu"), h("川芎", "chuan xiong")])).toEqual(["白术", "川芎", "甘草", "黄芪"]);
  });
  it("拼音相同（黄芪 / 黄芩前缀）按完整拼音再按药名", () => {
    expect(names([h("黄芩", "huang qin"), h("黄芪", "huang qi")])).toEqual(["黄芪", "黄芩"]);
  });
  it("炮制品按自己的拼音（炙甘草在 Z）", () => {
    expect(names([h("炙甘草", "zhi gan cao"), h("甘草", "gan cao"), h("白术", "bai zhu")])).toEqual(["白术", "甘草", "炙甘草"]);
  });
  it("没有拼音的（用户自己加的）现算拼音，一起排（丁香在川芎和甘草之间）", () => {
    expect(names([h("甘草", "gan cao"), h("丁香", null), h("黄芪", "huang qi"), h("川芎", "chuan xiong"), h("白术", "bai zhu")])).toEqual(["白术", "川芎", "丁香", "甘草", "黄芪"]);
  });
});
