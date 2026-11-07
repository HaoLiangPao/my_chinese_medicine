/**
 * 手机尺寸（Pixel 7）：用 scenario 跑完后的数据，检查每个页面没有横向滚动、关键操作能点到。
 * 截图存到 .local/screenshots/，方便人工看排版。
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { signIn, sql, users } from "./helpers";

const SHOTS = path.resolve(__dirname, "../../.local/screenshots");

test("手机上每个页面都不横向溢出", { tag: ["@PLAT-2"] }, async ({ page }) => {
  await signIn(page, users.hao);
  const [rx] = await sql<{ id: string }>(
    `select p.id from prescriptions p join workspace_members m on m.workspace_id = p.workspace_id
     join auth.users u on u.id = m.user_id where u.email = $1 and p.title = '小柴胡汤'`,
    [users.hao.email],
  );
  const [herb] = await sql<{ id: string }>("select id from herbs where name_zh = '黄芪'");

  const pages: [string, string][] = [
    ["总览", "/"],
    ["药方列表", "/prescriptions"],
    ["药方详情", `/prescriptions/${rx.id}`],
    ["新药方", "/prescriptions/new"],
    ["药柜", "/inventory"],
    ["采购", "/purchases"],
    ["新采购", "/purchases/new"],
    ["药材", "/herbs"],
    ["药材详情", `/herbs/${herb.id}`],
    ["比价", "/prices"],
  ];
  for (const [name, url] of pages) {
    await test.step(name, async () => {
      const res = await page.goto(url);
      expect(res?.status(), url).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name} 横向溢出 ${overflow}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    });
  }
});

test("手机上展开药柜卡片：输入框够宽，提示文字不被截断", { tag: ["@PLAT-2", "@FIX-7"] }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, users.hao);
  await page.goto("/inventory");
  const card = page.getByTestId("stock-card-黄芪");
  await card.locator("summary").click();
  const inputs = card.locator('input:not([type="hidden"])');
  await expect(inputs.first()).toBeVisible();
  const sizes = await inputs.evaluateAll((els) =>
    (els as HTMLInputElement[]).map((el) => {
      const cs = getComputedStyle(el);
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { name: el.name, width: el.getBoundingClientRect().width, placeholder: el.placeholder, need: ctx.measureText(el.placeholder).width, room };
    }),
  );
  expect(sizes.length).toBeGreaterThanOrEqual(3);
  for (const s of sizes) {
    expect(s.width, `${s.name} 宽度`).toBeGreaterThanOrEqual(s.name === "jar_label" ? 56 : 120);
    expect(s.need, `${s.name} 的提示「${s.placeholder}」显示不全`).toBeLessThanOrEqual(s.room);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await card.screenshot({ path: `${SHOTS}/药柜-展开卡片.png` });
});

test("手机上能完成一次煎药", { tag: ["@PLAT-2", "@DEC-1"] }, async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page, users.hao);
  await page.locator(`nav a[href="/prescriptions"]`).click();
  await page.getByText("酸枣仁汤", { exact: true }).click();
  await expect(page.getByTestId("decoction-history")).toBeVisible(); // 等页面加载完再数
  const entries = page.getByTestId("decoction-entry");
  const before = await entries.count();
  await page.locator("#doses").fill("1");
  await page.getByRole("button", { name: "煎 1 副，扣库存" }).tap();
  await expect(entries).toHaveCount(before + 1);
  await entries.first().getByRole("button", { name: "撤销" }).tap();
  await expect(entries).toHaveCount(before);
});
