/**
 * 药材默认照片（docs/design/0010 §3.5、§4.1）。
 * 期望值从 supabase/data/herb-photos.json 和 supabase/seed.sql 读（照片的来源文件），不读 App 的结果。
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RUN, signUp, sql, workspaceOf } from "./helpers";

type Entry = {
  name: string;
  reviewed: boolean;
  photo: { file: string; kind: string; author: string | null; license: string; source_url: string } | null;
};
const root = path.resolve(__dirname, "../..");
const entries = (JSON.parse(readFileSync(path.join(root, "supabase/data/herb-photos.json"), "utf8")) as { herbs: Entry[] }).herbs;
const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");
const processedBlock = seed.slice(seed.indexOf("base_herb_id"), seed.indexOf("herb_aliases"));
// 炮制品 → 原药材：('炙黄芪', 'zhi huang qi', '黄芪')
const baseOf = new Map([...processedBlock.matchAll(/\('([^']+)', '[a-z ]+', '([^']+)'\)/g)].map((m) => [m[1], m[2]]));
const shown = (name: string) => entries.find((e) => e.name === name && e.reviewed && e.photo)?.photo ?? null;
const kindLabel = (k: string) => (k === "植物" ? "原植物" : k);

// 有照片的原药材；自己没有照片、原药材有的炮制品；自己和原药材都没有照片的药
const withPhoto = entries.find((e) => e.reviewed && e.photo && !baseOf.has(e.name))!;
const fallback = [...baseOf.entries()].find(([name, base]) => !shown(name) && shown(base));
const without = entries.find((e) => !shown(e.name) && !(baseOf.has(e.name) && shown(baseOf.get(e.name)!)))!;
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");

const user = { email: `photo+${RUN}@example.com`, password: "secret-photo-123" };
const herbId = async (name: string) => (await sql<{ id: string }>("select id from herbs where name_zh = $1", [name]))[0].id;

test.describe.configure({ mode: "serial" });

test("药材详情页：最上面是照片，写明饮片 / 原植物和出处", { tag: ["@LBL-6"] }, async ({ page }) => {
  expect(withPhoto, "herb-photos.json 里至少要有一味核对过的照片").toBeTruthy();
  await signUp(page, user);
  const p = withPhoto.photo!;
  await page.goto(`/herbs/${await herbId(withPhoto.name)}`);
  const fig = page.getByTestId("herb-photo");
  await expect(fig).toBeVisible();
  const img = fig.locator("img");
  await expect(img).toHaveAttribute("src", `/herb-photos/${p.file}`);
  // 图片真的加载出来了（文件在、路由没被登录拦住）
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId("herb-photo-caption")).toHaveText(kindLabel(p.kind));
  const credit = page.getByTestId("herb-photo-credit");
  await expect(credit).toContainText(p.license);
  if (p.author) await expect(credit).toContainText(p.author);
  await expect(credit.getByRole("link", { name: /Wikimedia Commons/ })).toHaveAttribute("href", p.source_url);
  // 照片在药名上面
  const photoBox = await fig.boundingBox();
  const titleBox = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(photoBox!.y).toBeLessThan(titleBox!.y);
  await page.screenshot({ path: `${SHOTS}/药材照片-详情.png`, fullPage: true });
});

test("炮制品没有自己的照片 → 用原药材的，注明「图为原药材」", { tag: ["@LBL-6"] }, async ({ page }) => {
  test.skip(!fallback, "已核对的照片里没有「炮制品没有、原药材有」的情况");
  const [name, base] = fallback!;
  await signUp(page, { ...user, email: `photo2+${RUN}@example.com` });
  await page.goto(`/herbs/${await herbId(name)}`);
  await expect(page.getByTestId("herb-photo").locator("img")).toHaveAttribute("src", `/herb-photos/${shown(base)!.file}`);
  await expect(page.getByTestId("herb-photo-caption")).toHaveText(`${kindLabel(shown(base)!.kind)} · 图为原药材${base}`);
});

test("没有照片的药不显示照片区域", { tag: ["@LBL-6"] }, async ({ page }) => {
  await signUp(page, { ...user, email: `photo3+${RUN}@example.com` });
  await page.goto(`/herbs/${await herbId(without.name)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(without.name);
  await expect(page.getByTestId("herb-photo")).toHaveCount(0);
});

test("药材列表有小图；出处汇总页列出作者和授权；手机不溢出", { tag: ["@LBL-6"] }, async ({ page }) => {
  const u = { ...user, email: `photo4+${RUN}@example.com` };
  await signUp(page, u);
  // 用过的药材：一张药方，有照片的和没照片的各一味
  const ws = await workspaceOf(u.email);
  const [rx] = await sql<{ id: string }>(
    "insert into prescriptions (workspace_id, title, dose_count) values ($1, '照片测试', 1) returning id",
    [ws],
  );
  for (const name of [withPhoto.name, without.name]) {
    await sql("insert into prescription_items (prescription_id, herb_id, grams_per_dose) select $1, id, 10 from herbs where name_zh = $2", [
      rx.id,
      name,
    ]);
  }
  await page.goto("/herbs");
  const thumb = page.getByRole("row").filter({ hasText: withPhoto.name }).getByTestId("herb-thumb");
  await expect(thumb).toHaveAttribute("src", `/herb-photos/${withPhoto.photo!.file.replace(/\.webp$/, ".thumb.webp")}`);
  await expect.poll(() => thumb.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("row").filter({ hasText: without.name }).getByTestId("herb-thumb")).toHaveCount(0);

  await page.goto("/herbs/photo-credits");
  const expected = entries.filter((e) => e.reviewed && e.photo);
  const table = page.getByTestId("photo-credits");
  await expect(table.locator("tbody tr")).toHaveCount(expected.length);
  const row = table.getByRole("row").filter({ hasText: withPhoto.name });
  await expect(row).toContainText(withPhoto.photo!.license);
  if (withPhoto.photo!.author) await expect(row).toContainText(withPhoto.photo!.author);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [url, ready] of [
    [`/herbs/${await herbId(withPhoto.name)}`, page.getByTestId("herb-photo")],
    ["/herbs/photo-credits", page.getByTestId("photo-credits")],
    ["/herbs", page.getByTestId("herb-thumb").first()],
  ] as const) {
    await page.goto(url);
    await expect(ready).toBeVisible(); // 等内容出来（不是「加载中」）再量
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await page.goto(`/herbs/${await herbId(withPhoto.name)}`);
  await expect
    .poll(() =>
      page
        .getByTestId("herb-photo")
        .locator("img")
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: `${SHOTS}/药材照片-详情-手机.png`, fullPage: true });
  await page.goto("/herbs");
  await expect(page.getByTestId("herb-thumb").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/药材照片-列表-手机.png` });
  await page.goto("/herbs/photo-credits");
  await page.screenshot({ path: `${SHOTS}/药材照片-出处-手机.png`, fullPage: true });
});
