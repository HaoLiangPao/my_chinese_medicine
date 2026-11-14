/**
 * 中医小学徒（docs/design/0019）：随机动作、台词拼装、禁用字眼。
 * 期望值手写；整个目录（seed.sql）+ 资料草稿 JSON 也跑一遍，检查拼出来的每一句都没有用量 / 用药建议的字眼。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPRENTICE_ACTIONS,
  DISCLAIMER,
  FORBIDDEN,
  allowedTerms,
  catalogLines,
  composeHerbLines,
  forbiddenWords,
  herbLines,
  pickAction,
  pickIndex,
  seededRandom,
  shuffle,
  type HerbFacts,
} from "./apprentice";
import { GENERIC_LINES } from "./apprentice-lines";
import type { Monograph } from "./herb-monograph";

const mono = (over: Partial<Monograph> = {}): Monograph => ({
  herb_id: "h1",
  latin_name: "Poria",
  source: "多孔菌科真菌茯苓的干燥菌核",
  flavors: ["甘", "淡"],
  nature: "平",
  meridians: ["心", "肺", "脾", "肾"],
  traditional_use: "利水渗湿，健脾，宁心",
  processing: null,
  regions: "云南、安徽、湖北",
  quality: "体重坚实、断面白色细腻者佳",
  toxicity: "none",
  cautions: "虚寒精滑者慎用",
  storage: "置干燥处，防潮",
  reference: "中国药典",
  check_note: null,
  flag_note: null,
  status: "reviewed",
  reviewed_by: "李医生",
  reviewed_at: "2026-11-10",
  ...over,
});

const fuling: HerbFacts = {
  name: "茯苓",
  pinyin: "fu ling",
  category: "利水渗湿药",
  aliases: ["云苓"],
  base: null,
  variants: [],
  sameCategory: ["猪苓", "泽泻", "薏苡仁", "车前子"],
  monograph: { data: mono(), fromBase: false },
};

describe("随机", () => {
  it("同一个种子结果一样；不同种子会不同", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRandom(43)()).not.toBe(xs[0]);
    expect(pickAction(123456)).toBe(pickAction(123456));
    expect(shuffle(["a", "b", "c", "d", "e"], 7)).toEqual(shuffle(["a", "b", "c", "d", "e"], 7));
  });

  it("五个动作都可能出现，而且大致一样多（1000 个种子，每个 120–280 次）", () => {
    expect(APPRENTICE_ACTIONS.map((a) => a.id)).toEqual(["read", "pound", "weigh", "drawer", "needle"]);
    expect(APPRENTICE_ACTIONS.map((a) => a.label)).toEqual(["读书", "捣药", "称药", "翻药斗", "练针灸"]);
    const count = new Map<string, number>();
    for (let s = 0; s < 1000; s++) count.set(pickAction(s), (count.get(pickAction(s)) ?? 0) + 1);
    expect([...count.keys()].sort()).toEqual(["drawer", "needle", "pound", "read", "weigh"]);
    for (const c of count.values()) {
      expect(c).toBeGreaterThan(120);
      expect(c).toBeLessThan(280);
    }
  });

  it("pickIndex 在 0 … n-1 之内；n = 0 → -1；边界种子（0、2^32-1）也行", () => {
    for (const s of [0, 1, 4294967295, 2 ** 31]) {
      const i = pickIndex(s, 507);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(507);
    }
    expect(pickIndex(5, 1)).toBe(0);
    expect(pickIndex(5, 0)).toBe(-1);
  });

  it("洗牌不丢不重、不改原数组", () => {
    const src = Array.from({ length: 20 }, (_, i) => i);
    const out = shuffle(src, 99);
    expect([...out].sort((a, b) => a - b)).toEqual(src);
    expect(out).not.toEqual(src);
    expect(src[0]).toBe(0);
  });
});

describe("禁用字眼", () => {
  it("用量、服法、针对病人的说法都能挡住", () => {
    expect(forbiddenWords("茯苓 10g")).toEqual(["g"]);
    expect(forbiddenWords("每次三钱")).toEqual(["钱"]);
    expect(forbiddenWords("这个患者需要茯苓")).toEqual(["患者", "需要"]);
    expect(forbiddenWords("每日一次，温水服用")).toEqual(["服用", "每日", "一次"]);
    expect(forbiddenWords("15 克")).toEqual(["克"]);
    expect(forbiddenWords("20 ML")).toEqual(["ml"]);
  });

  it("药名、拼音、别名里的字不算（金钱草、两面针、拼音里的 g）", () => {
    expect(forbiddenWords("金钱草，拼音 jin qian cao。", ["金钱草", "jin qian cao"])).toEqual([]);
    expect(forbiddenWords("两面针归在清热药里", ["两面针"])).toEqual([]);
    expect(forbiddenWords("金钱草 10 克", ["金钱草"])).toEqual(["克"]);
  });

  it("手写的通用台词每一句都没有禁用字眼、不重复、不太长", () => {
    expect(GENERIC_LINES.length).toBeGreaterThanOrEqual(15);
    for (const l of GENERIC_LINES) {
      expect(forbiddenWords(l), l).toEqual([]);
      expect(l.length, l).toBeLessThanOrEqual(40);
    }
    expect(new Set(GENERIC_LINES).size).toBe(GENERIC_LINES.length);
  });

  it("禁用词表里有 Hao 例子里那种说法（患者需要）和常见的用量单位", () => {
    for (const w of ["克", "g", "钱", "服用", "患者", "需要"]) expect(FORBIDDEN).toContain(w);
  });
});

describe("一味药的台词", () => {
  it("茯苓（已审核资料）：拼音、分类、同类、别名、性味归经、传统用途、来源、产区、选品、保存", () => {
    expect(herbLines(fuling)).toEqual([
      "茯苓，拼音 fu ling。先把字认准，抓药才不会抓错。",
      "茯苓归在利水渗湿药里，我在一类一类地背。",
      "我在背利水渗湿药：茯苓、猪苓、泽泻、薏苡仁……",
      "茯苓也写作云苓。方子上看到别的写法，也要认得是它。",
      "茯苓：甘、淡，平，归心、肺、脾、肾经。背下来了！",
      "书上记的茯苓的传统用途：利水渗湿，健脾，宁心。这是中医传统用法，我先背下来。",
      "原来茯苓是多孔菌科真菌茯苓的干燥菌核。",
      "茯苓的道地产区：云南、安徽、湖北。",
      "挑茯苓要看：体重坚实、断面白色细腻者佳。",
      "茯苓的保存：置干燥处，防潮。",
    ]);
  });

  it("不用「使用注意」（谁不能用更像用药建议，留在资料区原文显示）", () => {
    expect(herbLines(fuling).join("")).not.toContain("慎用");
  });

  it("已审核、但审核人标了「有问题」的资料也不用", () => {
    const lines = herbLines({ ...fuling, monograph: { data: mono({ flag_note: "产区要再查" }), fromBase: false } });
    expect(lines.join("")).not.toMatch(/利水渗湿，健脾|多孔菌|云南|甘、淡/);
  });

  it("草稿资料一句都不用", () => {
    const lines = herbLines({ ...fuling, monograph: { data: mono({ status: "draft" }), fromBase: false } });
    expect(lines.join("")).not.toMatch(/利水渗湿，健脾|多孔菌|云南|甘、淡/);
    expect(lines).toHaveLength(4);
  });

  it("大黄（原药材，有炮制品；有毒性的写一句要仔细核对）", () => {
    const lines = herbLines({
      name: "大黄",
      pinyin: "da huang",
      category: "泻下药",
      aliases: ["川军"],
      base: null,
      variants: ["酒大黄", "熟大黄", "大黄炭"],
      sameCategory: [],
      monograph: { data: mono({ toxicity: "minor", source: null, regions: null, quality: null, storage: null }), fromBase: false },
    });
    expect(lines).toContain("大黄还有酒大黄、熟大黄、大黄炭这些炮制品。师父说炮制不同，用法也不同，抓药时要看清。");
    expect(lines).toContain("书上写大黄有小毒，抓药、保存都要格外仔细核对。");
    expect(lines.some((l) => l.startsWith("我在背"))).toBe(false); // 没有同类的药就不说
  });

  it("炮制品：说出原药材；资料是原药材的就用原药材的名字说", () => {
    const lines = herbLines({
      name: "蜜麻黄",
      pinyin: "mi ma huang",
      category: "解表药",
      aliases: ["炙麻黄"],
      base: "麻黄",
      variants: [],
      sameCategory: ["桂枝"],
      monograph: { data: mono({ traditional_use: "发汗散寒，宣肺平喘，利水消肿" }), fromBase: true },
    });
    expect(lines).toContain("蜜麻黄是麻黄的炮制品。师父说炮制不同，用法也不同，抓药时要看清。");
    expect(lines).toContain("蜜麻黄还没有单独的资料，我先看原药材麻黄的。");
    expect(lines).toContain("书上记的麻黄的传统用途：发汗散寒，宣肺平喘，利水消肿。这是中医传统用法，我先背下来。");
  });

  it("资料里混进了用量（理论上审核时挡住了）→ 那一句不说，其他照常", () => {
    const lines = herbLines({ ...fuling, monograph: { data: mono({ traditional_use: "利水渗湿，常用 10 克" }), fromBase: false } });
    expect(lines.join("")).not.toContain("10 克");
    expect(lines).toContain("茯苓的保存：置干燥处，防潮。");
  });

  it("只拼出 1–2 句的（常山：涌吐药只有它一味）→ 用通用台词补到 3 句", () => {
    const lines = herbLines({
      name: "常山",
      pinyin: "chang shan",
      category: "涌吐药",
      aliases: [],
      base: null,
      variants: [],
      sameCategory: [],
      monograph: null,
    });
    expect(lines).toEqual([
      "常山，拼音 chang shan。先把字认准，抓药才不会抓错。",
      "常山归在涌吐药里，我在一类一类地背。",
      GENERIC_LINES[0],
    ]);
  });

  it("用户自己加的药（什么数据都没有）→ 一句「去问问师父」+ 通用台词", () => {
    const lines = herbLines({
      name: "秘方草",
      pinyin: null,
      category: null,
      aliases: [],
      base: null,
      variants: [],
      sameCategory: [],
      monograph: null,
    });
    expect(lines[0]).toBe("秘方草？目录里还没有它的资料，我得去问问师父。");
    expect(lines.slice(1)).toEqual([...GENERIC_LINES]);
  });

  it("目录页：第一句带目录的味数，后面是通用台词", () => {
    expect(catalogLines(507)[0]).toBe("目录里有 507 味药，我一天认几味，慢慢来。"); // 不说「药柜」：家庭账号的药柜是自己的库存
    expect(catalogLines(507).slice(1)).toEqual([...GENERIC_LINES]);
  });

  it("免责小字", () => expect(DISCLAIMER).toBe("小学徒在学习，仅为中药知识，不作用药建议"));
});

describe("整个目录跑一遍（seed.sql 的名单 + 资料草稿 JSON 当作已审核）", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");
  const processedAt = seed.indexOf("base_herb_id");
  const aliasAt = seed.indexOf("herb_aliases");
  const triples = (s: string) => [...s.matchAll(/\('([^']+)', '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2], m[3]] as const);
  const base = triples(seed.slice(0, processedAt)); // 药名、拼音、分类
  const processed = triples(seed.slice(processedAt, aliasAt)); // 药名、拼音、原药材
  const aliases = [...seed.slice(aliasAt).matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]] as const);
  type Raw = { name: string; flavors: string[]; nature: string; meridians: string[]; use: string } & Record<string, unknown>;
  const raw = JSON.parse(readFileSync(path.join(root, "supabase/data/herb-monographs.json"), "utf8")).herbs as Raw[];
  const monographs = new Map(
    raw.map((r) => [
      r.name,
      mono({
        flavors: r.flavors,
        nature: r.nature,
        meridians: r.meridians,
        traditional_use: r.use,
        source: (r.source as string) ?? null,
        regions: (r.regions as string) ?? null,
        quality: (r.quality as string) ?? null,
        processing: (r.processing as string) ?? null,
        storage: (r.storage as string) ?? null,
        toxicity: (r.toxicity as Monograph["toxicity"]) ?? null,
      }),
    ]),
  );
  const categoryOf = new Map(base.map(([n, , c]) => [n, c]));
  const all = [
    ...base.map(([name, pinyin, category]) => ({ name, pinyin, category, base: null as string | null })),
    ...processed.map(([name, pinyin, b]) => ({ name, pinyin, category: categoryOf.get(b) ?? null, base: b as string | null })),
  ];

  it(`${base.length} + ${processed.length} 味：拼出来的台词（过滤以前）只有半夏的炮制一句有禁用字眼；过滤后每味至少 3 句`, () => {
    expect(all.length).toBeGreaterThan(500);
    let withMonograph = 0;
    const linesOf = new Map<string, string[]>();
    const dropped: string[] = [];
    for (const h of all) {
      const own = monographs.get(h.name);
      const fromBase = !own && h.base ? monographs.get(h.base) : undefined;
      if (own || fromBase) withMonograph++;
      const facts: HerbFacts = {
        ...h,
        aliases: aliases.filter(([, to]) => to === h.name).map(([a]) => a),
        variants: processed.filter(([, , b]) => b === h.name).map(([n]) => n),
        sameCategory: all.filter((x) => x.category === h.category && x.name !== h.name).map((x) => x.name),
        monograph: own ? { data: own, fromBase: false } : fromBase ? { data: fromBase, fromBase: true } : null,
      };
      const lines = herbLines(facts);
      linesOf.set(h.name, lines);
      expect(lines.length, h.name).toBeGreaterThanOrEqual(3);
      // 检查过滤以前的：模板本身写了禁用字眼的话，每味药都会出现在这里
      dropped.push(...composeHerbLines(facts).filter((l) => forbiddenWords(l, allowedTerms(facts)).length > 0));
    }
    // 半夏自己，加上用半夏资料的炮制品，说的是同一句
    expect([...new Set(dropped)]).toEqual([`半夏的炮制：${raw.find((r) => r.name === "半夏")!.processing}。`]);
    expect(withMonograph).toBeGreaterThan(100); // 真的跑到了资料那几句
    // 资料草稿里只有半夏的炮制写了「内服」，那一句不说；别的药的炮制照常说
    expect(linesOf.get("半夏")!.some((l) => l.startsWith("半夏的炮制"))).toBe(false);
    expect(linesOf.get("麻黄")!.some((l) => l.startsWith("麻黄的炮制"))).toBe(true);
  });
});
