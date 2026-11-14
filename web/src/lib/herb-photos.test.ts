/**
 * 药材默认照片（supabase/data/herb-photos.json + web/public/herb-photos/，docs/design/0010 §3.5）的一致性检查。
 * 照片认得对不对要 Hao 核对；这里挡住：没核对的图混进网站、授权不在白名单、缺出处、文件和记录对不上。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Entry = {
  name: string;
  reviewed: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
  photo: {
    file: string;
    kind: string;
    commons_title: string;
    source_url: string;
    author: string | null;
    license: string;
    license_url: string | null;
    width: number;
    height: number;
  } | null;
};

const root = path.resolve(import.meta.dirname, "../../..");
const { herbs } = JSON.parse(readFileSync(path.join(root, "supabase/data/herb-photos.json"), "utf8")) as { herbs: Entry[] };
const publicDir = path.join(root, "web/public/herb-photos");
const files = existsSync(publicDir) ? readdirSync(publicDir) : [];
const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");
const seedNames = new Set([...seed.matchAll(/\('([一-鿿]+)', '[a-z ]+'/g)].map((m) => m[1]));

describe("herb-photos.json", () => {
  it("每味药都在目录里、不重复", () => {
    expect(herbs.filter((h) => !seedNames.has(h.name)).map((h) => h.name)).toEqual([]);
    expect(new Set(herbs.map((h) => h.name)).size).toBe(herbs.length);
  });

  it("有照片的一定核对过，并记了核对人和日期", () => {
    const bad = herbs.filter((h) => h.photo && !(h.reviewed && h.reviewed_by?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(h.reviewed_at ?? "")));
    expect(bad.map((h) => h.name)).toEqual([]);
  });

  it("授权只能是公有领域 / CC0 / CC BY / CC BY-SA，要署名的有作者，来源是 Commons", () => {
    for (const h of herbs.filter((x) => x.photo)) {
      const p = h.photo!;
      expect(p.license, h.name).toMatch(/^(Public domain|PD\b|CC0|CC BY(-SA)? \d)/i);
      expect(p.license, h.name).not.toMatch(/NC|ND/);
      if (/^CC BY/i.test(p.license)) expect(p.author?.trim(), `${h.name} 要署名`).toBeTruthy();
      expect(p.source_url, h.name).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(["饮片", "药材", "植物"], h.name).toContain(p.kind);
    }
  });

  it("记录里的图片文件都在，每张不超过 150KB，还有列表用的小图", () => {
    for (const h of herbs.filter((x) => x.photo)) {
      const p = h.photo!;
      expect(p.file, h.name).toMatch(/^[a-z]+(-[a-z]+)*\.webp$/);
      expect(files, h.name).toContain(p.file);
      expect(files, h.name).toContain(p.file.replace(/\.webp$/, ".thumb.webp"));
      expect(statSync(path.join(publicDir, p.file)).size, h.name).toBeLessThanOrEqual(150 * 1024);
      expect(Math.max(p.width, p.height), h.name).toBeLessThanOrEqual(800);
    }
  });

  it("网站目录里没有多余的图（没核对的不能混进来）", () => {
    const expected = new Set(herbs.filter((h) => h.photo).flatMap((h) => [h.photo!.file, h.photo!.file.replace(/\.webp$/, ".thumb.webp")]));
    expect(files.filter((f) => !expected.has(f))).toEqual([]);
  });

  it("migration 里写进数据库的每一行，都是 JSON 里核对过的那张图（不能把图挂到没核对的药上）", () => {
    const dir = path.join(root, "supabase/migrations");
    const rows = readdirSync(dir)
      .filter((f) => /_herb_photos_data.*\.sql$/.test(f))
      .sort()
      .slice(-1) // 脚本每次生成全部核对过的照片，最新的一个就是现在的状态
      .flatMap((f) => [
        ...readFileSync(path.join(dir, f), "utf8").matchAll(
          /^\s*\('([^']+)', '([^']+)', '([^']+)', (?:'(?:[^']|'')*'|null), '([^']+)', (?:'[^']*'|null), '([^']+)'/gm,
        ),
      ]);
    expect(rows.length).toBeGreaterThan(0);
    const reviewed = new Map(herbs.filter((h) => h.reviewed && h.photo).map((h) => [h.name, h.photo!]));
    for (const [, name, file, kind, license, source] of rows) {
      const p = reviewed.get(name);
      expect(p, `${name} 在 migration 里，但 JSON 里没有核对过的照片`).toBeTruthy();
      expect([file, kind, license, source], name).toEqual([p!.file, p!.kind, p!.license, p!.source_url]);
    }
    // 反过来：JSON 里核对过的都进了 migration
    expect(new Set(rows.map((r) => r[1]))).toEqual(new Set(reviewed.keys()));
  });
});
