/**
 * 药材目录扩到 430 味原药材 + 77 个炮制品（CAT-1，docs/design/0017）：选药、搜索、别名、药材页在 400 多味下还好用。
 * 期望值按 seed.sql 的名单手写（分类的味数 = 原药材 + 挂在下面的炮制品），不读 App 的结果。
 * 目录是全站共用的：同一次运行里别的测试会新增没有分类的药（茯神、鸡矢藤……），所以只比有分类的。
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { RUN, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const SUFFIX = process.env.SHOT_SUFFIX ?? "";
const family = { email: `catalog+${RUN}@example.com`, password: "secret-cat-123" };
const doctor = { email: `catalog-doc+${RUN}@example.com`, password: "secret-cat-123" };
const PHONE = { width: 390, height: 844 };

async function noOverflow(p: Page) {
  expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

test("家庭录方（手机 390px）：A–Z 从 A 开始；别名、炮制品的别名、拼音首字母都能搜到", { tag: ["@CAT-1", "@RX-5"] }, async ({ browser }) => {
  const p = await browser.newPage({ viewport: PHONE, hasTouch: true });
  await signUp(p, family);
  await p.goto("/prescriptions/new");
  await expect(p.getByRole("button", { name: /拍照/ })).toBeEnabled();
  await p.getByTestId("az-open").click();
  await expect(p.getByTestId("az-picker")).toBeVisible();

  // 艾叶、矮地茶在 A；炮制品单独一条（胆南星在 D，不和天南星合在一起）
  await expect(p.getByTestId("az-letter-bar").getByRole("button").first()).toHaveAccessibleName("跳到 A");
  await expect(p.getByTestId("az-group-A").getByTestId("az-herb-艾叶")).toHaveCount(1);
  await expect(p.getByTestId("az-group-D").getByTestId("az-herb-胆南星")).toHaveCount(1);
  await expect(p.getByTestId("az-group-T").getByTestId("az-herb-天南星")).toHaveCount(1);
  // 多音字按药材的读法：槟榔 bing lang 在 B，莪术 e zhu 在 E
  await expect(p.getByTestId("az-group-B").getByTestId("az-herb-槟榔")).toHaveCount(1);
  await expect(p.getByTestId("az-group-E").getByTestId("az-herb-莪术")).toHaveCount(1);
  await noOverflow(p);
  await p.getByRole("button", { name: "跳到 C" }).tap(); // C 组最长（53 味）
  await p.screenshot({ path: `${SHOTS}/目录扩充-A-Z选药-手机${SUFFIX}.png` });

  const search = p.getByLabel("搜药材");
  const results = p.getByTestId("az-results");
  await search.fill("云苓");
  await expect(results.locator("button").first()).toContainText("云苓 → 茯苓");
  await search.fill("炙麻黄");
  await expect(results.locator("button").first()).toContainText("炙麻黄 → 蜜麻黄");
  await search.fill("yhs");
  await expect(results.locator("button").first()).toContainText("延胡索");
  await search.fill("龟板");
  await expect(results.locator("button").first()).toContainText("龟板 → 龟甲");
  await p.screenshot({ path: `${SHOTS}/目录扩充-A-Z搜别名-手机${SUFFIX}.png` });
  await results.locator("button").first().tap();
  await expect(p.getByTestId("az-picker")).toBeHidden();
  await expect(p.getByLabel("药名", { exact: true }).first()).toHaveValue("龟甲");
  await p.close();
});

test(
  "诊所开方：别名搜到原药材（显示「元胡 → 延胡索」、不提示新增）；炮制品的别名直接选炮制品",
  { tag: ["@CAT-1", "@CLN-3"] },
  async ({ browser }) => {
    const p = await browser.newPage();
    await signUp(p, doctor, "目录测试诊所");
    await p.goto("/clinic/prescribe");
    const search = p.getByLabel("搜药材");
    const panel = p.getByTestId("letter-panel");

    await search.fill("元胡");
    await expect(panel.getByTestId("herb-延胡索")).toHaveText(/^元胡 → 延胡索/);
    await expect(p.getByRole("button", { name: /＋ 新增/ })).toHaveCount(0); // 以前会提示「＋ 新增『元胡』」
    await p.setViewportSize(PHONE);
    await panel.screenshot({ path: `${SHOTS}/目录扩充-开方搜别名-手机${SUFFIX}.png` });
    await p.setViewportSize({ width: 1280, height: 720 });
    await panel.getByTestId("herb-延胡索").click();
    await expect(p.getByTestId("variant-chooser")).toBeVisible(); // 延胡索有炮制品（醋延胡索），照常让医生选
    await p.getByTestId("variant-chooser").getByTestId("variant-醋延胡索").click();
    await expect(p.getByTestId("line-editor")).toContainText("醋延胡索");
    await p.getByTestId("line-editor").getByLabel("克数").fill("10");
    await p
      .getByTestId("line-editor")
      .getByRole("button", { name: /加入处方/ })
      .click();

    await search.fill("炙麻黄");
    await expect(panel.getByTestId("herb-麻黄")).toHaveText("炙麻黄 → 蜜麻黄");
    await panel.getByTestId("herb-麻黄").click();
    await expect(p.getByTestId("variant-chooser")).toHaveCount(0); // 不用再选一次
    await expect(p.getByTestId("line-editor")).toContainText("蜜麻黄");
    await p.getByTestId("line-editor").getByLabel("克数").fill("6");
    await p
      .getByTestId("line-editor")
      .getByRole("button", { name: /加入处方/ })
      .click();
    await expect(p.getByTestId("rx-lines").locator("tbody tr td:first-child")).toHaveText(["醋延胡索", "蜜麻黄"]);

    // 首字母 S 是最长的一组（44 味原药材）：炮制品不单独列出
    await p.getByTestId("letter-S").click();
    await expect(panel).toContainText("S 开头：44 味");
    await expect(panel.getByTestId("herb-酒萸肉")).toHaveCount(0);
    await p.screenshot({ path: `${SHOTS}/目录扩充-开方首字母S${SUFFIX}.png`, fullPage: true });

    // 手机上不溢出
    await p.setViewportSize(PHONE);
    await noOverflow(p);
    await panel.screenshot({ path: `${SHOTS}/目录扩充-开方首字母S-手机${SUFFIX}.png` });
    await p.close();
  },
);

test(
  "药材页：目录按功效分类分组（教材顺序）；新药的详情页正常显示，资料「还在整理中」",
  { tag: ["@CAT-1", "@STAT-1"] },
  async ({ browser }) => {
    const p = await browser.newPage({ viewport: PHONE, hasTouch: true });
    await p.goto("/login");
    await p.getByLabel("邮箱").fill(family.email);
    await p.getByLabel("密码").fill(family.password);
    await p.getByRole("button", { name: "登录" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"));
    await p.goto("/herbs");

    // 前几组和最后两组；味数 = 原药材 + 挂在下面的炮制品（解表药 29 + 3、清热药 64 + 7、驱虫药 6 + 1）
    const groups = p.locator('[data-testid^="catalog-"]');
    await expect(groups.nth(0)).toHaveAttribute("data-testid", "catalog-解表药");
    await expect(groups.nth(1)).toHaveAttribute("data-testid", "catalog-清热药");
    await expect(p.getByTestId("catalog-解表药").locator("summary")).toHaveText("解表药32 味");
    await expect(p.getByTestId("catalog-清热药").locator("summary")).toHaveText("清热药71 味");
    await expect(p.getByTestId("catalog-驱虫药").locator("summary")).toHaveText("驱虫药7 味");
    await expect(p.getByTestId("catalog-拔毒化腐生肌药").locator("summary")).toHaveText("拔毒化腐生肌药1 味");
    await expect(p.getByTestId("catalog-驱虫药").getByRole("link", { name: "槟榔" })).toBeHidden(); // 默认收起
    await noOverflow(p);
    await expect(p.getByTestId("catalog-补阴药")).toBeVisible();
    await p.screenshot({ path: `${SHOTS}/目录扩充-药材页-手机${SUFFIX}.png`, fullPage: true });

    await p.getByTestId("catalog-驱虫药").locator("summary").tap();
    await p.getByTestId("catalog-驱虫药").getByRole("link", { name: "槟榔", exact: true }).tap();
    await expect(p.getByRole("heading", { name: "槟榔" })).toBeVisible();
    await expect(p.getByText("bing lang · 驱虫药")).toBeVisible();
    await expect(p.getByTestId("monograph-missing")).toContainText("还在整理中");
    await noOverflow(p);
    await p.screenshot({ path: `${SHOTS}/目录扩充-新药详情-手机${SUFFIX}.png` });

    // 原来就有资料的药照常显示资料，没有「整理中」
    await p.goto("/herbs");
    await p.getByTestId("catalog-补阴药").locator("summary").tap();
    await p.getByTestId("catalog-补阴药").getByRole("link", { name: "麦冬", exact: true }).tap();
    await expect(p.getByRole("heading", { name: "麦冬" })).toBeVisible();
    await expect(p.getByTestId("monograph-draft")).toBeVisible();
    await expect(p.getByTestId("monograph-missing")).toHaveCount(0);
    await p.close();
  },
);
