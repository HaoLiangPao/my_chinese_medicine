/**
 * 药材资料草稿（supabase/data/herb-monographs.json，docs/design/0010 §3.2）的格式检查。
 * 内容对不对要人工审核；这里只挡住格式错误和「写了用量」。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as impl from "./herb-monograph";

type Entry = {
  name: string;
  base?: string;
  flavors: string[];
  nature: string;
  meridians: string[];
  use: string;
  toxicity?: string;
  cautions?: string | null;
  reference: string;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
};

const root = path.resolve(import.meta.dirname, "../../..");
const { herbs } = JSON.parse(readFileSync(path.join(root, "supabase/data/herb-monographs.json"), "utf8")) as { herbs: Entry[] };
const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");
// 种子里的药材：('药名', 'pinyin', …)；炮制品：('炮制品', 'pinyin', '原药材')
const seedNames = new Set([...seed.matchAll(/\('([一-鿿]+)', '[a-z ]+'/g)].map((m) => m[1]));
const processedBlock = seed.slice(seed.indexOf("base_herb_id"), seed.indexOf("herb_aliases"));
const seedBase = new Map([...processedBlock.matchAll(/\('([一-鿿]+)', '[a-z ]+', '([一-鿿]+)'\)/g)].map((m) => [m[1], m[2]]));

// 测试自己写一份，不用实现里的（实现写错时这里要能发现）
const NATURES = ["寒", "凉", "平", "温", "热"].flatMap((n) => [n, `微${n}`, `大${n}`]);
const FLAVORS = ["酸", "苦", "甘", "辛", "咸", "淡", "涩"].flatMap((f) => [f, `微${f}`]);
const MERIDIANS = ["肺", "大肠", "胃", "脾", "心", "小肠", "膀胱", "肾", "心包", "三焦", "胆", "肝"];
const TOXICITY = ["none", "minor", "toxic", "severe"];
const DOSE = /\d+(\.\d+)?\s*(g|克|钱|两|mg|毫克)/i;

describe("药材资料草稿", () => {
  it("页面用的列表和这里的一致", () => {
    expect(impl.NATURES).toEqual(NATURES);
    expect(impl.FLAVORS).toEqual(FLAVORS);
    expect(impl.MERIDIANS).toEqual(MERIDIANS);
    expect(Object.keys(impl.TOXICITY)).toEqual(TOXICITY);
    expect(impl.DOSE.source).toBe(DOSE.source);
  });

  // 2026-11-13 目录扩到 400 多味（docs/design/0017）：新加的药资料分批补，所以只要求资料里的药都在目录里
  it("资料里的药都在种子目录里，没有重复", () => {
    expect(herbs.length).toBeGreaterThanOrEqual(119);
    for (const h of herbs) expect(seedNames.has(h.name), h.name).toBe(true);
    expect(new Set(herbs.map((h) => h.name)).size).toBe(herbs.length);
  });

  it("炮制品的 base 和种子目录一致；原药材有完整资料", () => {
    for (const h of herbs) {
      expect(h.base, h.name).toBe(seedBase.get(h.name));
      if (!h.base) expect(h.toxicity, `${h.name} 缺毒性`).toBeDefined();
    }
  });

  it.each(herbs.map((h) => [h.name, h] as const))("%s：性味归经写法合法", (_name, h) => {
    expect(NATURES).toContain(h.nature);
    expect(h.flavors.length).toBeGreaterThan(0);
    for (const f of h.flavors) expect(FLAVORS).toContain(f);
    expect(h.meridians.length).toBeGreaterThan(0);
    for (const m of h.meridians) expect(MERIDIANS).toContain(m);
    if (h.toxicity) expect(TOXICITY).toContain(h.toxicity);
    expect(["中国药典", "中药学教材"]).toContain(h.reference);
  });

  it("不写用量（传统用途、使用注意里没有「数字 + 克」）", () => {
    for (const h of herbs) {
      expect(h.use, h.name).not.toMatch(DOSE);
      expect(h.cautions ?? "", h.name).not.toMatch(DOSE);
    }
  });

  it("审核状态：草稿没有审核人；已审核的必须有审核人和日期", () => {
    for (const h of herbs) {
      expect(["draft", "reviewed"]).toContain(h.status);
      if (h.status === "reviewed") {
        expect(h.reviewed_by, h.name).toBeTruthy();
        expect(h.reviewed_at, h.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      } else {
        expect(h.reviewed_by, h.name).toBeUndefined();
      }
    }
  });
});
