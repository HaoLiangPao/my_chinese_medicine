/**
 * 批次和批次标签（docs/design/0010 §3.3、§4.3）。
 * 期望值在这里独立算：批号 = 拼音首字母 + 年月 + 序号；单价 = 总价 ÷ 克数 × 100；建议用完 = 分装（或购入）+ 12 个月；
 * 在用 / 已用完：从最新一批往回加克数，加到够库存为止。
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { RUN, signUp, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const u = { email: `batches+${RUN}@example.com`, password: "secret-batch-123" };
let page: Page;
let herbUrl: string;

type Line = { herb: string; grams: number; price: number; origin?: string; supplierLot?: string; packedOn?: string };
async function buy(store: string, date: string, lines: Line[]) {
  await page.goto("/purchases/new");
  await page.locator('input[name="store_name"]').fill(store);
  await page.locator('input[name="purchased_on"]').fill(date);
  for (const [i, l] of lines.entries()) {
    if (i >= 2) await page.getByRole("button", { name: "＋ 加一行" }).click();
    const row = page.getByTestId("purchase-line").nth(i);
    await row.getByLabel("药名").fill(l.herb);
    await row.getByLabel("克数").fill(String(l.grams));
    await row.getByLabel("总价").fill(String(l.price));
    if (l.origin || l.supplierLot || l.packedOn) {
      await row.getByText("批次信息").click();
      if (l.origin) await row.getByLabel("产地").fill(l.origin);
      if (l.supplierLot) await row.getByLabel("供应商批号").fill(l.supplierLot);
      if (l.packedOn) await row.getByLabel("分装日期").fill(l.packedOn);
    }
  }
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signUp(page, u);
  const [{ id }] = await sql<{ id: string }>("select id from herbs where name_zh = '麦冬'");
  herbUrl = `/herbs/${id}`;
});
test.afterAll(async () => page.close());

test("进货时填批次信息；批号自动生成", { tag: ["@LBL-2", "@BUY-1"] }, async () => {
  await buy("永生药行", "2026-10-20", [{ herb: "麦冬", grams: 300, price: 26.7, origin: "中国 · 四川" }]);
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/purchases(\?.*)?$/);

  await buy("孔大吉", "2026-11-05", [{ herb: "麦冬", grams: 227, price: 23.99, origin: "中国 · 浙江", supplierLot: "ZJ20261001", packedOn: "2026-11-06" }]);
  await page.screenshot({ path: `${SHOTS}/进货-批次信息.png`, fullPage: true });
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/purchases(\?.*)?$/);

  const rows = await sql<{ lot_no: string; origin: string; supplier_lot: string | null; packed_on: string | null }>(
    `select pi.lot_no, pi.origin, pi.supplier_lot, to_char(pi.packed_on, 'YYYY-MM-DD') packed_on
     from purchase_items pi join purchases pu on pu.id = pi.purchase_id join workspace_members m on m.workspace_id = pu.workspace_id
     join auth.users au on au.id = m.user_id where au.email = $1 order by pu.purchased_on`,
    [u.email],
  );
  expect(rows).toEqual([
    { lot_no: "MD-2610-01", origin: "中国 · 四川", supplier_lot: null, packed_on: null },
    { lot_no: "MD-2611-01", origin: "中国 · 浙江", supplier_lot: "ZJ20261001", packed_on: "2026-11-06" },
  ]);
});

test("同一张单子同一味药写两行、批次信息不一样 → 不能保存", { tag: ["@LBL-2"] }, async () => {
  await buy("孔大吉", "2026-11-07", [
    { herb: "麦冬", grams: 100, price: 10, origin: "中国 · 浙江" },
    { herb: "麦冬", grams: 100, price: 10, origin: "中国 · 四川" },
  ]);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("「麦冬」写了两行，批次信息不一样")).toBeVisible();
  // 把第二行的产地删空：批次信息不会在光标下收起
  const row2 = page.getByTestId("purchase-line").nth(1);
  await row2.getByLabel("产地").fill("");
  await expect(row2.getByLabel("产地")).toBeVisible();
});

test("详情页：库存 527 g → 两批都在用；校准到 200 g → 只有最新一批在用", { tag: ["@LBL-2"] }, async () => {
  // 300 + 227 = 527；最新一批 227 < 527 → 两批都在用
  await page.goto(herbUrl);
  const inUse = page.getByTestId("batch-in-use");
  await expect(inUse).toHaveCount(2);
  await expect(inUse.getByTestId("batch-lot")).toHaveText(["MD-2611-01", "MD-2610-01"]);
  const nov = inUse.first();
  await expect(nov.getByTestId("batch-产地")).toHaveText("中国 · 浙江");
  await expect(nov.getByTestId("batch-购自")).toHaveText("孔大吉");
  await expect(nov.getByTestId("batch-净重")).toHaveText("227 g");
  await expect(nov.getByTestId("batch-单价")).toHaveText(`$${((23.99 / 227) * 100).toFixed(2)} / 100 g`); // $10.57
  await expect(nov.getByTestId("batch-建议用完")).toHaveText("2027-11"); // 分装 2026-11 + 12 个月
  await expect(nov.getByTestId("batch-供应商批号")).toHaveText("ZJ20261001");
  await expect(inUse.nth(1).getByTestId("batch-建议用完")).toHaveText("2027-10"); // 没有分装日期，从购入 2026-10 算

  // 称重 200 g：最新一批 227 ≥ 200 → 只有它在用，10 月那批已用完
  await page.goto("/inventory");
  const card = page.getByTestId("stock-card-麦冬");
  await card.locator("summary").click();
  await card.getByLabel("麦冬 称重克数").fill("200");
  await card.getByRole("button", { name: "校准" }).click();
  await expect(page.getByTestId("stock-麦冬")).toHaveText("200 g");
  await page.goto(herbUrl);
  await expect(page.getByTestId("batch-in-use")).toHaveCount(1);
  await expect(page.getByTestId("batch-in-use").getByTestId("batch-lot")).toHaveText("MD-2611-01");
  await expect(page.getByTestId("batch-used-up")).toContainText("MD-2610-01 · 已用完");
  await page.getByTestId("batches").screenshot({ path: `${SHOTS}/药材详情-批次.png` });
});

test("批次标签：4×2 英寸；默认不印店名，勾选后印；打印时只有标签", { tag: ["@LBL-3"] }, async () => {
  await page.goto(herbUrl);
  await page.getByTestId("batch-in-use").getByRole("link", { name: "打印批次标签" }).click();
  await page.waitForURL(/\/print\/batch\//);
  const label = page.getByTestId("batch-label");
  await expect(label.getByTestId("label-herb")).toHaveText("麦冬");
  await expect(label.getByTestId("label-lot")).toHaveText("批号 MD-2611-01");
  await expect(label.getByTestId("label-产地")).toHaveText("中国 · 浙江");
  await expect(label.getByTestId("label-净重")).toHaveText("227 g");
  await expect(label.getByTestId("label-供应商批号")).toHaveText("ZJ20261001");
  await expect(label.getByTestId("label-购入日期")).toHaveText("2026-11-05");
  await expect(label.getByTestId("label-分装日期")).toHaveText("2026-11-06");
  await expect(label.getByTestId("label-建议用完")).toHaveText("2027-11");
  await expect(label).not.toContainText("孔大吉"); // 默认不印店名
  // 4 × 2 英寸 = 384 × 192 CSS 像素
  const box = await label.boundingBox();
  expect([Math.round(box!.width), Math.round(box!.height)]).toEqual([384, 192]);
  const pageSize = await page.evaluate(() =>
    [...document.styleSheets].flatMap((s) => [...s.cssRules]).find((r) => r instanceof CSSPageRule)?.style.getPropertyValue("size"),
  );
  expect(pageSize).toBe("4in 2in");
  await label.screenshot({ path: `${SHOTS}/批次标签.png` });

  await page.getByLabel("印上「购自」（店名）").check();
  await page.waitForURL(/store=1/);
  await expect(label.getByTestId("label-购自")).toHaveText("孔大吉");
  await expect(label.getByTestId("label-供应商批号")).toHaveCount(0);
  await label.screenshot({ path: `${SHOTS}/批次标签-印店名.png` });

  // 打印时：导航、按钮都隐藏，只有标签
  await page.emulateMedia({ media: "print" });
  const visibility = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).visibility);
  expect(await visibility("header")).toBe("hidden");
  expect(await visibility('button:has-text("打印")')).toBe("hidden");
  expect(await visibility('[data-testid="batch-label"]')).toBe("visible");
  await page.emulateMedia({ media: "screen" });
});

test("别的药柜打不开这张标签", { tag: ["@LBL-3"] }, async ({ browser }) => {
  const url = page.url().split("?")[0];
  const other = await browser.newPage();
  await signUp(other, { email: `batches-other+${RUN}@example.com`, password: "secret-batch-123" });
  await other.goto(url);
  await expect(other.getByText("找不到这个页面")).toBeVisible();
  await expect(other.getByTestId("batch-label")).toHaveCount(0);
  await other.close();
});

test("手机上：进货表单的批次信息、批次资料、标签页不横向溢出", { tag: ["@LBL-2", "@LBL-3", "@PLAT-2"] }, async ({ browser }) => {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await m.goto("/login");
  await m.getByLabel("邮箱").fill(u.email);
  await m.getByLabel("密码").fill(u.password);
  await m.getByRole("button", { name: "登录" }).click();
  await m.waitForURL((x) => !x.pathname.startsWith("/login"));
  const labelUrl = page.url().split("?")[0];
  for (const url of ["/purchases/new", herbUrl, labelUrl]) {
    await m.goto(url);
    if (url === "/purchases/new") await m.getByTestId("purchase-line").first().getByText("批次信息").click();
    await m.waitForLoadState("networkidle");
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await m.screenshot({ path: `${SHOTS}/批次标签-手机.png` });
  await m.close();
});
