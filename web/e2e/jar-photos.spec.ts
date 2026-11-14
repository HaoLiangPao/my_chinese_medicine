/**
 * 本罐照片（LBL-8，docs/design/0010 §3.5）：上传 / 换 / 删，优先于默认照片，别的药柜看不到。
 * 期望值来自测试自己插入的数据和本地存储目录里的文件，不读 App 的结果。
 */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { RUN, signUp, sql, workspaceOf } from "./helpers";

test.describe.configure({ mode: "serial" });

const STORE = path.resolve(__dirname, "../../.local/storage/jar-photos");
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const owner = { email: `jar-owner+${RUN}@example.com`, password: "secret-jar-123" };
const other = { email: `jar-other+${RUN}@example.com`, password: "secret-jar-123" };
const HERB = `测试罐药${RUN}`; // 测试自己加的药，不影响别的测试
const DEFAULT_FILE = "test-only.webp";

// 一张 640×480 的 PNG（浏览器里画出来），带上 PNG 文件头，模拟手机拍的照片
async function fakePhoto(page: Page, color: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((c) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 640, 480);
    return canvas.toDataURL("image/png");
  }, color);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

// 水合完成前文件框是 disabled 的（选了文件也不会处理），等按钮从「加载中」变过来再选
const choose = async (p: Page, buffer: Buffer, name = "jar.png") => {
  await expect(p.getByRole("button", { name: /📷/ })).toBeEnabled();
  await expect(p.getByRole("button", { name: /📷/ })).not.toHaveText("加载中…");
  await p.getByTestId("jar-photo-input").setInputFiles({ name, mimeType: "image/png", buffer });
};

let herbId: string;
let ws: string;
let page: Page;
const folderFiles = () => (existsSync(path.join(STORE, ws, herbId)) ? readdirSync(path.join(STORE, ws, herbId)) : []);
const photoPath = async () =>
  (
    await sql<{ photo_path: string | null }>("select photo_path from pantry_settings where workspace_id = $1 and herb_id = $2", [
      ws,
      herbId,
    ])
  )[0]?.photo_path ?? null;

test.beforeAll(async ({ browser }) => {
  [{ id: herbId }] = await sql<{ id: string }>("insert into herbs (name_zh) values ($1) returning id", [HERB]);
  // 这味药有一张默认照片（只测「本罐照片优先」，文件本身不需要存在）
  await sql(
    `insert into herb_photos (herb_id, file, kind, author, license, source_url, reviewed_by, reviewed_at)
     values ($1, $2, '饮片', '测试作者', 'CC0', 'https://commons.wikimedia.org/wiki/File:Test.jpg', '测试', '2026-11-12')`,
    [herbId, DEFAULT_FILE],
  );
  page = await browser.newPage();
  await signUp(page, owner);
  ws = await workspaceOf(owner.email);
});
test.afterAll(async () => {
  await page.close();
  // 删掉测试自己加的药材（herb_photos、pantry_settings 跟着删），免得出处页的行数影响 herb-photos.spec.ts
  await sql("delete from herbs where name_zh in ($1, $2)", [HERB, `测试无图药${RUN}`]);
});

test("上传本罐照片：详情页显示它，默认照片不显示；存的是重新编码过的图", { tag: ["@LBL-8"] }, async () => {
  await page.goto(`/herbs/${herbId}`);
  await expect(page.getByTestId("herb-photo").locator("img")).toHaveAttribute("src", `/herb-photos/${DEFAULT_FILE}`);
  await expect(page.getByTestId("jar-photo")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "删除本罐照片" })).toHaveCount(0);

  await choose(page, await fakePhoto(page, "#c33"), "jar.png");
  const img = page.getByTestId("jar-photo").locator("img");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(640);
  await expect(page.getByTestId("herb-photo")).toHaveCount(0);

  const saved = await photoPath();
  expect(saved).toMatch(new RegExp(`^${ws}/${herbId}/[0-9a-f-]{36}\\.(webp|jpg)$`));
  expect(folderFiles()).toEqual([path.basename(saved!)]);
  // Chromium 能编码 WebP：存的是 WebP（重新编码过，不是原来的 PNG）
  const head = readFileSync(path.join(STORE, saved!)).subarray(0, 12).toString("latin1");
  expect(head.startsWith("RIFF") && head.endsWith("WEBP")).toBe(true);
  await page.screenshot({ path: `${SHOTS}/本罐照片-详情.png`, fullPage: true });
});

test("换一张：新文件替换旧文件，旧文件删掉", { tag: ["@LBL-8"] }, async () => {
  const before = await photoPath();
  await page.goto(`/herbs/${herbId}`);
  await expect(page.getByRole("button", { name: "📷 换一张本罐照片" })).toBeVisible();
  await choose(page, await fakePhoto(page, "#3a3"), "jar2.png");
  await expect.poll(photoPath).not.toBe(before);
  const after = await photoPath();
  await expect(page.getByTestId("jar-photo").locator("img")).toHaveAttribute("src", new RegExp(path.basename(after!)));
  expect(folderFiles()).toEqual([path.basename(after!)]);
});

test("不是图片的文件不能上传", { tag: ["@LBL-8"] }, async () => {
  const before = await photoPath();
  await page.goto(`/herbs/${herbId}`);
  await choose(page, Buffer.from("not an image"), "x.png");
  await expect(page.getByTestId("jar-photo-controls").getByRole("alert")).toContainText("打不开");
  expect(await photoPath()).toBe(before);
  expect(folderFiles()).toEqual([path.basename(before!)]);
});

test("别的药柜看不到本罐照片", { tag: ["@LBL-8"] }, async ({ browser }) => {
  const p2 = await browser.newPage();
  await signUp(p2, other);
  await p2.goto(`/herbs/${herbId}`);
  await expect(p2.getByRole("heading", { level: 1 })).toHaveText(HERB);
  await expect(p2.getByTestId("jar-photo")).toHaveCount(0);
  await expect(p2.getByTestId("herb-photo").locator("img")).toHaveAttribute("src", `/herb-photos/${DEFAULT_FILE}`);
  // 用别人的登录身份直接查 API：读不到这一行，也改不掉（本地存储网关不检查权限，文件的 storage 策略由 SQL 测试 jar_photos_test 覆盖）
  const asOther = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await asOther.auth.signInWithPassword(other)).error).toBeNull();
  const { data, error } = await asOther.from("pantry_settings").select("photo_path").eq("herb_id", herbId);
  expect(error).toBeNull();
  expect(data).toEqual([]);
  await asOther.from("pantry_settings").update({ photo_path: null }).eq("workspace_id", ws).eq("herb_id", herbId);
  expect(await photoPath()).not.toBeNull();
  const { data: canRead } = await asOther.rpc("can_access_jar_photo", { object_name: (await photoPath())! });
  expect(canRead).toBe(false);
  await p2.close();
});

test("删除本罐照片：回到默认照片，文件也删掉；手机不溢出", { tag: ["@LBL-8"] }, async () => {
  await page.goto(`/herbs/${herbId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "删除本罐照片" }).click();
  await expect(page.getByTestId("jar-photo")).toHaveCount(0);
  await expect(page.getByTestId("herb-photo").locator("img")).toHaveAttribute("src", `/herb-photos/${DEFAULT_FILE}`);
  expect(await photoPath()).toBeNull();
  expect(folderFiles()).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await choose(page, await fakePhoto(page, "#36c"), "jar3.png");
  await expect(page.getByTestId("jar-photo").locator("img")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/本罐照片-详情-手机.png`, fullPage: true });
});

test("没有默认照片的药：占位图下面有「拍一张上传」，上传后显示自己的照片，删了回到占位图", { tag: ["@LBL-8"] }, async () => {
  const [{ id }] = await sql<{ id: string }>("insert into herbs (name_zh) values ($1) returning id", [`测试无图药${RUN}`]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/herbs/${id}`);
  const ph = page.getByTestId("no-photo");
  await expect(ph).toContainText("暂时没有照片");
  await expect(ph.getByRole("button", { name: "📷 拍一张上传" })).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/本罐照片-占位图入口.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(ph.getByRole("button", { name: "📷 拍一张上传" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/本罐照片-占位图入口-手机.png`, fullPage: true });

  await choose(page, await fakePhoto(page, "#963"), "jar4.png");
  await expect(page.getByTestId("jar-photo").locator("img")).toBeVisible();
  await expect(page.getByTestId("no-photo")).toHaveCount(0);
  const [{ photo_path }] = await sql<{ photo_path: string }>(
    "select photo_path from pantry_settings where workspace_id = $1 and herb_id = $2",
    [ws, id],
  );
  expect(photo_path).toMatch(new RegExp(`^${ws}/${id}/[0-9a-f-]{36}\\.(webp|jpg)$`));

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "删除本罐照片" }).click();
  await expect(page.getByTestId("no-photo")).toBeVisible();
  await expect(page.getByTestId("jar-photo")).toHaveCount(0);
  expect(existsSync(path.join(STORE, ws, id)) ? readdirSync(path.join(STORE, ws, id)) : []).toEqual([]);
});
