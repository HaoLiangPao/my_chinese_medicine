import { describe, expect, it } from "vitest";
import { checkMonograph, guiJing, parseMonographForm, resolveMonograph, reviewedMonth, xingWei, type Monograph } from "./herb-monograph";

const base: Monograph = {
  herb_id: "b",
  latin_name: "Glycyrrhizae Radix et Rhizoma",
  source: "豆科植物甘草的干燥根和根茎",
  flavors: ["甘"],
  nature: "平",
  meridians: ["心", "肺", "脾", "胃"],
  traditional_use: "补脾益气，清热解毒",
  processing: "生用或蜜炙",
  regions: "内蒙古、甘肃",
  quality: "皮细紧、色红棕者佳",
  toxicity: "none",
  cautions: "不宜与海藻同用",
  storage: "置通风干燥处",
  reference: "中国药典",
  check_note: null,
  flag_note: null,
  status: "reviewed",
  reviewed_by: "李医生",
  reviewed_at: "2026-11-08",
};
const own: Monograph = {
  ...base,
  herb_id: "p",
  latin_name: null,
  source: null,
  traditional_use: "补脾和胃，益气复脉",
  processing: "蜜炙",
  regions: null,
  quality: null,
  toxicity: null,
  cautions: null,
  storage: null,
  status: "draft",
  reviewed_by: null,
  reviewed_at: null,
};

describe("resolveMonograph", () => {
  it("没有资料 → null", () => {
    expect(resolveMonograph(null, null)).toBeNull();
  });
  it("炮制品没有自己的 → 用原药材的，并标出来", () => {
    expect(resolveMonograph(null, base)).toEqual({ data: base, fromBase: true, inheritsDraft: false });
  });
  it("炮制品有自己的 → 自己写了的用自己的，空着的用原药材的；状态是自己的", () => {
    const r = resolveMonograph(own, base)!;
    expect(r.fromBase).toBe(false);
    expect(r.data.traditional_use).toBe("补脾和胃，益气复脉");
    expect(r.data.processing).toBe("蜜炙");
    expect(r.data.toxicity).toBe("none");
    expect(r.data.regions).toBe("内蒙古、甘肃");
    expect(r.data.status).toBe("draft");
    expect(r.data.reviewed_by).toBeNull();
  });
  it("原药材自己的资料", () => {
    expect(resolveMonograph(base, null)).toEqual({ data: base, fromBase: false, inheritsDraft: false });
  });
  it("炮制品自己审核过，但用到了原药材还没审核的字段 → 整份按草稿显示", () => {
    const r = resolveMonograph(
      { ...own, status: "reviewed", reviewed_by: "李医生", reviewed_at: "2026-11-08" },
      { ...base, status: "draft", reviewed_by: null, reviewed_at: null },
    )!;
    expect(r.inheritsDraft).toBe(true);
    expect(r.data.status).toBe("draft");
    expect(r.data.reviewed_by).toBeNull();
    expect(r.data.toxicity).toBe("none"); // 内容照样显示
  });
  it("炮制品自己审核过、原药材也审核过 → 已审核", () => {
    const r = resolveMonograph({ ...own, status: "reviewed", reviewed_by: "李医生", reviewed_at: "2026-11-08" }, base)!;
    expect(r.inheritsDraft).toBe(false);
    expect(r.data.status).toBe("reviewed");
  });
  it("炮制品什么都没继承（字段都自己写了）→ 原药材是草稿也不影响", () => {
    const full = { ...base, herb_id: "p", status: "reviewed" as const };
    const r = resolveMonograph(full, { ...base, status: "draft", reviewed_by: null, reviewed_at: null })!;
    expect(r.inheritsDraft).toBe(false);
    expect(r.data.status).toBe("reviewed");
  });
});

describe("显示格式", () => {
  it("性味、归经、审核月份", () => {
    expect(xingWei({ flavors: ["甘", "微苦"], nature: "微寒" })).toBe("甘、微苦，微寒");
    expect(guiJing({ meridians: ["心", "肺", "胃"] })).toBe("心、肺、胃经");
    expect(reviewedMonth("2026-11-08")).toBe("2026-11");
    expect(reviewedMonth(null)).toBe("");
  });
});

describe("parseMonographForm", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  it("味、归经可以用顿号 / 逗号 / 空格分开，归经去掉「经」字；空字段是 null", () => {
    const c = parseMonographForm(
      form({
        flavors: "甘、 微苦",
        nature: " 微寒 ",
        meridians: "心经，肺经 胃",
        traditional_use: "养阴生津",
        toxicity: "none",
        regions: "  ",
      }),
    );
    expect(c.flavors).toEqual(["甘", "微苦"]);
    expect(c.nature).toBe("微寒");
    expect(c.meridians).toEqual(["心", "肺", "胃"]);
    expect(c.regions).toBeNull();
    expect(c.toxicity).toBe("none");
  });
  it("毒性不在列表里 → null", () => {
    expect(parseMonographForm(form({ toxicity: "很毒" })).toxicity).toBeNull();
  });
});

describe("checkMonograph", () => {
  const ok = { ...base };
  it("合法", () => {
    expect(checkMonograph(ok)).toBeNull();
  });
  it.each([
    [{ nature: "很冷" }, "「性」"],
    [{ flavors: [] }, "「味」"],
    [{ flavors: ["甜"] }, "「味」"],
    [{ meridians: ["头"] }, "「归经」"],
    [{ traditional_use: "" }, "传统用途"],
    [{ traditional_use: "养阴，每次 10g" }, "不写用量"],
    [{ cautions: "不超过 3 钱" }, "不写用量"],
    [{ cautions: "每日 15 克" }, "不写用量"],
  ])("%o → %s", (patch, msg) => {
    expect(checkMonograph({ ...ok, ...patch })).toContain(msg);
  });
});
