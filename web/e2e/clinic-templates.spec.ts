/**
 * 基于已有药方开新处方：预设药方 + 复用（IDEA-3，docs/design/0013）。
 * 起始数据（病人、一张旧处方）用 SQL 造，复用的过程全部走页面。
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { RUN, signUp, sql, workspaceOf } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const doctor = { email: `tpl-doctor+${RUN}@example.com`, password: "secret-tpl-123" };
let page: Page;
let ws: string;
let zhang: string; // 张三（有一张旧处方）
let li: string; // 李四（新病人）
let oldRx: string;
let tmpTpl: string;

const lineNames = () => page.getByTestId("rx-lines").locator("tbody tr td:first-child").allTextContents();
const templateRow = async (name: string) =>
  (
    await sql<{ id: string; dose_count: number; use_count: number }>(
      "select id, dose_count, use_count from prescription_templates where workspace_id = $1 and name = $2",
      [ws, name],
    )
  )[0];
const templateItems = async (id: string) =>
  (
    await sql<{ name: string; g: string }>(
      "select h.name_zh name, i.grams_per_dose::text g from prescription_template_items i join herbs h on h.id = i.herb_id where i.template_id = $1 order by i.sort_order",
      [id],
    )
  ).map((r) => `${r.name} ${Number(r.g)}`);

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage(); // 确认框在每个用例里单独处理（有的要点「取消」）
  await signUp(page, doctor, "复用诊所");
  ws = await workspaceOf(doctor.email);
  [{ id: zhang }] = await sql<{ id: string }>(
    "insert into patients (workspace_id, name, phone) values ($1, '张三', '416-555-0101') returning id",
    [ws],
  );
  [{ id: li }] = await sql<{ id: string }>("insert into patients (workspace_id, name) values ($1, '李四') returning id", [ws]);
  [{ id: oldRx }] = await sql<{ id: string }>(
    `insert into prescriptions (workspace_id, patient_id, source, title, patient_label, issued_on, dose_count, instructions)
     values ($1, $2, 'clinic', '张三 2026-10-15', '张三', '2026-10-15', 7, '水煎服，日一剂') returning id`,
    [ws, zhang],
  );
  await sql(
    `insert into prescription_items (prescription_id, herb_id, grams_per_dose, sort_order)
     select $1, h.id, v.g, v.o from (values ('黄芪', 30, 0), ('白术', 12, 1), ('茯苓', 15, 2)) v(n, g, o) join herbs h on h.name_zh = v.n`,
    [oldRx],
  );
});
test.afterAll(async () => page.close());

async function openPicker() {
  await expect(page.getByTestId("reuse-open")).toBeEnabled();
  await page.getByTestId("reuse-open").click();
  await expect(page.getByTestId("reuse-picker")).toBeVisible();
}

test("「全部处方」看得到别的病人的处方，但只有日期和药材，没有病人的名字和电话", { tag: ["@RX-9"] }, async () => {
  await page.goto(`/clinic/prescribe?patient=${li}`);
  await openPicker();
  await expect(page.getByTestId("reuse-list")).toContainText("还没有预设药方"); // 默认是预设，还没有
  await page.getByRole("button", { name: "全部处方" }).click();
  const item = page.getByTestId("reuse-item").first();
  await expect(item).toContainText("2026-10-15 的处方");
  await expect(item).toContainText("黄芪 30、白术 12、茯苓 15");
  await expect(page.getByTestId("reuse-picker")).not.toContainText("张三");
  // 页面数据里也没有张三的名字和电话（不只是没显示）
  const html = await page.content();
  expect(html).not.toContain("张三");
  expect(html).not.toContain("416-555-0101");
  await page.screenshot({ path: `${SHOTS}/复用-全部处方.png` });
});

test("照着处方开 → 保存时提醒存成预设 → 存成「补气方」；新处方记下来源", { tag: ["@RX-9"] }, async () => {
  await page.getByTestId("reuse-item").first().click();
  await expect(page.getByTestId("reuse-picker")).toBeHidden();
  expect(await lineNames()).toEqual(["黄芪", "白术", "茯苓"]);
  await expect(page.getByTestId("reuse-source")).toContainText("照着：2026-10-15 的处方");
  await expect(page.getByLabel("煎服法")).toHaveValue("水煎服，日一剂");
  const prompt = page.getByTestId("preset-prompt");
  await expect(prompt).toContainText("这张是照着以前的处方开的");
  await prompt.getByLabel("同时存成预设药方").check();
  await expect(page.getByRole("button", { name: "给预设起个名字" })).toBeDisabled();
  await prompt.getByLabel("预设药方的名字").fill("补气方");
  await page.screenshot({ path: `${SHOTS}/复用-保存时提醒.png`, fullPage: true });
  await page.getByRole("button", { name: "保存并生成消息" }).click();
  await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}\?new=1$/);

  const newRx = page.url().match(/prescriptions\/([0-9a-f-]{36})/)![1];
  const [rx] = await sql<{ source_prescription_id: string; patient_id: string }>(
    "select source_prescription_id, patient_id from prescriptions where id = $1",
    [newRx],
  );
  expect(rx).toEqual({ source_prescription_id: oldRx, patient_id: li });
  const t = await templateRow("补气方");
  expect(t.use_count).toBe(1);
  expect(await templateItems(t.id)).toEqual(["黄芪 30", "白术 12", "茯苓 15"]);
});

test("照着预设开 → 删一味 → 勾「同时更新预设」→ 预设变了，以前的处方不变", { tag: ["@RX-9"] }, async () => {
  await page.goto(`/clinic/prescribe?patient=${li}`);
  await openPicker();
  await expect(page.getByTestId("reuse-item").first()).toContainText("补气方"); // 默认就是预设
  await page.getByTestId("reuse-item").first().click();
  await expect(page.getByTestId("reuse-source")).toContainText("照着：预设「补气方」");
  await page.getByTestId("rx-lines").locator("tr", { hasText: "茯苓" }).getByRole("button", { name: "删" }).click();
  expect(await lineNames()).toEqual(["黄芪", "白术"]);
  await page
    .getByTestId("preset-prompt")
    .getByLabel(/同时更新预设「补气方」/)
    .check();
  await page.getByRole("button", { name: "保存并生成消息" }).click();
  await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}\?new=1$/);

  const t = await templateRow("补气方");
  expect(t.use_count).toBe(2);
  expect(await templateItems(t.id)).toEqual(["黄芪 30", "白术 12"]);
  const [{ n }] = await sql<{ n: string }>("select count(*)::text n from prescription_items where prescription_id = $1", [oldRx]);
  expect(n).toBe("3"); // 原处方没变
});

test("「当前病人的」只有这个病人的；按药材搜", { tag: ["@RX-9"] }, async () => {
  await page.goto(`/clinic/prescribe?patient=${li}`);
  await openPicker();
  await page.getByRole("button", { name: "当前病人的" }).click();
  await expect(page.getByTestId("reuse-item")).toHaveCount(2); // 李四刚开的两张
  await expect(page.getByTestId("reuse-list")).not.toContainText("2026-10-15"); // 张三的那张不在
  await page.getByRole("button", { name: "全部处方" }).click();
  await expect(page.getByTestId("reuse-item")).toHaveCount(3);
  await page.getByLabel("搜药方").fill("茯苓");
  await expect(page.getByTestId("reuse-item")).toHaveCount(2); // 张三的旧处方 + 照着它开的那张
  await page.keyboard.press("Enter"); // 搜索框按 Enter 不提交处方
  await expect(page.getByTestId("reuse-picker")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("处方详情页：照这张再开一张（病人、药材带过来）；存成预设药方", { tag: ["@RX-9", "@CLN-6"] }, async () => {
  await page.goto(`/prescriptions/${oldRx}`);
  await page.getByRole("link", { name: "照这张再开一张" }).click();
  await page.waitForURL(/\/clinic\/prescribe\?from=/);
  await expect(page.getByTestId("reuse-source")).toContainText("照着：2026-10-15 的处方");
  await expect(page.getByTestId("selected-patient")).toContainText("张三");
  expect(await lineNames()).toEqual(["黄芪", "白术", "茯苓"]);

  await page.goto(`/prescriptions/${oldRx}`);
  await page.getByRole("button", { name: "存成预设药方" }).click();
  await page.getByLabel("预设药方的名字").fill("补气方");
  await page.getByRole("button", { name: "存", exact: true }).click();
  await expect(page.getByText("已经有叫「补气方」的预设药方了，换个名字")).toBeVisible();
  await page.getByLabel("预设药方的名字").fill("张三的老方");
  await page.getByRole("button", { name: "存", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已存成预设药方「张三的老方」");
  expect(await templateItems((await templateRow("张三的老方")).id)).toEqual(["黄芪 30", "白术 12", "茯苓 15"]);
});

test("预设药方管理：改名（重名提示）、删除；家庭账号打不开", { tag: ["@RX-9"] }, async ({ browser }) => {
  await page.goto("/clinic/templates");
  await expect(page.getByTestId("template-name")).toHaveText(["补气方", "张三的老方"]);
  await page.screenshot({ path: `${SHOTS}/预设药方管理.png`, fullPage: true });
  const card = page.getByTestId("template-card").filter({ hasText: "张三的老方" });
  await card.getByRole("button", { name: "改名" }).click();
  await card.getByLabel("新名字").fill("补气方");
  await card.getByRole("button", { name: "保存" }).click();
  await expect(card.getByText("已经有叫「补气方」的预设药方了，换个名字")).toBeVisible();
  await card.getByLabel("新名字").fill("老方");
  await card.getByRole("button", { name: "保存" }).click();
  await expect(page.getByTestId("template-name")).toHaveText(["补气方", "老方"]);
  // 改完还能再改
  const renamed = page.getByTestId("template-card").filter({ hasText: "老方" }).filter({ hasNotText: "补气方" });
  await renamed.getByRole("button", { name: "改名" }).click();
  await expect(renamed.getByLabel("新名字")).toBeVisible();
  await renamed.getByRole("button", { name: "取消" }).click();

  page.once("dialog", (d) => d.accept());
  await renamed.getByRole("button", { name: "删除" }).click();
  await page.waitForURL(/deleted=1/);
  await expect(page.getByTestId("template-name")).toHaveText(["补气方"]);

  const home = await browser.newPage();
  await signUp(home, { email: `tpl-home+${RUN}@example.com`, password: "secret-tpl-123" });
  const res = await home.goto("/clinic/templates");
  expect(res?.status()).toBe(404);
  await home.close();
});

test("开方时才选病人：「当前病人的」按需加载这个病人的处方", { tag: ["@RX-9"] }, async () => {
  await page.goto("/clinic/prescribe");
  await page.getByLabel("搜病人").fill("0101");
  await page.getByTestId("patient-result").filter({ hasText: "张三" }).click();
  await expect(page.getByTestId("selected-patient")).toContainText("张三");
  await openPicker();
  await page.getByRole("button", { name: "当前病人的" }).click();
  await expect(page.getByTestId("reuse-item")).toHaveCount(1);
  await expect(page.getByTestId("reuse-item")).toContainText("2026-10-15 的处方");
  await page.keyboard.press("Escape");
});

test("表单里已经有药时换来源：先确认，点「取消」不替换", { tag: ["@RX-9"] }, async () => {
  await page.goto(`/clinic/prescribe?patient=${li}`);
  await openPicker();
  await page.getByTestId("reuse-item").filter({ hasText: "补气方" }).click();
  await expect.poll(lineNames).toEqual(["黄芪", "白术"]); // 弹窗关上以后才填进表单
  await openPicker();
  await page.getByRole("button", { name: "全部处方" }).click();
  let message = "";
  page.once("dialog", (d) => {
    message = d.message();
    void d.dismiss();
  });
  await page.getByTestId("reuse-item").filter({ hasText: "2026-10-15" }).click();
  await expect.poll(() => message).toBe("替换现在的 2 味药？");
  expect(await lineNames()).toEqual(["黄芪", "白术"]); // 没替换
  await expect(page.getByTestId("reuse-source")).toContainText("照着：预设「补气方」"); // 来源也没变
});

test("「不算照着开的」：保存的处方不记来源，也不再提醒更新预设", { tag: ["@RX-9"] }, async () => {
  // 接着上一个用例：照着预设「补气方」
  await page.getByTestId("reuse-source").getByRole("button", { name: "不算照着开的" }).click();
  await expect(page.getByTestId("reuse-source")).toHaveCount(0);
  await expect(page.getByTestId("preset-prompt")).not.toContainText("同时更新预设");
  await expect(page.getByTestId("preset-prompt")).not.toContainText("照着以前的处方开的");
  const before = (await templateRow("补气方")).use_count;
  await page.getByRole("button", { name: "保存并生成消息" }).click();
  await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}\?new=1$/);
  const id = page.url().match(/prescriptions\/([0-9a-f-]{36})/)![1];
  const [rx] = await sql<{ t: string | null; p: string | null }>(
    "select source_template_id t, source_prescription_id p from prescriptions where id = $1",
    [id],
  );
  expect(rx).toEqual({ t: null, p: null });
  expect((await templateRow("补气方")).use_count).toBe(before); // 不算用了这个预设
});

test("开方期间预设被删了：照样保存，不报错，来源记成空", { tag: ["@RX-9"] }, async () => {
  [{ id: tmpTpl }] = await sql<{ id: string }>(
    `with t as (insert into prescription_templates (workspace_id, name, dose_count) values ($1, '临时预设', 7) returning id),
          i as (insert into prescription_template_items (template_id, herb_id, grams_per_dose) select t.id, h.id, 20 from t, herbs h where h.name_zh = '黄芪')
     select id from t`,
    [ws],
  );
  await page.goto(`/clinic/prescribe?patient=${li}&template=${tmpTpl}`);
  await expect(page.getByTestId("reuse-source")).toContainText("照着：预设「临时预设」");
  await page
    .getByTestId("preset-prompt")
    .getByLabel(/同时更新预设/)
    .check();
  await sql("delete from prescription_templates where id = $1", [tmpTpl]); // 比如在另一个标签页删掉了
  await page.getByRole("button", { name: "保存并生成消息" }).click();
  await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}\?new=1$/);
  await expect(page.getByTestId("tplerr")).toHaveCount(0);
  const id = page.url().match(/prescriptions\/([0-9a-f-]{36})/)![1];
  const [rx] = await sql<{ t: string | null }>("select source_template_id t from prescriptions where id = $1", [id]);
  expect(rx.t).toBeNull();
});

test("手机上：复用面板、预设管理页不横向溢出", { tag: ["@RX-9", "@PLAT-2"] }, async ({ browser }) => {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await m.goto("/login");
  await m.getByLabel("邮箱").fill(doctor.email);
  await m.getByLabel("密码").fill(doctor.password);
  await m.getByRole("button", { name: "登录" }).click();
  await m.waitForURL((x) => !x.pathname.startsWith("/login"));
  for (const url of [`/clinic/prescribe?patient=${li}`, "/clinic/templates"]) {
    await m.goto(url);
    await m.waitForLoadState("networkidle");
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await m.goto(`/clinic/prescribe?patient=${li}`);
  await expect(m.getByTestId("reuse-open")).toBeEnabled();
  await m.getByTestId("reuse-open").tap();
  await expect(m.getByTestId("reuse-picker")).toBeVisible();
  await m.screenshot({ path: `${SHOTS}/复用-手机.png` });
  await m.close();
});
