import { describe, expect, it } from "vitest";
import { parseNumber, parseRxText } from "./rx-text";
import { formatWeChatMessage } from "./rx-message";

// 测试用的药材目录（和真目录无关，只决定「拿不准时」选哪种切法）
const CATALOG = new Set(["黄芪", "炙黄芪", "白术", "甘草", "陈皮", "当归", "三七", "五味子", "薄荷", "法半夏"]);
const isKnown = (n: string) => CATALOG.has(n);

describe("parseNumber", () => {
  it.each([
    ["30", 30],
    ["7.5", 7.5],
    ["十", 10],
    ["十二", 12],
    ["三十", 30],
    ["一百二十", 120],
    ["两百", 200],
    ["三十五", 35],
    ["一百零五", 105],
    ["七半", 7.5],
    ["半", 0.5],
  ])("%s → %d", (s, n) => expect(parseNumber(s)).toBe(n));
  it("认不出", () => expect(parseNumber("许多")).toBeNull());
});

describe("parseRxText：CLN-5 的微信消息原样粘进来", () => {
  // 用 rx-message.ts 生成，和诊所发出去的格式一定一致
  const msg = formatWeChatMessage({
    clinicName: "李医生诊所",
    date: "2026-11-07",
    patient: { name: "张三" },
    doses: 7,
    items: [
      { name: "炙黄芪", grams: 18 },
      { name: "薄荷", grams: 3, prep: "后下", note: "最后 5 分钟放" },
      { name: "法半夏", grams: 9.5 },
      { name: "三七", grams: 3, prep: "冲服" },
    ],
    instructions: "水煎服，日一剂，早晚分服",
    advice: "忌生冷",
  });
  const r = parseRxText(msg, isKnown);

  it("药名、克数、脚注、备注", () => {
    expect(r.items).toEqual([
      { name: "炙黄芪", grams: 18, prep: null, note: null },
      { name: "薄荷", grams: 3, prep: "后下", note: "最后 5 分钟放" },
      { name: "法半夏", grams: 9.5, prep: null, note: null },
      { name: "三七", grams: 3, prep: "冲服", note: null },
    ]);
  });
  it("日期、患者、剂数、煎服法、医嘱", () => {
    expect(r).toMatchObject({ issued_on: "2026-11-07", patient: "张三", dose_count: 7, instructions: "水煎服，日一剂，早晚分服", advice: "忌生冷" });
  });
  it("抬头和分隔线不算认不出", () => expect(r.unrecognized).toEqual([]));
  it("患者没填写的不当成名字", () => {
    expect(parseRxText("患者：（未填写）").patient).toBeNull();
  });
});

describe("parseRxText：手写的格式", () => {
  it("一行几味，空格 / 逗号 / 顿号分开，单位 g / 克 / 省略", () => {
    expect(parseRxText("黄芪30g 白术12克，甘草 6、陈皮：9g", isKnown).items.map((i) => [i.name, i.grams])).toEqual([
      ["黄芪", 30],
      ["白术", 12],
      ["甘草", 6],
      ["陈皮", 9],
    ]);
  });
  it("中文数字要带「克」；药名后面直接跟中文数字时，按目录选切法", () => {
    expect(parseRxText("黄芪三十克 当归十五克", isKnown).items.map((i) => [i.name, i.grams])).toEqual([
      ["黄芪", 30],
      ["当归", 15],
    ]);
    // 三七十克：三七 + 十克（不是 三 + 七十克）
    expect(parseRxText("三七十克\n三七三克\n三七两克", isKnown).items.map((i) => [i.name, i.grams])).toEqual([
      ["三七", 10],
      ["三七", 3],
      ["三七", 2],
    ]);
  });
  it("拿不准怎么切（没有目录、或者几种切法都不在目录里）：整行留着，不猜", () => {
    expect(parseRxText("三七十克")).toMatchObject({ items: [], unrecognized: ["三七十克"] });
    expect(parseRxText("黄芪三十克")).toMatchObject({ items: [], unrecognized: ["黄芪三十克"] });
  });
  it("没写单位的，药名要在目录里；不在就整行留着", () => {
    expect(parseRxText("早晚各 1\n去白术 12\n甘草 6", isKnown)).toMatchObject({
      items: [{ name: "甘草", grams: 6 }],
      unrecognized: ["早晚各 1", "去白术 12"],
    });
    // 写了单位的不在目录里也认（保存时会新建，表单里标红）
    expect(parseRxText("新药材 12g", isKnown).items).toEqual([{ name: "新药材", grams: 12, prep: null, note: null }]);
  });
  it("药名里有数字的字（三七、五味子）", () => {
    expect(parseRxText("三七 3g 五味子6克").items.map((i) => [i.name, i.grams])).toEqual([
      ["三七", 3],
      ["五味子", 6],
    ]);
  });
  it("脚注的备注保留原来的标点", () => {
    expect(parseRxText("薄荷 3g（后下，最后五分钟，不要久煎）").items[0]).toEqual({ name: "薄荷", grams: 3, prep: "后下", note: "最后五分钟，不要久煎" });
    expect(parseRxText("薄荷 3g（不要久煎）").items[0]).toMatchObject({ prep: null, note: "不要久煎" });
  });
  it("同一栏出现几行（医嘱、备注、煎服法）：接起来，不覆盖", () => {
    expect(parseRxText("医嘱：忌生冷\n备注：复诊\n煎服法：水煎服\n用法：早晚分服")).toMatchObject({
      advice: "忌生冷；复诊",
      instructions: "水煎服；早晚分服",
    });
  });
  it("序号、括号脚注", () => {
    expect(parseRxText("1、生石膏 30g（先煎）\n(2) 车前子 15g(包煎)\n③ 阿胶 10g（烊化）").items).toEqual([
      { name: "生石膏", grams: 30, prep: "先煎", note: null },
      { name: "车前子", grams: 15, prep: "包煎", note: null },
      { name: "阿胶", grams: 10, prep: "烊化", note: null },
    ]);
  });
  it("剂数和日期的其他写法", () => {
    expect(parseRxText("七副\n日期：2026年11月7日")).toMatchObject({ dose_count: 7, issued_on: "2026-11-07" });
    expect(parseRxText("共5剂").dose_count).toBe(5);
  });
});

describe("parseRxText：认不出的行原样留着", () => {
  it("说明文字、一行里有认不出的部分、克数为 0、不存在的日期", () => {
    const text = "上次的方子去掉白术\n黄芪 30g 还有一点点甘草\n甘草 0g\n日期：2026-02-30\n日期：2026-11-07 星期六\n  当归 10g  ";
    const r = parseRxText(text, isKnown);
    expect(r.items).toEqual([{ name: "当归", grams: 10, prep: null, note: null }]);
    expect(r.unrecognized).toEqual(["上次的方子去掉白术", "黄芪 30g 还有一点点甘草", "甘草 0g", "日期：2026-02-30", "日期：2026-11-07 星期六"]);
    expect(r.issued_on).toBeNull();
  });
  it("空文字", () => expect(parseRxText("  \n\n")).toMatchObject({ items: [], unrecognized: [] }));
});
