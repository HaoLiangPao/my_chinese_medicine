/**
 * 粘贴文字录入（RX-7）：把诊所发的微信消息（CLN-5 的格式）粘进来，药名、克数、脚注、剂数、日期、患者、煎服法都填进表单；
 * 认不出的行原样留在框里；不调用模型。消息和期望值都是这里手写的，不用 App 的代码生成。
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { RUN, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const u = { email: `paste+${RUN}@example.com`, password: "secret-paste-123" };
let page: Page;
const modelCalls: string[] = [];

// CLN-5 发给病人的消息（docs/design/0006 §3 的格式），中间夹两行认不出的
const MESSAGE = `【李医生诊所】处方
日期：2026-10-30
患者：张三
共 7 剂
————————
1. 炙黄芪 18g
2. 薄荷 3g（后下；最后 5 分钟放）
3. 法半夏 9.5g
4. 白术 12g
上次的方子去掉茯苓
5. 三七 3g（冲服）
6. 当归 一点点
————————
煎服法：水煎服，日一剂，早晚分服
医嘱：忌生冷`;

const EXPECTED_ITEMS = [
  { name: "炙黄芪", grams: "18", prep: "" },
  { name: "薄荷", grams: "3", prep: "后下" },
  { name: "法半夏", grams: "9.5", prep: "" },
  { name: "白术", grams: "12", prep: "" },
  { name: "三七", grams: "3", prep: "冲服" },
];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("request", (r) => {
    if (r.url().includes("/api/parse-prescription")) modelCalls.push(r.url());
  });
  await signUp(page, u);
});
test.afterAll(async () => page.close());

test("粘贴诊所的微信消息：药名、克数、脚注、剂数、日期、患者、煎服法都填进表单", { tag: ["@RX-7"] }, async () => {
  await page.goto("/prescriptions/new");
  await expect(page.getByRole("button", { name: /拍照/ })).toBeEnabled(); // 等页面水合完成
  await page.getByRole("button", { name: "📋 粘贴文字" }).click();
  await page.getByLabel("药方文字").fill(MESSAGE);
  await page.getByTestId("paste-box").screenshot({ path: `${SHOTS}/粘贴文字-识别前.png` });
  await page.getByRole("button", { name: "识别文字" }).click();

  const names = page.getByLabel("药名", { exact: true });
  await expect(names).toHaveCount(EXPECTED_ITEMS.length);
  for (const [i, it] of EXPECTED_ITEMS.entries()) {
    await expect(names.nth(i)).toHaveValue(it.name);
    await expect(page.getByLabel("每副克数").nth(i)).toHaveValue(it.grams);
    await expect(page.getByLabel("脚注").nth(i)).toHaveValue(it.prep);
  }
  await expect(page.locator('input[name="issued_on"]')).toHaveValue("2026-10-30");
  await expect(page.locator('input[name="dose_count"]')).toHaveValue("7");
  await expect(page.locator('input[name="patient_label"]')).toHaveValue("张三");
  await expect(page.locator('input[name="instructions"]')).toHaveValue("水煎服，日一剂，早晚分服");
  // 每味药的备注和医嘱放进备注栏，不丢
  await expect(page.getByLabel("备注", { exact: true })).toHaveValue("薄荷：最后 5 分钟放\n医嘱：忌生冷");
  await expect(page.getByText("5 味 · 每副 45.5 g")).toBeVisible();
});

test("认不出的行原样留在框里", { tag: ["@RX-7"] }, async () => {
  await expect(page.getByLabel("药方文字")).toHaveValue("上次的方子去掉茯苓\n6. 当归 一点点");
  await expect(page.getByTestId("paste-msg")).toContainText("认出 5 味药");
  await expect(page.getByTestId("paste-msg")).toContainText("还有 2 行没认出来");
  await page.getByTestId("paste-box").screenshot({ path: `${SHOTS}/粘贴文字-识别后.png` });

  // 用户把认不出的行改好，再识别一次：只改那一行 → 只有它被填进来（替换药材列表）
  await page.getByLabel("药方文字").fill("当归 6g");
  await page.getByRole("button", { name: "识别文字" }).click();
  await expect(page.getByLabel("药名", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("药名", { exact: true })).toHaveValue("当归");
  await expect(page.getByLabel("药方文字")).toHaveValue("");
});

test("保存后的药方和粘贴的一致；整个过程没有调用模型", { tag: ["@RX-7"] }, async () => {
  await page.reload();
  await expect(page.getByRole("button", { name: /拍照/ })).toBeEnabled();
  await page.getByRole("button", { name: "📋 粘贴文字" }).click();
  await page.getByLabel("药方文字").fill(MESSAGE);
  await page.getByRole("button", { name: "识别文字" }).click();
  await page.getByPlaceholder("如：十月调理方").fill(`RX7-${RUN}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${SHOTS}/粘贴文字-手机.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "保存药方" }).click();

  await expect(page.getByRole("heading", { name: `RX7-${RUN}` })).toBeVisible();
  await expect(page.getByText(/^2026-10-30 · .* · 7 副 · 5 味 · 每副 45\.5 g · 张三/)).toBeVisible();
  const rows = page.locator("table.data-table").first().locator("tbody tr");
  await expect(rows).toHaveCount(5);
  for (const [i, it] of EXPECTED_ITEMS.entries()) await expect(rows.nth(i)).toContainText(it.name);
  expect(modelCalls).toEqual([]);
});
