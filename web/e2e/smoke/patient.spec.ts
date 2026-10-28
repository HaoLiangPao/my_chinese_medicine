/**
 * 病人（家庭）账号的线上冒烟测试：SMOKE_PATIENT_EMAIL / SMOKE_PATIENT_PASSWORD（GitHub Actions 的 variables / secrets）。
 * 只在这个账号自己的家庭药柜里录一张药方再删掉，不碰别人的数据；没配置账号就跳过。
 * SMOKE_PARSE=1 时额外测一次真实的拍照识别（会花一点 OpenRouter 额度，照片会留在这个账号的存储里）。
 */
import { expect, test, type Page } from "@playwright/test";
import { account, login, useWorkspace } from "./shared";

const acct = account("SMOKE_PATIENT");
test.skip(!acct, "没有配置 SMOKE_PATIENT_EMAIL / SMOKE_PATIENT_PASSWORD");
test.describe.configure({ mode: "serial" });

const TITLE = `冒烟测试 ${new Date().toISOString().slice(0, 16)}`;
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("dialog", (d) => d.accept());
});
test.afterAll(async () => page.close());

test("登录，切到家庭药柜", async () => {
  await login(page, acct!);
  await useWorkspace(page, "household");
  await expect(page.getByTestId("nav").getByRole("link", { name: "比价" })).toBeVisible();
});

test("录一张药方（别名匹配）→ 详情页 → 删除", async () => {
  await page.goto("/prescriptions/new");
  await page.locator('input[name="title"]').fill(TITLE);
  await page.locator('input[name="dose_count"]').fill("3");
  const names = page.getByLabel("药名", { exact: true });
  while ((await names.count()) < 2) await page.getByRole("button", { name: "＋ 加一味" }).click();
  await names.nth(0).fill("北芪"); // 别名 → 黄芪
  await expect(page.getByTestId("alias-hint")).toContainText("北芪 = 黄芪");
  await expect(names.nth(0)).not.toHaveClass(/border-cinnabar/);
  await page.getByLabel("每副克数").nth(0).fill("15");
  await names.nth(1).fill("党参");
  await page.getByLabel("每副克数").nth(1).fill("12");
  await page.getByRole("button", { name: "保存药方" }).click();
  await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(page.getByText("（原文 北芪）")).toBeVisible();

  await page.getByRole("button", { name: "删除这张药方" }).click();
  await page.waitForURL(/\/prescriptions(\?.*)?$/);
  await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0);
});

test("拍照识别（真实模型）", async () => {
  test.skip(process.env.SMOKE_PARSE !== "1", "SMOKE_PARSE=1 才跑");
  // 画一张打印体药方
  const img = await page.context().newPage();
  await img.setViewportSize({ width: 600, height: 400 });
  await img.setContent(
    `<body style="font:28px serif;padding:30px;background:#fff">处方 2026-10-20<br>黄芪 15g　党参 12g<br>麦冬 9g　砂仁 3g（后下）<br>共五剂，水煎服</body>`,
  );
  const buffer = await img.screenshot();
  await img.close();

  await page.goto("/prescriptions/new");
  await page.locator('input[type="file"]').setInputFiles({ name: "rx.png", mimeType: "image/png", buffer });
  await expect(page.getByText(/识别出 \d+ 味药/)).toBeVisible({ timeout: 120_000 });
  const got = await page.getByLabel("药名", { exact: true }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(got).toEqual(expect.arrayContaining(["黄芪", "党参", "麦冬", "砂仁"]));
});
