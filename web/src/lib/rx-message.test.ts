import { describe, expect, it } from "vitest";
import { formatWeChatMessage, itemLine, patientLabel } from "./rx-message";

const base = {
  clinicName: "李医生诊所",
  date: "2026-10-27",
  patient: { name: "张三", phone: "416-555-0101" },
  doses: 7,
  items: [
    { name: "炙黄芪", grams: 18 },
    { name: "党参", grams: "12.00" },
    { name: "薄荷", grams: 3, prep: "后下", note: "最后 5 分钟放" },
    { name: "炙甘草", grams: 4.5, prep: null, note: "  " },
    { name: "阿胶", grams: 6, prep: "烊化" },
    { name: "砂仁", grams: 3, note: "打碎" },
  ],
  instructions: "水煎服，日一剂，早晚分服",
  advice: "忌生冷\n多休息",
};

describe("formatWeChatMessage", () => {
  it("完整格式", () => {
    expect(formatWeChatMessage(base)).toBe(
      [
        "【李医生诊所】处方",
        "日期：2026-10-27",
        "患者：张三",
        "共 7 剂",
        "————————",
        "1. 炙黄芪 18g",
        "2. 党参 12g",
        "3. 薄荷 3g（后下；最后 5 分钟放）",
        "4. 炙甘草 4.5g",
        "5. 阿胶 6g（烊化）",
        "6. 砂仁 3g（打碎）",
        "————————",
        "煎服法：水煎服，日一剂，早晚分服",
        "医嘱：忌生冷 多休息",
      ].join("\n"),
    );
  });

  it("不含任何价格信息", () => {
    expect(formatWeChatMessage(base)).not.toMatch(/\$|元|价/);
  });

  it("没有医嘱、没有煎服法时不写那一行", () => {
    const m = formatWeChatMessage({ ...base, advice: "", instructions: null });
    expect(m).not.toContain("医嘱");
    expect(m).not.toContain("煎服法");
    expect(m.endsWith("————————")).toBe(true);
  });

  it("只有电话的病人显示电话；都没有显示（未填写）", () => {
    expect(patientLabel({ name: " ", phone: "647 555 0202" })).toBe("647 555 0202");
    expect(patientLabel({})).toBe("（未填写）");
  });
});

describe("itemLine", () => {
  it("克数去掉多余的 0；两位小数保留", () => {
    expect(itemLine({ name: "甘草", grams: "6.00" }, 0)).toBe("1. 甘草 6g");
    expect(itemLine({ name: "甘草", grams: 1.25 }, 1)).toBe("2. 甘草 1.25g");
  });
  it("名字前后空格去掉", () => {
    expect(itemLine({ name: " 黄芪 ", grams: 10 }, 0)).toBe("1. 黄芪 10g");
  });
});
