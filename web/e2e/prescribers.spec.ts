/**
 * 家庭录方的医生下拉（RX-6，docs/design/0011-prescribers.md）：
 * 新增医生 → 下一张默认选上一次的 → 详情页显示名字 → 别的药柜看不到 → 老药方只有文字照样显示。
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { RUN, signUp, sql, workspaceOf } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const u = { email: `rx6+${RUN}@example.com`, password: "secret-rx6-123" };
const other = { email: `rx6other+${RUN}@example.com`, password: "secret-rx6-456" };
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signUp(page, u);
});
test.afterAll(async () => page.close());

const select = (p: Page) => p.getByLabel("医生", { exact: true });
const selectedText = (p: Page) => select(p).evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent ?? "");

async function openForm(p: Page) {
  await p.goto("/prescriptions/new");
  await expect(p.getByRole("button", { name: /拍照/ })).toBeEnabled(); // 等页面水合完成
}

async function fillOneHerbAndSave(p: Page, title: string) {
  await p.getByPlaceholder("如：十月调理方").fill(title);
  await p.getByLabel("药名", { exact: true }).first().fill("黄芪");
  await p.getByLabel("每副克数").first().fill("10");
  await p.getByRole("button", { name: "保存药方" }).click();
  await expect(p).toHaveURL(/\/prescriptions\/[0-9a-f-]{36}$/);
  await expect(p.getByRole("heading", { name: title })).toBeVisible();
}

const rowOf = (title: string) =>
  sql<{ prescriber: string | null; name: string | null }>(
    `select p.prescriber, d.name from prescriptions p left join prescribers d on d.id = p.prescriber_id where p.title = $1`,
    [title],
  ).then((r) => r[0]);

test("第一次：没有医生，默认不填；当场新增「李医生」，详情页显示名字", { tag: ["@RX-6"] }, async () => {
  await openForm(page);
  expect(await selectedText(page)).toBe("不填");
  await expect(select(page).locator("option")).toHaveText(["不填", "＋ 新增医生…"]);

  await select(page).selectOption({ label: "＋ 新增医生…" });
  await page.getByLabel("新医生的名字").fill("  李医生 ");
  await page.locator(".card", { has: select(page) }).screenshot({ path: `${SHOTS}/医生-新增.png` });
  await fillOneHerbAndSave(page, `RX6-第一张-${RUN}`);
  await expect(page.getByText(/· 李医生 ·/)).toBeVisible();
  // 同时写了文字字段（旧代码只读它），名字去了空格
  expect(await rowOf(`RX6-第一张-${RUN}`)).toEqual({ prescriber: "李医生", name: "李医生" });
});

test("下一张默认选上一次的医生；不改直接存", { tag: ["@RX-6"] }, async () => {
  await openForm(page);
  expect(await selectedText(page)).toBe("李医生");
  await expect(select(page).locator("option")).toHaveText(["不填", "李医生", "＋ 新增医生…"]);
  await page.locator(".card", { has: select(page) }).screenshot({ path: `${SHOTS}/医生-默认上一次.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".card", { has: select(page) }).screenshot({ path: `${SHOTS}/医生-手机.png` });
  await page.setViewportSize({ width: 1280, height: 720 });
  await fillOneHerbAndSave(page, `RX6-第二张-${RUN}`);
  await expect(page.getByText(/· 李医生 ·/)).toBeVisible();

  // 再新增一次同名的：不会建第二个
  await openForm(page);
  await select(page).selectOption({ label: "＋ 新增医生…" });
  await page.getByLabel("新医生的名字").fill("李医生");
  await fillOneHerbAndSave(page, `RX6-同名-${RUN}`);
  const ws = await workspaceOf(u.email);
  const [{ n }] = await sql<{ n: string }>(`select count(*) n from prescribers where workspace_id = $1`, [ws]);
  expect(Number(n)).toBe(1);
});

test("换一位医生：下一张默认选新的；选「不填」存成空", { tag: ["@RX-6"] }, async () => {
  await openForm(page);
  await select(page).selectOption({ label: "＋ 新增医生…" });
  await page.getByLabel("新医生的名字").fill("王医生");
  await fillOneHerbAndSave(page, `RX6-王医生-${RUN}`);

  await openForm(page);
  expect(await selectedText(page)).toBe("王医生");
  await expect(select(page).locator("option")).toHaveText(["不填", "李医生", "王医生", "＋ 新增医生…"]);
  await select(page).selectOption({ label: "不填" });
  await fillOneHerbAndSave(page, `RX6-不填-${RUN}`);
  await expect(page.getByText(/医生 ·/)).toHaveCount(0);
  expect(await rowOf(`RX6-不填-${RUN}`)).toEqual({ prescriber: null, name: null });

  // 「不填」的药方不改变默认值：还是上一张挂了医生的（王医生）
  await openForm(page);
  expect(await selectedText(page)).toBe("王医生");
});

test("新增时没填名字：不能保存，提示", { tag: ["@RX-6"] }, async () => {
  await openForm(page);
  await select(page).selectOption({ label: "＋ 新增医生…" });
  await page.getByLabel("药名", { exact: true }).first().fill("黄芪");
  await page.getByLabel("每副克数").first().fill("10");
  await page.getByRole("button", { name: "保存药方" }).click();
  await expect(page.getByText("请填写新医生的名字")).toBeVisible();
  await expect(page).toHaveURL(/\/prescriptions\/new$/);
});

test("老药方只有文字（没有 prescriber_id）：详情页照样显示", { tag: ["@RX-6"] }, async () => {
  const ws = await workspaceOf(u.email);
  const [{ id }] = await sql<{ id: string }>(
    `insert into prescriptions (workspace_id, title, prescriber) values ($1, $2, '张大夫') returning id`,
    [ws, `RX6-老药方-${RUN}`],
  );
  await sql(`insert into prescription_items (prescription_id, herb_id, grams_per_dose) values ($1, match_herb('甘草'), 6)`, [id]);
  await page.goto(`/prescriptions/${id}`);
  await expect(page.getByText(/· 张大夫 ·/)).toBeVisible();
});

test("别的药柜看不到这些医生", { tag: ["@RX-6", "@ACC-5"] }, async ({ browser }) => {
  const p = await browser.newPage();
  await signUp(p, other);
  await openForm(p);
  await expect(select(p).locator("option")).toHaveText(["不填", "＋ 新增医生…"]);
  expect(await selectedText(p)).toBe("不填");
  await p.close();
});
