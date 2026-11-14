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
const kindLabel = (k: string) => (k === "植物" ? "原植物" : k);

// 有照片的原药材；没核对过（reviewed: false）、原药材也没有照片的药
const withPhoto = entries.find((e) => e.reviewed && e.photo && !baseOf.has(e.name))!;
const without = entries.find((e) => !e.reviewed && !baseOf.has(e.name))!;
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

test("炮制品没有自己的照片 → 用原药材的，注明「图为原药材」；原药材也没有 → 占位图", { tag: ["@LBL-6"] }, async ({ page }) => {
  await signUp(page, { ...user, email: `photo2+${RUN}@example.com` });
  // 测试自己建一对「原药材 + 炮制品」，给原药材挂一张已有的图（不依赖核对结果里刚好有这种情况），测完删掉
  const [base] = await sql<{ id: string }>("insert into herbs (name_zh) values ($1) returning id", [`测试原药${RUN}`]);
  const [proc] = await sql<{ id: string }>("insert into herbs (name_zh, base_herb_id) values ($1, $2) returning id", [
    `测试炮制${RUN}`,
    base.id,
  ]);
  const p = withPhoto.photo!;
  try {
    await page.goto(`/herbs/${proc.id}`);
    await expect(page.getByTestId("herb-photo")).toHaveCount(0);
    await expect(page.getByTestId("no-photo")).toBeVisible();
    await sql(
      `insert into herb_photos (herb_id, file, kind, author, license, source_url, reviewed_by, reviewed_at)
       values ($1, $2, '植物', $3, $4, $5, '测试', '2026-11-12')`,
      [base.id, p.file, p.author, p.license, p.source_url],
    );
    await page.goto(`/herbs/${proc.id}`);
    await expect(page.getByTestId("herb-photo").locator("img")).toHaveAttribute("src", `/herb-photos/${p.file}`);
    await expect(page.getByTestId("herb-photo-caption")).toHaveText(`原植物 · 图为原药材测试原药${RUN}`);
    await expect(page.getByTestId("no-photo")).toHaveCount(0);
  } finally {
    await sql("delete from herbs where id in ($1, $2)", [proc.id, base.id]);
  }
});

test("没核对的药：不显示照片、文件也不在网站上；显示「暂时没有照片」占位图", { tag: ["@LBL-6"] }, async ({ page }) => {
  await signUp(page, { ...user, email: `photo3+${RUN}@example.com` });
  await page.goto(`/herbs/${await herbId(without.name)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(without.name);
  await expect(page.getByTestId("herb-photo")).toHaveCount(0);
  const ph = page.getByTestId("no-photo");
  await expect(ph).toBeVisible();
  await expect(ph).toContainText("暂时没有照片");
  await expect(ph.getByRole("img", { name: "鞠躬的小药童" })).toBeVisible();
  // 没核对的药，网站上没有它的图片文件（文件名按 seed.sql 的拼音推出来）
  const pinyin = seed.match(new RegExp(`\\('${without.name}', '([a-z ]+)'`))![1];
  const res = await page.request.get(`/herb-photos/${pinyin.replace(/ /g, "-")}.webp`);
  expect(res.status()).toBe(404);
  await page.screenshot({ path: `${SHOTS}/药材照片-占位图.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(ph).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // 手机上占位图不占太多地方（不超过 120px 高）
  expect((await ph.boundingBox())!.height).toBeLessThanOrEqual(120);
  await page.screenshot({ path: `${SHOTS}/药材照片-占位图-手机.png`, fullPage: true });
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
