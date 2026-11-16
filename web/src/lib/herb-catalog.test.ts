/**
 * 全站共用的药材目录（supabase/seed.sql，docs/design/0017）的数据检查，以及 400 多味时选药索引还好用。
 * 名字对不对要人工审核；这里只挡住格式错误、重名、别名冲突。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAzIndex, searchAz } from "./herb-az";
import { buildHerbIndex, searchHerbs, type HerbRow } from "./herb-index";

const root = path.resolve(import.meta.dirname, "../../..");
const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");
const processedAt = seed.indexOf("base_herb_id");
const aliasAt = seed.indexOf("herb_aliases");
const triples = (s: string) => [...s.matchAll(/\('([^']+)', '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2], m[3]] as const);
const base = triples(seed.slice(0, processedAt)); // 药名、拼音、分类
const processed = triples(seed.slice(processedAt, aliasAt)); // 药名、拼音、原药材
const aliases = [...seed.slice(aliasAt).matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]] as const);

// 《中药学》教材的功效分类（补虚药按补气 / 补血 / 补阴 / 补阳分开，和原来的目录一致）。测试自己写一份
const CATEGORIES = [
  "解表药",
  "清热药",
  "泻下药",
  "祛风湿药",
  "化湿药",
  "利水渗湿药",
  "温里药",
  "理气药",
  "消食药",
  "驱虫药",
  "止血药",
  "活血化瘀药",
  "化痰止咳平喘药",
  "安神药",
  "平肝息风药",
  "开窍药",
  "补气药",
  "补血药",
  "补阴药",
  "补阳药",
  "收涩药",
  "涌吐药",
  "攻毒杀虫止痒药",
  "拔毒化腐生肌药",
];

describe("药材目录（seed.sql）", () => {
  const names = [...base, ...processed].map((h) => h[0]);
  const nameSet = new Set(names);

  it("数量：430 味原药材、77 个炮制品、212 个别名", () => {
    expect([base.length, processed.length, aliases.length]).toEqual([430, 77, 212]);
  });

  it("药名不重复，只有汉字", () => {
    expect(nameSet.size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[㐀-鿿]+$/);
  });

  it("拼音：小写、一个字一个音节（ü 写成 v）", () => {
    for (const [name, py] of [...base, ...processed]) {
      expect(py, name).toMatch(/^[a-z]+( [a-z]+)*$/);
      expect(py.split(" ").length, name).toBe([...name].length);
    }
  });

  it("多音字按药材的读法（不能用 pinyin-pro 现算）", () => {
    const py = new Map([...base, ...processed].map(([n, p]) => [n, p]));
    expect(py.get("苦参")).toBe("ku shen");
    expect(py.get("重楼")).toBe("chong lou");
    expect(py.get("莪术")).toBe("e zhu");
    expect(py.get("蛤壳")).toBe("ge qiao");
    expect(py.get("海螵蛸")).toBe("hai piao xiao");
    expect(py.get("槟榔")).toBe("bing lang");
  });

  it("分类都是教材里的功效分类", () => {
    for (const [name, , cat] of base) expect(CATEGORIES, name).toContain(cat);
  });

  it("炮制品指回的原药材在目录里，而且本身不是炮制品", () => {
    const baseNames = new Set(base.map((h) => h[0]));
    for (const [name, , b] of processed) expect(baseNames.has(b), `${name} → ${b}`).toBe(true);
  });

  it("别名：不重复、不和药名重名（match_herb 先按药名找）、指向的药在目录里", () => {
    expect(new Set(aliases.map((a) => a[0])).size).toBe(aliases.length);
    for (const [alias, target] of aliases) {
      expect(nameSet.has(alias), `别名 ${alias} 和药名重名`).toBe(false);
      expect(nameSet.has(target), `${alias} → ${target}`).toBe(true);
    }
  });

  it("没收的药不在目录里（docs/design/0017 §3）", () => {
    for (const n of ["穿山甲", "马兜铃", "关木通", "广防己", "罂粟壳", "斑蝥", "红粉", "轻粉", "茯神"])
      expect(nameSet.has(n), n).toBe(false);
    // 「萆薢」不确定是哪一种，不设别名
    expect(aliases.map((a) => a[0])).not.toContain("萆薢");
  });
});

describe("400 多味时的选药", () => {
  const ids = new Map([...base, ...processed].map(([n], i) => [n, `id${i}`]));
  const rows: HerbRow[] = [
    ...base.map(([n, p]) => ({ id: ids.get(n)!, name_zh: n, pinyin: p, base_herb_id: null })),
    ...processed.map(([n, p, b]) => ({ id: ids.get(n)!, name_zh: n, pinyin: p, base_herb_id: ids.get(b)! })),
  ];
  const aliasMap = Object.fromEntries(aliases);

  it("诊所开方（首字母分组）：炮制品都挂在原药材下，每个字母最多 50 味", () => {
    const idx = buildHerbIndex(rows, undefined, aliasMap);
    expect(idx.entries).toHaveLength(430);
    expect(idx.entries.reduce((n, e) => n + e.variants.length, 0)).toBe(77);
    for (const l of idx.letters) expect(idx.groups[l].length, l).toBeLessThanOrEqual(50);
    expect(idx.letters).not.toContain("#");
    const name = (q: string) => searchHerbs(idx, q)[0]?.name;
    expect(name("元胡")).toBe("延胡索");
    expect(name("炙麻黄")).toBe("麻黄"); // 炮制品的别名找到原药材那一条（页面上直接选蜜麻黄）
    expect(name("龟板")).toBe("龟甲");
    expect(name("yhs")).toBe("延胡索");
  });

  it("家庭录方（A–Z）：炮制品单独一条；别名能搜到", () => {
    const idx = buildAzIndex(
      [...base, ...processed].map(([n, p]) => ({ name_zh: n, pinyin: p })),
      aliasMap,
    );
    expect(idx.entries).toHaveLength(507);
    expect(idx.letters[0]).toBe("A"); // 艾叶、矮地茶
    const first = (q: string) => searchAz(idx, q)[0];
    expect(first("云苓")).toMatchObject({ entry: { name: "茯苓" }, via: "云苓" });
    expect(first("炙麻黄")).toMatchObject({ entry: { name: "蜜麻黄" }, via: "炙麻黄" });
  });

  it("建索引 + 搜一次在 50 ms 以内（手机上每输入一个字都要搜）", () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      const az = buildAzIndex(
        [...base, ...processed].map(([n, p]) => ({ name_zh: n, pinyin: p })),
        aliasMap,
      );
      searchAz(az, "h");
      searchHerbs(buildHerbIndex(rows, undefined, aliasMap), "h", 30);
    }
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });
});
