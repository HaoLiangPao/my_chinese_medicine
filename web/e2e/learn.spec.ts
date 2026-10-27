/** 学堂（MVP4 原型）：不登录也能看；五行图的生克关系和对应表；阴阳图的时间滑块 */
import { expect, test } from "@playwright/test";

test("学习路径对所有人公开", async ({ page }) => {
  await page.goto("/learn");
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole("heading", { name: "药柜学堂" })).toBeVisible();
  await expect(page.getByTestId("learn-path").locator("> li")).toHaveCount(4);
  await page.getByRole("link", { name: "五行与五脏 →" }).click();
  await expect(page).toHaveURL(/\/learn\/wuxing$/);
  // 其他页面仍然要登录
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/login$/);
});

test("五行：相生/相克箭头、点选后显示关系和对应", async ({ page }) => {
  await page.goto("/learn/wuxing");
  // 默认只显示相生：5 条
  await expect(page.locator('[data-testid^="sheng-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="ke-"]')).toHaveCount(0);
  for (const pair of ["木火", "火土", "土金", "金水", "水木"]) await expect(page.getByTestId(`sheng-${pair}`)).toBeAttached();

  await page.getByRole("tab", { name: "相克" }).click();
  await expect(page.locator('[data-testid^="sheng-"]')).toHaveCount(0);
  for (const pair of ["木土", "土水", "水火", "火金", "金木"]) await expect(page.getByTestId(`ke-${pair}`)).toBeAttached();
  await page.getByRole("tab", { name: "生克都看" }).click();
  await expect(page.locator('[data-testid^="sheng-"], [data-testid^="ke-"]')).toHaveCount(10);

  // 点「木」：火=我生、水=生我、土=我克、金=克我
  await page.getByTestId("node-木").click();
  await expect(page.getByTestId("rel-火")).toHaveText("我生");
  await expect(page.getByTestId("rel-水")).toHaveText("生我");
  await expect(page.getByTestId("rel-土")).toHaveText("我克");
  await expect(page.getByTestId("rel-金")).toHaveText("克我");
  await expect(page.getByTestId("rel-木")).toHaveCount(0);
  const panel = page.getByTestId("wuxing-panel");
  await expect(panel.getByTestId("corr-五脏")).toHaveText("肝");
  await expect(panel.getByTestId("corr-六腑")).toHaveText("胆");
  await expect(panel.getByTestId("corr-开窍")).toHaveText("目");
  await expect(panel).toContainText("木生火（肝→心），木克土（肝→脾）");

  // 再点一次取消
  await page.getByTestId("node-木").click();
  await expect(page.locator('[data-testid^="rel-"]')).toHaveCount(0);
});

test("五行 ↔ 人体脏腑图联动", async ({ page }) => {
  await page.goto("/learn/wuxing");
  const organs = ["肝", "胆", "心", "小肠", "脾", "胃", "肺", "大肠", "肾", "膀胱"];
  for (const o of organs) await expect(page.getByTestId(`organ-${o}`)).toHaveAttribute("data-lit", "false");

  const expectLit = async (lit: string[]) => {
    for (const o of organs) await expect(page.getByTestId(`organ-${o}`), o).toHaveAttribute("data-lit", lit.includes(o) ? "true" : "false");
  };
  // 点五行 → 对应脏腑高亮
  await page.getByTestId("node-木").click();
  await expectLit(["肝", "胆"]);
  await page.getByTestId("node-金").click();
  await expectLit(["肺", "大肠"]);
  // 点脏腑 → 选中对应的五行，面板和关系标签跟着变
  await page.getByTestId("organ-肾").locator("path").first().click(); // 点左边那个肾
  await expectLit(["肾", "膀胱"]);
  await expect(page.getByTestId("wuxing-panel").getByTestId("corr-五脏")).toHaveText("肾");
  await expect(page.getByTestId("rel-木")).toHaveText("我生"); // 水生木
  await page.getByTestId("organ-小肠").click();
  await expectLit(["心", "小肠"]);
  await expect(page.getByTestId("node-火")).toHaveAttribute("aria-pressed", "true");
  // 再点同一行的脏腑 → 取消
  await page.getByTestId("organ-心").click();
  await expectLit([]);
});

test("阴阳：拖动时间，阴阳比例和时辰跟着变", async ({ page }) => {
  await page.goto("/learn/yinyang");
  const slider = page.getByLabel("一天中的时间");
  await slider.fill("0");
  await expect(page.getByTestId("yy-time")).toContainText("子时");
  await expect(page.getByTestId("yy-share")).toHaveText("阳 0% · 阴 100%");
  await slider.fill("12");
  await expect(page.getByTestId("yy-time")).toContainText("午时");
  await expect(page.getByTestId("yy-time")).toContainText("阴长阳消");
  await expect(page.getByTestId("yy-share")).toHaveText("阳 100% · 阴 0%");
  await slider.fill("6");
  await expect(page.getByTestId("yy-share")).toHaveText("阳 50% · 阴 50%");
  await expect(page.getByTestId("yy-time")).toContainText("阳长阴消");

  // 播放：时间会自己走
  const before = await page.getByTestId("yy-time").textContent();
  await page.getByRole("button", { name: "▶ 播放一天" }).click();
  await expect(page.getByTestId("yy-time")).not.toHaveText(before!);
  await page.getByRole("button", { name: "暂停" }).click();
});

test("手机上学堂页面不横向溢出", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const url of ["/learn", "/learn/wuxing", "/learn/yinyang"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await page.close();
});
