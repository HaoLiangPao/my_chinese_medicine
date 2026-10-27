/**
 * 独立的功能/边界测试（每个 test 自己注册新用户，互不影响）：
 * 登录与权限、拍照识别（假的 Anthropic 服务）、表单校验、罐子设置与补货提醒、家人邀请报错。
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { signIn, signUp, sql, workspaceOf } from "./helpers";

const MOCK = "http://127.0.0.1:54400";
let n = 0;
const fresh = () => ({ email: `iso${Date.now()}-${n++}@example.com`, password: "secret-iso-123" });

/** 用浏览器画一张「药方」图片（只要是一张真实的 PNG 即可，内容由假模型决定） */
async function prescriptionImage(page: Page): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 600, height: 800 });
  await p.setContent(
    `<body style="font:28px serif;padding:40px;background:#fff">李医生 处方<br><br>北芪 15g　党参 12g<br>麦门冬 9g　砂仁 3g（后下）<br>鸡血藤 15g<br><br>× 5 剂</body>`,
  );
  const buf = await p.screenshot();
  await p.close();
  return buf;
}

test.describe("登录与权限", () => {
  test("未登录访问内部页面 → 跳到登录页；未登录调用识别接口 → 401", async ({ page, request }) => {
    for (const path of ["/", "/inventory", "/prescriptions/new", "/herbs"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    const res = await request.post("/api/parse-prescription", {
      multipart: { photo: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "未登录" });
  });

  test("密码错误；退出登录后不能再访问", async ({ page }) => {
    const u = fresh();
    await signUp(page, u);
    await page.getByRole("button", { name: /退出/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("邮箱").fill(u.email);
    await page.getByLabel("密码").fill("wrong-password");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByText("邮箱或密码不对")).toBeVisible();
    await signIn(page, u);
  });

  test("用已注册的邮箱再注册，不会进入别人的账号", async ({ page }) => {
    const u = fresh();
    await signUp(page, u);
    await page.getByRole("button", { name: /退出/ }).click();
    await page.getByLabel("邮箱").fill(u.email);
    await page.getByLabel("密码").fill("another-password");
    await page.getByRole("button", { name: "注册" }).click();
    await page.waitForTimeout(1000);
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("邀请家人：没注册的邮箱给出提示，不会崩溃", async ({ page }) => {
    await signUp(page, fresh());
    await page.getByPlaceholder("家人的注册邮箱").fill("nobody-here@example.com");
    await page.getByRole("button", { name: "添加" }).click();
    await expect(page.getByText("这个邮箱还没注册")).toBeVisible();
  });
});

test.describe("拍照识别", () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${MOCK}/__reset`);
  });

  test("识别 → 预填表单 → 别名匹配、新药材标红 → 保存 → 详情页显示原图", async ({ page, request }) => {
    const u = fresh();
    await signUp(page, u);
    await page.goto("/prescriptions/new");
    const before = (await (await request.get(`${MOCK}/__requests`)).json()).length;

    await page.locator('input[type="file"]').setInputFiles({ name: "rx.png", mimeType: "image/png", buffer: await prescriptionImage(page) });
    await expect(page.getByText(/识别出 5 味药，其中 1 味不在药材目录里/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("AI 备注：第 5 味字迹潦草，请核对")).toBeVisible();

    // 模型收到了图片，并且要求了结构化输出
    const reqs = await (await request.get(`${MOCK}/__requests`)).json();
    expect(reqs.slice(before)).toEqual([{ model: "claude-sonnet-5-5", hasImage: true, hasFormat: true }]);

    const names = page.getByLabel("药名", { exact: true });
    await expect(names).toHaveCount(5);
    await expect(names.nth(0)).toHaveValue("黄芪"); // 北芪 → 黄芪
    await expect(names.nth(2)).toHaveValue("麦冬"); // 麦门冬 → 麦冬
    await expect(names.nth(4)).toHaveValue("鸡血藤");
    await expect(names.nth(4)).toHaveClass(/border-cinnabar/); // 不在目录里
    await expect(names.nth(0)).not.toHaveClass(/border-cinnabar/);
    await expect(page.getByLabel("脚注").nth(3)).toHaveValue("后下");
    await expect(page.locator('input[name="dose_count"]')).toHaveValue("5");
    await expect(page.locator('input[name="issued_on"]')).toHaveValue("2026-10-20");
    await expect(page.locator('input[name="patient_label"]')).toHaveValue("Hao");
    await expect(page.getByText("5 味 · 每副 54 g")).toBeVisible();

    // 人工核对：把识别错的克数改一下
    await page.getByLabel("每副克数").nth(4).fill("12");
    await page.getByRole("button", { name: "保存药方" }).click();
    await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}$/);

    const img = page.getByRole("img", { name: "药方照片" });
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(100);
    await expect(page.getByText("（原文 北芪）")).toBeVisible();

    const id = page.url().split("/").pop();
    const [rx] = await sql<{ source: string; photo_path: string }>("select source, photo_path from prescriptions where id = $1", [id]);
    expect(rx.source).toBe("photo");
    expect(rx.photo_path.startsWith(`${await workspaceOf(u.email)}/`)).toBe(true);
    const items = await sql<{ name_zh: string; raw_name: string; g: string }>(
      `select h.name_zh, i.raw_name, i.grams_per_dose::text g from prescription_items i join herbs h on h.id = i.herb_id
       where prescription_id = $1 order by sort_order`,
      [id],
    );
    expect(items.map((i) => [i.name_zh, i.raw_name, Number(i.g)])).toEqual([
      ["黄芪", "北芪", 15],
      ["党参", "党参", 12],
      ["麦冬", "麦门冬", 9],
      ["砂仁", "砂仁", 3],
      ["鸡血藤", "鸡血藤", 12],
    ]);

    // 删除药方时照片一起删
    const file = path.resolve(__dirname, "../../.local/storage/prescription-photos", rx.photo_path);
    expect(fs.existsSync(file)).toBe(true);
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "删除这张药方" }).click();
    await page.waitForURL(/\/prescriptions(\?.*)?$/);
    expect(fs.existsSync(file)).toBe(false);
  });

  test("模型服务出错 → 提示失败，照片仍保留，可以手动录入", async ({ page, request }) => {
    await signUp(page, fresh());
    await page.goto("/prescriptions/new");
    await request.post(`${MOCK}/__next`, { data: { fail: true } });
    await page.locator('input[type="file"]').setInputFiles({ name: "rx.png", mimeType: "image/png", buffer: await prescriptionImage(page) });
    await expect(page.getByText(/识别失败：.*可以手动填写/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /拍照/ })).toBeEnabled();

    await page.getByLabel("药名", { exact: true }).first().fill("黄芪");
    await page.getByLabel("每副克数").first().fill("10");
    await page.getByRole("button", { name: "保存药方" }).click();
    await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("img", { name: "药方照片" })).toBeVisible();
  });

  test("服务器拒绝超过 5MB 的照片、拒绝没有照片的请求", async ({ page }) => {
    await signUp(page, fresh());
    const result = await page.evaluate(async () => {
      const big = new FormData();
      big.append("photo", new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/jpeg" }), "big.jpg");
      const r1 = await fetch("/api/parse-prescription", { method: "POST", body: big });
      const r2 = await fetch("/api/parse-prescription", { method: "POST", body: new FormData() });
      return [r1.status, (await r1.json()).error, r2.status, (await r2.json()).error];
    });
    expect(result).toEqual([413, "照片太大（>5MB）", 400, "没有收到照片"]);
  });
});

test.describe("表单校验", () => {
  test("药方：空行忽略、没有药不能保存、同名两行合并、首尾空格去掉", async ({ page }) => {
    await signUp(page, fresh());
    await page.goto("/prescriptions/new");
    const save = page.getByRole("button", { name: "保存药方" });
    await expect(save).toBeDisabled();
    const names = page.getByLabel("药名", { exact: true });
    const gramsIn = page.getByLabel("每副克数");
    await names.nth(0).fill("黄芪");
    await expect(save).toBeDisabled(); // 没有克数
    await gramsIn.nth(0).fill("10");
    await expect(save).toBeEnabled();
    await names.nth(1).fill("  黄芪 ");
    await gramsIn.nth(1).fill("5");
    await names.nth(2).fill("甘草"); // 没填克数 → 忽略
    await expect(page.getByText("2 味 · 每副 15 g")).toBeVisible();
    // 删除一行
    await page.getByRole("button", { name: "删除" }).nth(2).click();
    await expect(names).toHaveCount(2);
    await save.click();
    await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("cell", { name: "15 g" }).first()).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(2); // 表头 + 1 味（合并后）
  });

  test("采购：没有完整的行不能保存；价格 0 可以；新店铺自动建", async ({ page }) => {
    const u = fresh();
    await signUp(page, u);
    await page.goto("/purchases/new");
    const save = page.getByRole("button", { name: "保存" });
    await expect(save).toBeDisabled();
    await page.getByLabel("药名", { exact: true }).first().fill("大枣");
    await page.getByLabel("克数", { exact: true }).first().fill("100");
    await expect(save).toBeDisabled(); // 价格没填
    await page.getByLabel("总价", { exact: true }).first().fill("0");
    await expect(save).toBeEnabled();
    await page.locator('input[name="store_name"]').fill("街口小店");
    await save.click();
    await page.waitForURL(/\/purchases(\?.*)?$/);
    await expect(page.getByText("街口小店")).toBeVisible();
    expect(await sql("select 1 from stores where workspace_id = $1 and name = '街口小店'", [await workspaceOf(u.email)])).toHaveLength(1);
  });
});

test("罐子设置与补货提醒", async ({ page }) => {
  await signUp(page, fresh());
  await page.goto("/inventory");
  await page.locator('input[name="herb_name"]').fill("麦冬");
  await page.locator('input[name="actual"]').last().fill("80");
  await page.getByRole("button", { name: "录入" }).click();
  const card = page.getByTestId("stock-card-麦冬");
  await expect(card.getByTestId("stock-麦冬")).toHaveText("80 g");
  await expect(card.getByTestId("stock-麦冬")).toHaveClass(/text-jade/);

  await card.locator("summary").click();
  await card.locator('input[name="jar_label"]').fill("A3");
  await card.locator('input[name="low_stock_grams"]').fill("100");
  await card.getByRole("button", { name: "存" }).click();
  await expect(card.getByText("罐 A3")).toBeVisible();
  await expect(card.getByTestId("stock-麦冬")).toHaveClass(/text-amber/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "麦冬 80 g" })).toBeVisible(); // 该补货了
  await expect(page.getByText("快用完").locator("..")).toContainText("1");

  // 校准到 0 → 不写 0 流水（数据库不允许），库存显示 0
  await page.goto("/inventory");
  await card.locator("summary").click();
  await card.getByLabel("麦冬 称重克数").fill("0");
  await card.getByRole("button", { name: "校准" }).click();
  await expect(card.getByTestId("stock-麦冬")).toHaveText("0 g");
  await expect(card.getByTestId("stock-麦冬")).toHaveClass(/text-cinnabar/);
});
