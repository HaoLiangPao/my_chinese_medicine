/**
 * 应用内 Bug 反馈（PLAT-3，docs/design/0014）。
 * 期望值都在这里独立写出来（走了哪些页面、点了哪些按钮），不读 App 里的脱敏函数。
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { RUN, signIn, signUp, sql, workspaceOf } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const SLACK = "http://127.0.0.1:54400/__slack";
const home = { email: `bug-home+${RUN}@example.com`, password: "secret-bug-123" };
const doctor = { email: `bug-doctor+${RUN}@example.com`, password: "secret-bug-456" };
const PATIENT = { name: "张三丰", phone: "416-555-0199" };

type Row = {
  id: string;
  reporter_id: string;
  workspace_id: string | null;
  page_path: string;
  description: string;
  user_agent: string;
  viewport: string;
  app_version: string;
  recent_actions: { t: string; kind: string; label: string }[];
  recent_errors: { t: string; message: string; stack: string }[];
  status: string;
  created_at: Date;
};
const reportsBy = (desc: string) => sql<Row>("select * from bug_reports where description = $1", [desc]);
const userId = async (email: string) => (await sql<{ id: string }>("select id from auth.users where email = $1", [email]))[0].id;

const fab = (p: Page) => p.getByTestId("bug-report-open");
const panel = (p: Page) => p.getByTestId("bug-report-panel");
const box = (p: Page) => panel(p).getByLabel("遇到了什么问题？");
const send = (p: Page) => panel(p).getByRole("button", { name: "提交" });
async function openPanel(p: Page) {
  await fab(p).click();
  await expect(panel(p)).toBeVisible();
}
async function closePanel(p: Page) {
  await panel(p).getByRole("button", { name: "关闭" }).click();
  await expect(panel(p)).toBeHidden();
}

let page: Page; // 家庭账号
let clinicPage: Page; // 诊所账号
let homeReport: string;
let clinicReport: string;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  clinicPage = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
  await clinicPage.close();
});

test("1. 家庭账号：按钮在；描述为空不能提交；提交后数据库里的字段都对，表单里填了一半的还在", { tag: ["@PLAT-3"] }, async () => {
  const started = Date.now();
  await signUp(page, home);
  await expect(fab(page)).toBeVisible();
  await expect(fab(page)).toHaveAccessibleName("反馈问题");
  await expect(fab(page)).toContainText("反馈问题"); // 桌面上有文字

  // 走几步：带 query 的页面 → 点导航 → 点「＋ 新药方」→ 填表 → 点「＋ 加一味」
  await page.goto("/herbs?q=secret-value-4165550101");
  await page.getByTestId("nav").getByRole("link", { name: "药方" }).click();
  await page.waitForURL(/\/prescriptions$/);
  await page.getByRole("link", { name: "＋ 新药方" }).click();
  await page.waitForURL(/\/prescriptions\/new$/);
  const title = page.locator('input[name="title"]');
  await title.fill("输入框里的字 hao@example.com");
  await page.getByLabel("药名", { exact: true }).first().fill("黄芪");
  await page.getByLabel("每副克数", { exact: true }).first().fill("30");
  await page.getByRole("button", { name: "＋ 加一味" }).click();
  await page.screenshot({ path: `${SHOTS}/bug-report-desktop-closed.png` });

  // 面板：空的、只有空格的都不能提交
  await openPanel(page);
  await expect(send(page)).toBeDisabled();
  await box(page).fill("   \n ");
  await expect(send(page)).toBeDisabled();

  // 展开能看到这一次会带上的内容
  const attached = page.getByTestId("bug-report-attached");
  await attached.locator("summary").click();
  await expect(attached).toContainText("/prescriptions/new");
  await expect(attached).toContainText("点 ＋ 加一味");
  await expect(attached).toContainText("打开 /herbs?q");
  await expect(attached).not.toContainText("secret-value");
  await expect(attached).not.toContainText("输入框里的字");

  const desc = `保存药方点了没反应 ${RUN}`;
  await box(page).fill(`  ${desc}  `);
  await page.screenshot({ path: `${SHOTS}/bug-report-desktop-open.png` });
  await send(page).click();
  const ok = page.getByTestId("bug-report-ok");
  await expect(ok).toContainText("已收到，谢谢！");

  const rows = await reportsBy(desc);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  homeReport = row.id;
  await expect(ok).toContainText(row.id.slice(0, 8));
  expect(row.reporter_id).toBe(await userId(home.email));
  expect(row.workspace_id).toBe(await workspaceOf(home.email));
  expect(row.page_path).toBe("/prescriptions/new");
  expect(row.status).toBe("new");
  expect(row.app_version).toBe("e2e-test-sha");
  const vp = page.viewportSize()!;
  expect(row.viewport).toBe(`${vp.width}x${vp.height}`);
  expect(row.user_agent).toBe(await page.evaluate(() => navigator.userAgent));
  expect(row.created_at.getTime()).toBeGreaterThanOrEqual(started - 5_000);
  expect(row.created_at.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
  // 操作记录：去了哪、点了什么，一条不多一条不少；点输入框、打字都不记
  expect(row.recent_actions.map((a) => [a.kind, a.label])).toEqual([
    ["nav", "/herbs?q"],
    ["click", "→ /prescriptions"],
    ["nav", "/prescriptions"],
    ["click", "→ /prescriptions/new"],
    ["nav", "/prescriptions/new"],
    ["click", "＋ 加一味"],
  ]);
  for (const a of row.recent_actions) {
    expect(Date.parse(a.t)).toBeGreaterThanOrEqual(started);
    expect(Date.parse(a.t)).toBeLessThanOrEqual(Date.now());
  }
  expect(row.recent_errors).toEqual([]);
  // query 的值、输入框里打的字都不在这条记录里
  const all = JSON.stringify(row);
  for (const secret of ["secret-value", "4165550101", "输入框里的字", "hao@example.com", "黄芪"]) expect(all, secret).not.toContain(secret);

  // 关掉面板：表单里填了一半的还在（提交反馈不会把页面上的东西冲掉）
  await closePanel(page);
  await expect(title).toHaveValue("输入框里的字 hao@example.com");
  await expect(page.getByLabel("药名", { exact: true }).first()).toHaveValue("黄芪");
  await expect(page.getByLabel("每副克数", { exact: true }).first()).toHaveValue("30");
  // 再打开是空的，可以写下一条
  await openPanel(page);
  await expect(box(page)).toHaveValue("");
  await closePanel(page);
});

test("2. 诊所账号：提交成功；报告里没有病人的姓名和电话；Slack 只收到 id、路径、时间、描述前 100 字", { tag: ["@PLAT-3"] }, async () => {
  await signUp(clinicPage, doctor, "反馈诊所");
  const ws = await workspaceOf(doctor.email);
  const [{ id: patient }] = await sql<{ id: string }>("insert into patients (workspace_id, name, phone) values ($1, $2, $3) returning id", [
    ws,
    PATIENT.name,
    PATIENT.phone,
  ]);
  await expect(fab(clinicPage)).toBeVisible();

  // 开方页（地址里带病人 id）→ 换一个 → 搜病人 → 点搜索结果（按钮上是姓名和电话）
  await clinicPage.goto(`/clinic/prescribe?patient=${patient}&from=secret-value`);
  await expect(clinicPage.getByTestId("selected-patient")).toContainText(PATIENT.name);
  await clinicPage.getByRole("button", { name: "换一个" }).click();
  await clinicPage.getByLabel("搜病人").fill("三丰");
  const hit = clinicPage.getByTestId("patient-result").filter({ hasText: PATIENT.name });
  await expect(hit).toContainText(PATIENT.phone);
  await hit.click();
  await expect(clinicPage.getByTestId("selected-patient")).toContainText(PATIENT.name);

  // 搜一味目录里没有的药 → 点「＋ 新增「…」」（按钮上是搜索框里打的字）
  const typed = `秘方草${RUN}`;
  await clinicPage.getByLabel("搜药材").fill(typed);
  await clinicPage.getByRole("button", { name: `＋ 新增「${typed}」` }).click();
  await expect(clinicPage.getByLabel("搜药材")).toHaveValue("");

  // 描述超过 100 字，里面有电话和邮箱：数据库里原样保存，Slack 里只有前 100 字、遮过
  const tail = "后面还有很长的说明".repeat(20);
  const desc = `处方保存不了，病人电话 ${PATIENT.phone} 邮箱 a@b.com <!channel>。${tail} ${RUN}`;
  await openPanel(clinicPage);
  await box(clinicPage).fill(desc);
  await send(clinicPage).click();
  await expect(clinicPage.getByTestId("bug-report-ok")).toContainText("已收到，谢谢！");

  const rows = await reportsBy(desc);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  clinicReport = row.id;
  expect(row.reporter_id).toBe(await userId(doctor.email));
  expect(row.workspace_id).toBe(ws);
  expect(row.page_path).toBe("/clinic/prescribe?patient&from");
  expect(row.recent_actions.map((a) => [a.kind, a.label])).toEqual([
    ["nav", "/clinic/prescribe?patient&from"],
    ["click", "换一个"],
    ["click", "（已隐藏）"],
    ["click", "（已隐藏）"],
  ]);
  const withoutDescription = JSON.stringify({ ...row, description: "" });
  for (const secret of [PATIENT.name, "三丰", PATIENT.phone, "0199", "secret-value", patient, typed, "秘方草"]) {
    expect(withoutDescription, secret).not.toContain(secret);
  }

  // Slack（假的 webhook）：响应发出去以后才发，等它到
  // 独立算出来的前 100 字：先遮电话和邮箱，再取 100 个字，最后转义 < >
  const plain = Array.from(`处方保存不了，病人电话 [数字] 邮箱 [邮箱] <!channel>。${tail}`).slice(0, 100).join("");
  const escaped = plain.replace("<!channel>", "&lt;!channel&gt;");
  let mine: { text: string }[] = [];
  await expect
    .poll(async () => {
      const all = (await (await fetch(SLACK)).json()) as { text: string }[];
      mine = all.filter((m) => m.text.includes(row.id));
      return mine.length;
    })
    .toBe(1);
  expect(Object.keys(mine[0])).toEqual(["text"]);
  const lines = mine[0].text.split("\n");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toBe(`🐞 新的问题反馈 ${row.id}`);
  expect(lines[1]).toBe("页面：/clinic/prescribe?patient&amp;from");
  expect(lines[2]).toMatch(/^时间：/);
  expect(new Date(lines[2].slice("时间：".length)).getTime()).toBe(row.created_at.getTime());
  expect(lines[3]).toBe(`描述：${escaped}…`);
  for (const secret of [PATIENT.phone, "0199", "a@b.com", "换一个", "已隐藏", "Mozilla", doctor.email])
    expect(mine[0].text, secret).not.toContain(secret);
  // 家庭账号那一条也发了，一共就这两条
  const all = (await (await fetch(SLACK)).json()) as { text: string }[];
  expect(all.filter((m) => m.text.includes(homeReport))).toHaveLength(1);
});

test("3. 别的用户读不到：用各自的登录身份直接查 API", { tag: ["@PLAT-3"] }, async () => {
  const api = async (u?: { email: string; password: string }) => {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (u) expect((await c.auth.signInWithPassword(u)).error).toBeNull();
    return c;
  };
  const asHome = await api(home);
  const asDoctor = await api(doctor);
  const ids = async (c: Awaited<ReturnType<typeof api>>) => {
    const { data, error } = await c.from("bug_reports").select("id");
    expect(error).toBeNull();
    return (data ?? []).map((r) => r.id as string);
  };
  // 自己的读得到（对照），别人的读不到
  expect(await ids(asHome)).toEqual([homeReport]);
  expect(await ids(asDoctor)).toEqual([clinicReport]);
  expect((await asDoctor.from("bug_reports").select("id").eq("id", homeReport)).data).toEqual([]);
  // 改不了状态、删不掉（自己的也不行）
  const upd = await asHome.from("bug_reports").update({ status: "fixed" }).eq("id", homeReport).select("id");
  expect(upd.error?.message).toContain("permission denied");
  const del = await asHome.from("bug_reports").delete().eq("id", homeReport).select("id");
  expect(del.error?.message).toContain("permission denied");
  // 不能替别人提交、不能自己定状态
  const fake = await asDoctor.from("bug_reports").insert({ page_path: "/", description: "x", reporter_id: await userId(home.email) });
  expect(fake.error?.message).toContain("permission denied");
  const st = await asDoctor.from("bug_reports").insert({ page_path: "/", description: "x", status: "fixed" });
  expect(st.error?.message).toContain("permission denied");
  // 没登录：什么都读不到、写不了
  const anon = await api();
  expect((await anon.from("bug_reports").select("id")).error?.message).toContain("permission denied");
  expect((await anon.from("bug_reports").insert({ page_path: "/", description: "x" })).error?.message).toContain("permission denied");
  expect((await sql<{ status: string }>("select status from bug_reports where id = $1", [homeReport]))[0].status).toBe("new");
});

test("4. 提交失败：有提示，写的内容还在；刷新页面草稿还在；恢复后再提交成功", { tag: ["@PLAT-3"] }, async () => {
  const desc = `断网的时候提交 ${RUN}`;
  await page.goto("/inventory");
  // 拦掉 server action 的请求（模拟断网）
  const failActions = (route: import("@playwright/test").Route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.continue();
  await page.route("**/*", failActions);
  await openPanel(page);
  await box(page).fill(desc);
  await send(page).click();
  const alert = page.getByTestId("bug-report-error");
  await expect(alert).toContainText("没发出去");
  await expect(alert).toHaveRole("alert");
  await expect(box(page)).toHaveValue(desc);
  await expect(page.getByTestId("bug-report-ok")).toHaveCount(0);
  expect(await reportsBy(desc)).toHaveLength(0);

  // 整个页面刷新（比如登录过期被带去登录页再回来）：草稿还在
  await page.unroute("**/*", failActions);
  await page.reload();
  await openPanel(page);
  await expect(box(page)).toHaveValue(desc);
  await expect(page.getByTestId("bug-report-error")).toHaveCount(0);
  await send(page).click();
  await expect(page.getByTestId("bug-report-ok")).toContainText("已收到，谢谢！");
  const rows = await reportsBy(desc);
  expect(rows).toHaveLength(1);
  expect(rows[0].page_path).toBe("/inventory");
  // 成功以后草稿清掉：刷新再打开是空的
  await page.reload();
  await openPanel(page);
  await expect(box(page)).toHaveValue("");
  await closePanel(page);
});

test("5. 今天的次数用完：有提示，写的内容还在，没有存进去", { tag: ["@PLAT-3"] }, async () => {
  const uid = await userId(home.email);
  const [{ count: before }] = await sql<{ count: number }>("select count from bug_report_usage where user_id = $1", [uid]);
  expect(before).toBe(2); // 前面成功提交了 2 条；失败的那次不计
  await sql("update bug_report_usage set count = 20 where user_id = $1", [uid]);
  try {
    const desc = `第 21 条 ${RUN}`;
    await openPanel(page);
    await box(page).fill(desc);
    await send(page).click();
    await expect(page.getByTestId("bug-report-error")).toContainText("今天的反馈次数已用完");
    await expect(box(page)).toHaveValue(desc);
    expect(await reportsBy(desc)).toHaveLength(0);
    // 别人不受影响（每人单独算）：数据库测试里测了；这里只确认这个人的计数没被多加
    expect((await sql<{ count: number }>("select count from bug_report_usage where user_id = $1", [uid]))[0].count).toBe(20);
    await box(page).fill("");
    await closePanel(page);
  } finally {
    await sql("update bug_report_usage set count = $2 where user_id = $1", [uid, before]);
  }
});

/** 手机 390px：滚到底，「保存」按钮整个在屏幕里、不和悬浮按钮重叠、点它点到的就是它 */
async function expectSaveClear(p: Page, url: string, saveName: string | RegExp) {
  await p.goto(url);
  await p.waitForLoadState("networkidle");
  const save = p.getByRole("button", { name: saveName }).last();
  await expect(save).toBeVisible();
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const f = (await fab(p).boundingBox())!;
  const s = (await save.boundingBox())!;
  expect(f.width, `${url} 按钮宽`).toBeGreaterThanOrEqual(44);
  expect(f.height, `${url} 按钮高`).toBeGreaterThanOrEqual(44);
  expect(f.x + f.width, `${url} 按钮在屏幕里`).toBeLessThanOrEqual(390);
  expect(s.y, `${url}「保存」在屏幕里`).toBeGreaterThanOrEqual(0);
  expect(s.y + s.height, `${url}「保存」在屏幕里`).toBeLessThanOrEqual(844);
  const overlap = s.x < f.x + f.width && f.x < s.x + s.width && s.y < f.y + f.height && f.y < s.y + s.height;
  expect(overlap, `${url}「保存」${JSON.stringify(s)} 和悬浮按钮 ${JSON.stringify(f)} 重叠`).toBe(false);
  // 「保存」的中间和右下角（最靠近悬浮按钮的地方）点到的都是它自己
  const hits = await save.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.right - 3, r.bottom - 3],
    ].map(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      return top === el || el.contains(top);
    });
  });
  expect(hits, `${url}「保存」被挡住`).toEqual([true, true]);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${url} 横向溢出`).toBeLessThanOrEqual(0);
}
const phone = (browser: Browser) => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("6. 手机 390px：按钮够大，不挡录方、采购、开方页的「保存」；面板能用", { tag: ["@PLAT-3"] }, async ({ browser }) => {
  const ctx = await phone(browser);
  const m = await ctx.newPage();
  await signIn(m, home);
  await expect(fab(m)).toBeVisible();
  await expect(fab(m)).toHaveAccessibleName("反馈问题");
  await expect(fab(m).getByText("反馈问题")).toBeHidden(); // 手机上只有图标
  await expectSaveClear(m, "/prescriptions/new", "保存药方");
  await m.screenshot({ path: `${SHOTS}/bug-report-mobile-closed.png` });
  await expectSaveClear(m, "/purchases/new", "保存");

  // 面板在手机上：从底部弹出，不横向溢出，提交按钮够大
  await openPanel(m);
  await box(m).fill("手机上的截图：点了保存没反应");
  await m.getByTestId("bug-report-attached").locator("summary").click();
  const p = (await panel(m).boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(390);
  expect(p.y + p.height).toBeLessThanOrEqual(844);
  expect((await send(m).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await m.screenshot({ path: `${SHOTS}/bug-report-mobile-open.png` });
  await box(m).fill(""); // 不留草稿
  await closePanel(m);
  await ctx.close();

  // 诊所账号的开方页
  const ctx2 = await phone(browser);
  const d = await ctx2.newPage();
  await d.goto("/login");
  await d.getByLabel("邮箱").fill(doctor.email);
  await d.getByLabel("密码").fill(doctor.password);
  await d.getByRole("button", { name: "登录" }).click();
  await expect(d.getByRole("heading", { name: "最近的处方" })).toBeVisible();
  await expectSaveClear(d, "/clinic/prescribe", /先选一个病人|先加药|保存并生成消息/);
  await d.screenshot({ path: `${SHOTS}/bug-report-mobile-prescribe.png` });
  await ctx2.close();
});

test("7. 没登录的页面（登录页、公开的学堂）没有按钮", { tag: ["@PLAT-3"] }, async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await expect(p.getByRole("button", { name: "登录" })).toBeVisible();
  await expect(fab(p)).toHaveCount(0);
  await expect(panel(p)).toHaveCount(0);
  const res = await p.goto("/learn");
  expect(res?.status()).toBe(200);
  await expect(p.getByTestId("nav")).toBeVisible();
  await expect(fab(p)).toHaveCount(0);
  await ctx.close();
});
