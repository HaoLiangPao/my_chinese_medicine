/**
 * 药材的来源和入药部位（docs/design/0018）：
 * 1. 数据（supabase/data/herb-kinds.json）和目录（seed.sql）对得上、取值合法；
 * 2. 生成的 migration 里每味药的值 = JSON 里的（炮制品 = 原药材的，例外单列）——这里自己算一遍，不用生成脚本；
 * 3. 读的时候的兜底、显示文字、按来源分组。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupByOrigin,
  herbKindLabel,
  MEDICINAL_PARTS,
  ORIGIN_KINDS,
  resolveHerbKind,
  type HerbKind,
  type MedicinalPart,
  type OriginKind,
} from "./herb-kinds";

const root = path.resolve(import.meta.dirname, "../../..");
const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");
const processedAt = seed.indexOf("base_herb_id");
const aliasAt = seed.indexOf("herb_aliases");
const triples = (s: string) => [...s.matchAll(/\('([^']+)', '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2], m[3]] as const);
const base = triples(seed.slice(0, processedAt)).map((t) => t[0]);
const processed = triples(seed.slice(processedAt, aliasAt)).map((t) => [t[0], t[2]] as const); // 炮制品、原药材

type Data = {
  plant: Record<string, string[]>;
  fungus: string[];
  animal: string[];
  mineral: string[];
  manufactured: string[];
  processed_overrides: Record<string, { origin: string; part?: string; note: string }>;
  uncertain: Record<string, string>;
};
const data: Data = JSON.parse(readFileSync(path.join(root, "supabase/data/herb-kinds.json"), "utf8"));
const listed: [string, string, string | null][] = [
  ...Object.entries(data.plant).flatMap(([part, names]) => names.map((n) => [n, "plant", part] as [string, string, string])),
  ...(["fungus", "animal", "mineral", "manufactured"] as const).flatMap((o) => data[o].map((n) => [n, o, null] as [string, string, null])),
];

const migration = readFileSync(path.join(root, "supabase/migrations/20261114000026_herb_kinds.sql"), "utf8");
const migrated = new Map(
  [...migration.matchAll(/^ {2}\('([^']+)', '([a-z_]+)', (?:'([a-z_]+)'|null::text)\)/gm)].map((m) => [m[1], [m[2], m[3] ?? null]]),
);

describe("herb-kinds.json", () => {
  it("目录里 430 味原药材每味出现一次，没有多余的名字", () => {
    const names = listed.map((r) => r[0]);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...base].sort());
    expect(base).toHaveLength(430);
  });

  it("来源、部位只用规定的代码；部位只给植物", () => {
    expect(Object.keys(data.plant).sort()).toEqual([...MEDICINAL_PARTS].sort());
    for (const [, origin, part] of listed) {
      expect(ORIGIN_KINDS).toContain(origin);
      if (origin === "plant") expect(MEDICINAL_PARTS).toContain(part);
      else expect(part).toBeNull();
    }
  });

  it("各类的味数（0018 §2）", () => {
    const count = (o: string) => listed.filter((r) => r[1] === o).length;
    expect(ORIGIN_KINDS.map((o) => [o, count(o)])).toEqual([
      ["plant", 362],
      ["fungus", 9],
      ["animal", 35],
      ["mineral", 16],
      ["manufactured", 8],
    ]);
    expect(MEDICINAL_PARTS.map((p) => data.plant[p].length)).toEqual([122, 108, 43, 15, 25, 15, 26, 8]);
  });

  it("例外只给炮制品；拿不准的都是目录里的药", () => {
    const processedNames = processed.map((p) => p[0]);
    for (const [name, o] of Object.entries(data.processed_overrides)) {
      expect(processedNames).toContain(name);
      expect(ORIGIN_KINDS).toContain(o.origin);
      expect(o.note.length).toBeGreaterThan(0);
    }
    for (const name of Object.keys(data.uncertain)) expect(base).toContain(name);
  });
});

describe("生成的 migration", () => {
  const byName = new Map(listed.map(([n, o, p]) => [n, [o, p]]));

  it("507 行：原药材 = JSON；炮制品 = 原药材的（胆南星例外：加工品）", () => {
    expect(migrated.size).toBe(507);
    for (const n of base) expect(migrated.get(n), n).toEqual(byName.get(n));
    for (const [n, b] of processed) {
      const o = data.processed_overrides[n];
      expect(migrated.get(n), n).toEqual(o ? [o.origin, o.part ?? null] : byName.get(b));
    }
    expect(migrated.get("胆南星")).toEqual(["manufactured", null]);
    expect(migrated.get("天南星")).toEqual(["plant", "root"]);
    expect(migrated.get("煅牡蛎")).toEqual(["animal", null]);
    expect(migrated.get("焦神曲")).toEqual(["manufactured", null]);
  });

  it("只填空的、可以为空、有「植物一定有部位」的约束", () => {
    expect(migration).toContain("where h.name_zh = v.name_zh and h.origin_kind is null");
    expect(migration).toContain("add column if not exists origin_kind text check");
    expect(migration).toMatch(/check \(case when origin_kind = 'plant' then medicinal_part is not null else medicinal_part is null end\)/);
  });
});

describe("resolveHerbKind：自己的优先，空的跟原药材", () => {
  const ginseng = { origin_kind: "plant", medicinal_part: "root" };
  it("自己有值用自己的（炮制品和原药材不一样时）", () => {
    expect(resolveHerbKind({ origin_kind: "manufactured", medicinal_part: null }, ginseng)).toEqual({ origin: "manufactured", part: null });
  });
  it("自己是空的跟原药材，来源和部位一起取", () => {
    expect(resolveHerbKind({ origin_kind: null, medicinal_part: null }, ginseng)).toEqual({ origin: "plant", part: "root" });
    expect(resolveHerbKind(null, { origin_kind: "animal", medicinal_part: null })).toEqual({ origin: "animal", part: null });
  });
  it("都没有 → 未分类；不认识的代码当作没有", () => {
    expect(resolveHerbKind({ origin_kind: null, medicinal_part: null }, null)).toEqual({ origin: null, part: null });
    expect(resolveHerbKind({ origin_kind: "wild", medicinal_part: null }, null)).toEqual({ origin: null, part: null });
    expect(resolveHerbKind({ origin_kind: "animal", medicinal_part: "root" }, null)).toEqual({ origin: "animal", part: null });
  });
});

describe("显示", () => {
  it("herbKindLabel", () => {
    expect(herbKindLabel({ origin: "plant", part: "root" })).toBe("植物 · 根及根茎");
    expect(herbKindLabel({ origin: "plant", part: "resin_other" })).toBe("植物 · 树脂及其他");
    expect(herbKindLabel({ origin: "fungus", part: null })).toBe("菌藻");
    expect(herbKindLabel({ origin: "manufactured", part: null })).toBe("加工品");
    expect(herbKindLabel({ origin: null, part: null })).toBe("未分类");
  });

  it("groupByOrigin：植物按部位拆开，顺序固定，未分类在最后，组内顺序不变", () => {
    const k = (origin: OriginKind | null, part: MedicinalPart | null = null): HerbKind => ({ origin, part });
    const herbs: [string, HerbKind][] = [
      ["茯神", k(null)],
      ["石膏", k("mineral")],
      ["黄芪", k("plant", "root")],
      ["阿胶", k("manufactured")],
      ["菊花", k("plant", "flower")],
      ["甘草", k("plant", "root")],
      ["牡蛎", k("animal")],
      ["茯苓", k("fungus")],
    ];
    const groups = groupByOrigin(herbs, (h) => h[1]);
    expect(groups.map((g) => [g.key, g.label, g.herbs.map((h) => h[0]).join("")])).toEqual([
      ["root", "植物 · 根及根茎", "黄芪甘草"],
      ["flower", "植物 · 花", "菊花"],
      ["fungus", "菌藻", "茯苓"],
      ["animal", "动物", "牡蛎"],
      ["mineral", "矿物", "石膏"],
      ["manufactured", "加工品", "阿胶"],
      ["unclassified", "未分类", "茯神"],
    ]);
  });
});
