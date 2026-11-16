/**
 * 家庭录方的 A–Z 选药（RX-5）。期望值按拼音手写：炙甘草 zhi → Z，法半夏 fa → F，甘草 gan → G。
 * 诊所开方的归类方式不变，由 clinic.spec（CLN-3）照常覆盖。
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { RUN, signUp, sql } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const u = { email: `azpick+${RUN}@example.com`, password: "secret-az-123" };
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signUp(page, u);
});
test.afterAll(async () => page.close());

async function openPicker(p: Page) {
  await p.goto("/prescriptions/new");
  await expect(p.getByRole("button", { name: /拍照/ })).toBeEnabled(); // 等页面水合完成
  await p.getByTestId("az-open").click();
  await expect(p.getByTestId("az-picker")).toBeVisible();
}

test("按药名本身的第一个字归类：炙甘草在 Z、法半夏在 F，不和甘草、半夏合在一起", { tag: ["@RX-5"] }, async () => {
  await openPicker(page);
  await expect(page.getByTestId("az-group-Z").getByTestId("az-herb-炙甘草")).toHaveCount(1);
  await expect(page.getByTestId("az-group-F").getByTestId("az-herb-法半夏")).toHaveCount(1);
  await expect(page.getByTestId("az-group-G").getByTestId("az-herb-甘草")).toHaveCount(1);
  await expect(page.getByTestId("az-group-B").getByTestId("az-herb-半夏")).toHaveCount(1);
  await expect(page.getByTestId("az-group-G").getByTestId("az-herb-炙甘草")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/A-Z选药.png` });
  await page.keyboard.press("Escape");
  await page.locator(".card", { has: page.getByRole("heading", { name: "药材" }) }).screenshot({ path: `${SHOTS}/录方药材-改之后.png` });
  await page.getByTestId("az-open").click();
});

test("字母条：点 H 跳到 H 组；按住从第一个字母滑到 Z 跳到 Z 组", { tag: ["@RX-5"] }, async () => {
  const list = page.getByTestId("az-list");
  const header = (l: string) => page.getByTestId(`az-group-${l}`).locator("h3");
  await expect(header("H")).not.toBeInViewport();
  await page.getByRole("button", { name: "跳到 H" }).click();
  await expect(header("H")).toBeInViewport();
  // H 组 2026-11-13 起有 36 味，黄芪不一定在第一屏：看 H 组的第一味
  await expect(page.getByTestId("az-group-H").locator('[data-testid^="az-herb-"]').first()).toBeInViewport();

  // 按住字母条从第一个字母滑到 Z（2026-11-13 目录扩充后有 A 开头的药：艾叶、矮地茶，第一个是 A）
  await expect(page.getByTestId("az-letter-bar").getByRole("button").first()).toHaveAccessibleName("跳到 A");
  const a = (await page.getByTestId("az-letter-bar").getByRole("button").first().boundingBox())!;
  const z = (await page.getByRole("button", { name: "跳到 Z" }).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(header("Z")).toBeInViewport();
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test("搜索：汉字、全拼、首字母、别名（北芪 → 黄芪）", { tag: ["@RX-5", "@RX-2"] }, async () => {
  const search = page.getByLabel("搜药材");
  const results = page.getByTestId("az-results");
  await search.fill("黄芪");
  await expect(results.locator("button").first()).toContainText("黄芪");
  await search.fill("huangqi");
  await expect(results.locator("button").first()).toContainText("黄芪");
  await search.fill("hq");
  await expect(results).toContainText("黄芪");
  await expect(results).toContainText("黄芩");
  await search.fill("北芪");
  await expect(results.locator("button").first()).toContainText("北芪 → 黄芪");
  await search.fill("不存在的药");
  await expect(results).toContainText("目录里没有「不存在的药」");
});

test("选一味：面板关上，药填进表单第一行空着的，焦点到这一行的克数；再选一味填进下一行", { tag: ["@RX-5"] }, async () => {
  await page.getByLabel("搜药材").fill("北芪");
  await page.getByTestId("az-herb-黄芪").click();
  await expect(page.getByTestId("az-picker")).toBeHidden();
  const names = page.getByLabel("药名", { exact: true });
  await expect(names.nth(0)).toHaveValue("黄芪");
  await expect(page.getByLabel("每副克数").nth(0)).toBeFocused(); // 接着填克数
  await page.keyboard.type("30");
  await expect(page.getByLabel("每副克数").nth(0)).toHaveValue("30");

  await page.getByTestId("az-open").click();
  await page.getByTestId("az-herb-炙甘草").click();
  await expect(names.nth(1)).toHaveValue("炙甘草");

  // Esc 关上，焦点回到打开按钮
  await page.getByTestId("az-open").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("az-picker")).toBeHidden();
  await expect(page.getByTestId("az-open")).toBeFocused();
  // 点面板外面（遮罩）关上
  await page.getByTestId("az-open").click();
  await expect(page.getByTestId("az-picker")).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.getByTestId("az-picker")).toBeHidden();
});

test("搜索框按 Enter 选第一条结果，不会把药方提交保存", { tag: ["@RX-5"] }, async () => {
  // 上一步已经填了 黄芪 30 g，「保存药方」可以点
  await expect(page.getByRole("button", { name: "保存药方" })).toBeEnabled();
  // 保存药方是 server action：会向当前页面发 POST。记下按 Enter 前后有没有发
  const posts: string[] = [];
  const onRequest = (r: import("@playwright/test").Request) => r.method() === "POST" && posts.push(r.url());
  page.on("request", onRequest);
  await page.getByTestId("az-open").click();
  await page.getByLabel("搜药材").fill("mai dong");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("az-picker")).toBeHidden();
  await expect(page.getByLabel("药名", { exact: true }).nth(2)).toHaveValue("麦冬");
  await page.waitForTimeout(1000); // 给可能的提交留时间，免得检查得太早
  page.off("request", onRequest);
  expect(posts).toEqual([]);
  await expect(page).toHaveURL(/\/prescriptions\/new$/);
  const [{ n }] = await sql<{ n: string }>(
    `select count(*)::text n from prescriptions p join workspace_members m on m.workspace_id = p.workspace_id
     join auth.users au on au.id = m.user_id where au.email = $1`,
    [u.email],
  );
  expect(n).toBe("0");
});

test("键盘：打开后焦点在搜索框；Tab 只在面板里转，不会跑到被盖住的表单上", { tag: ["@RX-5"] }, async () => {
  await page.getByTestId("az-open").click();
  await expect(page.getByLabel("搜药材")).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  }
  await page.keyboard.press("Escape");
});

test("页面加载完（水合）之前，「A–Z 选药」点不了", { tag: ["@RX-5"] }, async ({ browser }) => {
  const cookies = await page.context().cookies();
  const ctx = await browser.newContext();
  try {
    await ctx.addCookies(cookies);
    // 拦住 React 的 JS：HTML 照常，React 不接管页面 = 水合之前的样子
    await ctx.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, (r) => r.abort());
    const raw = await ctx.newPage();
    await raw.goto("/prescriptions/new");
    await expect(raw.getByTestId("az-open")).toBeDisabled();
  } finally {
    await ctx.close();
  }
});

test("手机上：从底部弹出，不横向溢出，选完关上", { tag: ["@RX-5", "@PLAT-2"] }, async ({ browser }) => {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await m.goto("/login");
  await m.getByLabel("邮箱").fill(u.email);
  await m.getByLabel("密码").fill(u.password);
  await m.getByRole("button", { name: "登录" }).click();
  await m.waitForURL((x) => !x.pathname.startsWith("/login"));
  await openPicker(m);
  const box = (await m.getByTestId("az-picker").boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(844); // 贴着屏幕底部
  expect(box.width).toBe(390);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // 遮罩盖住整个页面（包括顶部导航）：导航的位置上最上层的是遮罩，不是导航
  const topIsNav = await m.evaluate(() => !!document.elementFromPoint(20, 20)?.closest("header"));
  expect(topIsNav).toBe(false);
  await m.screenshot({ path: `${SHOTS}/A-Z选药-手机.png` });
  await m.getByRole("button", { name: "跳到 M" }).tap();
  await m.getByTestId("az-herb-麦冬").tap();
  await expect(m.getByTestId("az-picker")).toBeHidden();
  await expect(m.getByLabel("药名", { exact: true }).first()).toHaveValue("麦冬");
  await m.close();
});
