/**
 * 诊所账号的线上冒烟测试：SMOKE_CLINIC_EMAIL / SMOKE_CLINIC_PASSWORD（GitHub Actions 的 variables / secrets）。
 * 开方用固定的「冒烟测试病人」（病人不能删，所以每次复用，第一次自动新建）；处方保存、检查消息后删掉。
 * 不扣库存、不进货，不改诊所的真实数据。
 */
import { expect, test, type Page } from "@playwright/test";
import { account, login, useWorkspace } from "./shared";

const acct = account("SMOKE_CLINIC");
test.skip(!acct, "没有配置 SMOKE_CLINIC_EMAIL / SMOKE_CLINIC_PASSWORD");
test.describe.configure({ mode: "serial" });

const PATIENT = "冒烟测试病人";
let page: Page;

test.beforeAll(async ({ browser }) => {
  // 用 newContext（不是 browser.newPage），和 patient.spec.ts 一致：需要时可以在同一个上下文里再开页面
  page = await (await browser.newContext()).newPage();
  page.on("dialog", (d) => d.accept());
});
test.afterAll(async () => page.context().close());

test("登录，切到诊所；导航是诊所的", async () => {
  await login(page, acct!);
  await useWorkspace(page, "clinic");
  const nav = page.getByTestId("nav");
  await expect(nav.getByRole("link", { name: "开方" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "病人" })).toBeVisible();
  // 处方页的入口是开方，不是家庭的录方表单
  await page.goto("/prescriptions");
  await expect(page.getByRole("link", { name: "＋ 开方" })).toHaveAttribute("href", "/clinic/prescribe");
});

test("开方：选病人 → 搜药（拼音首字母、炮制品）→ 保存 → 微信消息没有价格 → 删除", async () => {
  await page.goto("/clinic/prescribe");
  await page.getByLabel("搜病人").fill(PATIENT);
  const hit = page.getByTestId("patient-results").getByTestId("patient-result").filter({ hasText: PATIENT });
  const found = await hit.first().waitFor({ timeout: 5_000 }).then(() => true, () => false); // 搜索有防抖 + 服务器往返
  if (found) {
    await hit.first().click();
  } else {
    await page.getByRole("button", { name: "＋ 新病人" }).click();
    await page.getByLabel("病人姓名").fill(PATIENT);
    await page.getByRole("button", { name: "保存病人" }).click();
  }
  await expect(page.getByTestId("selected-patient")).toContainText(PATIENT);

  // 拼音首字母搜「bx」→ 半夏 → 炮制品法半夏；不能提示「新增 bx」
  await page.getByLabel("搜药材").fill("bx");
  await expect(page.getByRole("button", { name: /＋ 新增/ })).toHaveCount(0);
  await page.getByTestId("letter-panel").getByTestId("herb-半夏").click();
  await page.getByTestId("variant-chooser").getByTestId("variant-法半夏").click();
  const ed = page.getByTestId("line-editor");
  await ed.getByRole("button", { name: "9g", exact: true }).click();
  await ed.getByRole("button", { name: "加入处方" }).click();
  await expect(page.getByTestId("line-法半夏")).toBeVisible();

  await page.getByRole("button", { name: "保存并生成消息" }).click();
  await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}\?new=1$/);
  const msg = page.getByTestId("wechat-message");
  await expect(msg).toHaveValue(new RegExp(`患者：${PATIENT}`));
  await expect(msg).toHaveValue(/1\. 法半夏 9g/);
  expect(await msg.inputValue()).not.toContain("$"); // 消息里没有价格

  await page.getByRole("button", { name: "删除这张药方" }).click();
  await page.waitForURL(/\/prescriptions(\?.*)?$/);
});
