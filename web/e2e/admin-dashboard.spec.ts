/**
 * 平台管理员数据看板（PLAT-4，docs/design/0015）。
 * 挑一个没有任何处方的月份，用 SQL 灌进 fixtures/scenario.ts 里的 ADMIN_RX；看板上的数字和 fixture 独立算出来的比。
 * 账号、药柜、病人档案是全站总数（别的 project 也在建），用数据库的原始行数比。
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import {
  ADMIN_RX,
  adminRxDate,
  expectedAdminDays,
  expectedAdminHerbs,
  expectedAdminPairs,
  expectedAdminUsers,
  expectedAdminWeeks,
  type AdminRx,
} from "./fixtures/scenario";
import { RUN, signUp, sql, workspaceOf } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const doctor = { email: `admin-doctor+${RUN}@example.com`, password: "secret-admin-123" };
const home = { email: `admin-home+${RUN}@example.com`, password: "secret-admin-123" };
const admin = { email: `admin-owner+${RUN}@example.com`, password: "secret-admin-123" };
const CLINIC = "看板测试诊所";
// 病人姓名、电话、备注、处方标题、医嘱：都不能出现在看板上
const SECRET = { name: "看板秘密病人", phone: "416-555-07", notes: "看板秘密备注", title: "看板秘密标题", instructions: "看板秘密医嘱" };

let dp: Page; // 医生
let hp: Page; // 病人账号
let ap: Page; // 管理员
let month: string; // YYYY-MM

test.beforeAll(async ({ browser }) => {
  dp = await browser.newPage();
  hp = await browser.newPage();
  ap = await browser.newPage();
  await signUp(dp, doctor, CLINIC);
  await signUp(hp, home);
  await signUp(ap, admin);

  // 挑一个前后都没有处方的月份（从 2001-01 往后找）
  for (let i = 0; ; i++) {
    const m = `${2001 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
    const [{ n }] = await sql<{ n: number }>(
      `select count(*)::int n from prescriptions
       where created_at >= ($1::date - interval '7 days') and created_at < ($1::date + interval '1 month 7 days')`,
      [`${m}-01`],
    );
    if (n === 0) {
      month = m;
      break;
    }
  }

  const ws = { doctor: await workspaceOf(doctor.email), home: await workspaceOf(home.email), admin: await workspaceOf(admin.email) };
  const uid = async (email: string) => (await sql<{ id: string }>("select id from auth.users where email = $1", [email]))[0].id;
  const users = { doctor: await uid(doctor.email), home: await uid(home.email), admin: await uid(admin.email) };
  const patients: string[] = [];
  for (let n = 1; n <= 6; n++) {
    const [{ id }] = await sql<{ id: string }>(
      "insert into patients (workspace_id, name, phone, notes, created_by) values ($1, $2, $3, $4, $5) returning id",
      [ws.doctor, `${SECRET.name}${n}`, `${SECRET.phone}${n}`, SECRET.notes, users.doctor],
    );
    patients.push(id);
  }
  for (const r of ADMIN_RX as AdminRx[]) {
    const [{ id }] = await sql<{ id: string }>(
      `insert into prescriptions (workspace_id, created_by, patient_id, source, title, instructions, notes, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, ($8::timestamp at time zone 'America/Toronto')) returning id`,
      [
        ws[r.who],
        users[r.who],
        r.patient ? patients[r.patient - 1] : null,
        r.patient ? "clinic" : "manual",
        SECRET.title,
        SECRET.instructions,
        SECRET.notes,
        `${adminRxDate(month, r)} ${r.time ?? "12:00"}`,
      ],
    );
    await sql(
      `insert into prescription_items (prescription_id, herb_id, grams_per_dose)
       select $1, id, 10 from herbs where name_zh = any($2::text[])`,
      [id, r.herbs],
    );
  }
});
test.afterAll(async () => {
  await dp.close();
  await hp.close();
  await ap.close();
});

test("不是管理员：看板 404，直接调统计函数也拿不到", { tag: ["@PLAT-4"] }, async () => {
  for (const p of [dp, hp, ap]) {
    for (const url of ["/admin", `/admin?month=${month}`]) {
      const res = await p.goto(url);
      expect(res?.status(), url).toBe(404);
      await expect(p.getByText("找不到这个页面")).toBeVisible();
    }
  }
  // 绕过页面，用病人账号的登录直接调数据库的统计函数
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  expect((await c.auth.signInWithPassword(home)).error).toBeNull();
  for (const fn of ["admin_overview", "admin_user_activity", "admin_top_herbs", "admin_top_pairs"]) {
    const { data, error } = await c.rpc(fn, { p_month: `${month}-01` });
    expect(error?.message, fn).toContain("没有权限");
    expect(data, fn).toBeNull();
  }
  const { error } = await c.from("platform_admins").insert({ user_id: (await c.auth.getUser()).data.user!.id });
  expect(error, "不能把自己加成管理员").not.toBeNull();
});

test("管理员：这个月的数字和独立算的一致；没有病人信息", { tag: ["@PLAT-4"] }, async () => {
  await sql("insert into platform_admins (user_id, note) select id, 'E2E' from auth.users where email = $1", [admin.email]);
  const res = await ap.goto(`/admin?month=${month}`);
  expect(res?.status()).toBe(200);
  await expect(ap.getByRole("heading", { name: "平台数据" })).toBeVisible();

  // 概况：这个月的处方数（不含上个月最后一天深夜那张）、建过处方的账号
  const days = expectedAdminDays(month);
  const inMonth = [...days.values()].reduce((a, b) => a + b, 0);
  const users = expectedAdminUsers(month);
  await expect(ap.getByTestId("admin-prescriptions-value")).toHaveText(String(inMonth));
  const [db] = await sql<Record<string, number>>(
    `select (select count(*)::int from prescriptions) rx, (select count(*)::int from auth.users) users,
            (select count(*)::int from workspaces where kind = 'household') wh, (select count(*)::int from workspaces where kind = 'clinic') wc,
            (select count(*)::int from patients) patients`,
  );
  await expect(ap.getByTestId("admin-prescriptions-sub")).toHaveText(`${users.size} 个账号建过 · 一共 ${db.rx} 张`);
  await expect(ap.getByTestId("admin-users-value")).toHaveText(String(db.users));
  await expect(ap.getByTestId("admin-workspaces-sub")).toHaveText(`家庭 ${db.wh} · 诊所 ${db.wc}`);
  await expect(ap.getByTestId("admin-patients-value")).toHaveText(String(db.patients));

  // 趋势：每天、每周的每一根柱子
  for (const [bucket, expected] of [
    ["day", days],
    ["week", expectedAdminWeeks(month)],
  ] as const) {
    const bars = ap.getByTestId(`admin-trend-${bucket}`).locator("li[data-bucket]");
    await expect(bars).toHaveCount(expected.size);
    const got = await bars.evaluateAll((els) => els.map((e) => [e.getAttribute("data-bucket"), Number(e.getAttribute("data-count"))]));
    expect(new Map(got as [string, number][]), bucket).toEqual(expected);
  }

  // 账号：医生显示邮箱，病人账号只有编号；自己标「（你）」
  const rows = ap.getByTestId("admin-user");
  await expect(rows).toHaveCount(users.size);
  for (const [who, e] of users) {
    const row =
      who === "doctor"
        ? rows.filter({ hasText: doctor.email })
        : rows.filter({ hasText: /^病人 #\d+/ }).filter(who === "admin" ? { hasText: "（你）" } : { hasNotText: "（你）" });
    await expect(row, who).toHaveCount(1);
    await expect(row.getByTestId("admin-user-rx")).toHaveText(String(e.rx));
    await expect(row.getByTestId("admin-user-herbs")).toHaveText(String(e.herbs));
    await expect(row.getByTestId("admin-user-last")).toHaveText(e.last);
  }

  // 常用药材、常见组合：过门槛的才列出来，其余只说几味 / 几对
  const herbs = expectedAdminHerbs(month);
  await expect(ap.getByTestId("admin-herbs-name")).toHaveText(herbs.shown.map((h) => h.name));
  await expect(ap.getByTestId("admin-herbs-count")).toHaveText(herbs.shown.map((h) => String(h.count)));
  await expect(ap.getByTestId("admin-herbs-other")).toContainText(`其他 ${herbs.other} 味`);
  const pairs = expectedAdminPairs(month);
  const pairNames = await ap.getByTestId("admin-pairs-name").allTextContents();
  expect(pairNames.map((t) => t.split(" + ").sort().join("|"))).toEqual(pairs.shown.map((p) => p.name));
  await expect(ap.getByTestId("admin-pairs-count")).toHaveText(pairs.shown.map((p) => String(p.count)));
  await expect(ap.getByTestId("admin-pairs-other")).toContainText(`其他 ${pairs.other} 对`);

  // 页面上没有病人姓名、电话、备注、处方标题、医嘱、诊所名、病人账号的邮箱
  const text = await ap.locator("main").innerText();
  for (const s of [SECRET.name, SECRET.phone, SECRET.notes, SECRET.title, SECRET.instructions, CLINIC, home.email, admin.email]) {
    expect(text, s).not.toContain(s);
  }
  await expect(ap.getByTestId("admin-pairs")).toBeVisible();
  await ap.screenshot({ path: `${SHOTS}/管理员看板-桌面.png`, fullPage: true });

  // 手机 390px：不横向溢出
  await ap.setViewportSize({ width: 390, height: 844 });
  await ap.reload();
  await expect(ap.getByTestId("admin-overview")).toBeVisible();
  const overflow = await ap.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(ap.getByTestId("admin-pairs")).toBeVisible();
  await ap.screenshot({ path: `${SHOTS}/管理员看板-手机.png`, fullPage: true });
  await ap.setViewportSize({ width: 1280, height: 720 });
});

test("管理员：全部时间也能打开；医生和病人账号仍然 404", { tag: ["@PLAT-4"] }, async () => {
  const res = await ap.goto("/admin?month=bad");
  expect(res?.status()).toBe(200);
  await expect(ap.getByTestId("admin-months").getByRole("link", { name: "全部" })).toHaveAttribute("aria-current", "page");
  await expect(ap.getByTestId("admin-trend-day").locator("li[data-bucket]")).toHaveCount(30);
  await expect(ap.getByTestId("admin-trend-week").locator("li[data-bucket]")).toHaveCount(12);
  for (const p of [dp, hp]) expect((await p.goto("/admin"))?.status()).toBe(404);
});
