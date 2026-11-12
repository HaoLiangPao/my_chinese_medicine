/**
 * 平台管理员看板（PLAT-4，docs/design/0015）。
 * 挑一个没有任何处方的月份，用 SQL 灌进 fixtures/scenario.ts 里的 ADMIN_RX（和诊所的配药、一条 Bug 反馈）；
 * 看板上的数字和 fixture 独立算出来的比。账号、药柜、病人档案是全站总数（别的 project 也在建），用数据库的原始行数比。
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import {
  ADMIN_DOCTOR_DECOCTIONS,
  ADMIN_RX,
  adminGramsPerDose,
  adminMonthRange,
  adminRxDate,
  expectedAdminDays,
  expectedAdminHerbs,
  expectedAdminPairs,
  expectedAdminUsers,
  expectedDoctorConsumption,
  maxOf,
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
const BUG = `看板测试反馈 ${RUN}`;
const g = (n: number) => `${n} g`; // fixture 里的克数都在 1000 以下

let dp: Page; // 医生
let hp: Page; // 病人账号
let ap: Page; // 管理员
let month: string; // YYYY-MM
let range: { from: string; to: string };
let q: string; // ?from=…&to=…
const ids = {} as Record<"doctor" | "home" | "admin", string>;

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
  range = adminMonthRange(month);
  q = `?from=${range.from}&to=${range.to}`;

  const ws = { doctor: await workspaceOf(doctor.email), home: await workspaceOf(home.email), admin: await workspaceOf(admin.email) };
  for (const [who, u] of [
    ["doctor", doctor],
    ["home", home],
    ["admin", admin],
  ] as const)
    ids[who] = (await sql<{ id: string }>("select id from auth.users where email = $1", [u.email]))[0].id;
  const patients: string[] = [];
  for (let n = 1; n <= 6; n++) {
    const [{ id }] = await sql<{ id: string }>(
      "insert into patients (workspace_id, name, phone, notes, created_by) values ($1, $2, $3, $4, $5) returning id",
      [ws.doctor, `${SECRET.name}${n}`, `${SECRET.phone}${n}`, SECRET.notes, ids.doctor],
    );
    patients.push(id);
  }
  for (const r of ADMIN_RX) {
    const at = `${adminRxDate(month, r)} ${r.time ?? "12:00"}`;
    const [{ id }] = await sql<{ id: string }>(
      `insert into prescriptions (workspace_id, created_by, patient_id, source, title, instructions, notes, dose_count, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, ($9::timestamp at time zone 'America/Toronto')) returning id`,
      [
        ws[r.who],
        ids[r.who],
        r.patient ? patients[r.patient - 1] : null,
        r.patient ? "clinic" : "manual",
        SECRET.title,
        SECRET.instructions,
        SECRET.notes,
        r.doses ?? 1,
        at,
      ],
    );
    for (const h of r.herbs) {
      await sql(
        `insert into prescription_items (prescription_id, herb_id, grams_per_dose, note) select $1, id, $2, $3 from herbs where name_zh = $4`,
        [id, adminGramsPerDose(h), SECRET.notes, h],
      );
      // 诊所：按处方量配药、扣库存
      if (r.who === "doctor")
        await sql(
          `insert into inventory_txns (workspace_id, herb_id, delta_grams, kind, prescription_id, occurred_at)
           select $1, id, $2, 'consume', $3, ($4::timestamp at time zone 'America/Toronto') from herbs where name_zh = $5`,
          [ws.doctor, -adminGramsPerDose(h) * (r.doses ?? 1), id, at, h],
        );
    }
  }
  for (let i = 0; i < ADMIN_DOCTOR_DECOCTIONS; i++)
    await sql(`insert into decoctions (workspace_id, doses, decocted_at) values ($1, 1, ($2::timestamp at time zone 'America/Toronto'))`, [
      ws.doctor,
      `${month}-12 12:00`,
    ]);
  await sql("insert into bug_reports (reporter_id, workspace_id, page_path, description) values ($1, $2, '/prescriptions/new', $3)", [
    ids.home,
    ws.home,
    BUG,
  ]);
});
test.afterAll(async () => {
  await dp.close();
  await hp.close();
  await ap.close();
});

test("不是管理员：看板 404，直接调统计函数也拿不到", { tag: ["@PLAT-4"] }, async () => {
  const urls = [
    "/admin",
    `/admin${q}`,
    "/admin/bugs",
    "/admin/doctors",
    `/admin/doctors/${ids.doctor}`,
    "/admin/patients",
    `/admin/patients/${ids.home}`,
  ];
  for (const p of [dp, hp, ap]) {
    for (const url of urls) {
      const res = await p.goto(url);
      expect(res?.status(), url).toBe(404);
      await expect(p.getByText("找不到这个页面")).toBeVisible();
    }
  }
  // 绕过页面，用病人账号的登录直接调数据库的函数
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  expect((await c.auth.signInWithPassword(home)).error).toBeNull();
  const calls: [string, Record<string, unknown>][] = [
    ["admin_overview", { p_from: range.from }],
    ["admin_user_activity", {}],
    ["admin_top_herbs", { p_from: range.from, p_to: range.to }],
    ["admin_top_pairs", {}],
    ["admin_doctors", {}],
    ["admin_doctor_consumption", { p_user: ids.doctor }],
    ["admin_patient_accounts", {}],
    ["admin_bug_reports", {}],
  ];
  for (const [fn, args] of calls) {
    const { data, error } = await c.rpc(fn, args);
    expect(error?.message, fn).toContain("没有权限");
    expect(data, fn).toBeNull();
  }
  const [bug] = await sql<{ id: string }>("select id from bug_reports where description = $1", [BUG]);
  expect((await c.rpc("admin_set_bug_status", { p_id: bug.id, p_status: "fixed" })).error?.message).toContain("没有权限");
  expect((await sql<{ status: string }>("select status from bug_reports where id = $1", [bug.id]))[0].status).toBe("new");
  const { error } = await c.from("platform_admins").insert({ user_id: ids.home });
  expect(error, "不能把自己加成管理员").not.toBeNull();
});

test(
  "管理员总览：自己的导航；这个月的数字、趋势（有纵轴）、账号、药材和组合和独立算的一致；没有病人信息",
  { tag: ["@PLAT-4"] },
  async () => {
    await sql("insert into platform_admins (user_id, note) select id, 'E2E' from auth.users where email = $1", [admin.email]);
    const res = await ap.goto(`/admin${q}`);
    expect(res?.status()).toBe(200);
    // 看板不用 App 的导航，换成自己的 tab
    await expect(ap.getByTestId("admin-tabs").getByRole("link")).toHaveText(["总览", "Bugs", "医生", "病人"]);
    await expect(ap.getByTestId("nav")).toBeHidden();
    await expect(ap.getByTestId("admin-range-label")).toHaveText(`${range.from} 至 ${range.to}`);

    // 概况
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

    // 趋势：一个月按天；每一根柱子；纵轴最大刻度不小于最高的柱子
    const trend = ap.getByTestId("admin-trend");
    await expect(trend).toHaveAttribute("data-bucket-kind", "day");
    const bars = trend.locator("li[data-bucket]");
    await expect(bars).toHaveCount(days.size);
    const got = await bars.evaluateAll((els) => els.map((e) => [e.getAttribute("data-bucket"), Number(e.getAttribute("data-count"))]));
    expect(new Map(got as [string, number][])).toEqual(days);
    const ticks = await trend
      .getByTestId("admin-trend-yaxis")
      .locator("[data-tick]")
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-tick"))));
    expect(ticks[0]).toBe(0);
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(maxOf(days));

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

    // 常用药材：默认按用量排、Top 10；过门槛的才列出来，其余只说几味
    const herbs = expectedAdminHerbs(month, "grams");
    await expect(ap.getByTestId("admin-herbs-name")).toHaveText(herbs.shown.map((h) => h.name));
    await expect(ap.getByTestId("admin-herbs-value")).toHaveText(herbs.shown.map((h) => g(h.grams)));
    await expect(ap.getByTestId("admin-herbs-note")).toHaveText(herbs.shown.map((h) => `${h.count} 张`));
    await expect(ap.getByTestId("admin-herbs-other")).toContainText(`其他 ${herbs.other} 味`);
    await expect(ap.getByTestId("admin-herbs").getByRole("link", { name: "Top 10" })).toHaveAttribute("aria-current", "true");
    const pairs = expectedAdminPairs(month);
    const pairNames = await ap.getByTestId("admin-pairs-name").allTextContents();
    expect(pairNames.map((t) => t.split(" + ").sort().join("|"))).toEqual(pairs.shown.map((p) => p.name));
    await expect(ap.getByTestId("admin-pairs-value")).toHaveText(pairs.shown.map((p) => `${p.count} 张`));
    await expect(ap.getByTestId("admin-pairs-other")).toContainText(`其他 ${pairs.other} 对`);

    // 页面上没有病人姓名、电话、备注、处方标题、医嘱、诊所名、病人账号的邮箱
    const text = await ap.locator("main").innerText();
    for (const s of [SECRET.name, SECRET.phone, SECRET.notes, SECRET.title, SECRET.instructions, CLINIC, home.email, admin.email]) {
      expect(text, s).not.toContain(s);
    }
    await expect(ap.getByTestId("admin-pairs")).toBeVisible();
    await ap.screenshot({ path: `${SHOTS}/管理员看板-总览.png`, fullPage: true });

    // 手机 390px：不横向溢出
    await ap.setViewportSize({ width: 390, height: 844 });
    await ap.reload();
    await expect(ap.getByTestId("admin-pairs")).toBeVisible();
    const overflow = await ap.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await ap.screenshot({ path: `${SHOTS}/管理员看板-总览-手机.png`, fullPage: true });
    await ap.setViewportSize({ width: 1280, height: 720 });
  },
);

test("时间段、Top N、排序：都写进地址栏，切换时互相保留", { tag: ["@PLAT-4"] }, async () => {
  await ap.goto("/admin");
  await expect(ap.getByTestId("admin-range").getByRole("link", { name: "全部" })).toHaveAttribute("aria-current", "page");
  await expect(ap.getByTestId("admin-range-label")).toHaveText("全部时间");
  // 任意起止日期：这个月的 3 日到 10 日
  await ap.getByLabel("从").fill(`${month}-03`);
  await ap.getByLabel("到").fill(`${month}-10`);
  await ap.getByRole("button", { name: "查看" }).click();
  await expect(ap).toHaveURL(new RegExp(`from=${month}-03&to=${month}-10`));
  const week = [...expectedAdminDays(month)].filter(([d]) => d >= `${month}-03` && d <= `${month}-10`);
  await expect(ap.getByTestId("admin-prescriptions-value")).toHaveText(String(week.reduce((s, [, n]) => s + n, 0)));
  await expect(ap.getByTestId("admin-trend").locator("li[data-bucket]")).toHaveCount(week.length);

  // 按张数排、Top 20：时间段不丢
  await ap.goto(`/admin${q}`);
  await ap.getByTestId("admin-herbs-sort").getByRole("link", { name: "按张数" }).click();
  await expect(ap).toHaveURL(new RegExp(`from=${range.from}.*sort=rx`));
  const byRx = expectedAdminHerbs(month, "rx");
  await expect(ap.getByTestId("admin-herbs-name")).toHaveText(byRx.shown.map((h) => h.name));
  await expect(ap.getByTestId("admin-herbs-value")).toHaveText(byRx.shown.map((h) => `${h.count} 张`));
  await ap.getByTestId("admin-herbs").getByRole("link", { name: "Top 20" }).click();
  await expect(ap).toHaveURL(new RegExp(`from=${range.from}.*top=20`));
  await expect(ap).toHaveURL(/sort=rx/);
  await expect(ap.getByTestId("admin-herbs").getByRole("link", { name: "Top 20" })).toHaveAttribute("aria-current", "true");
  // 切到「医生」tab：时间段跟着走
  await ap.getByTestId("admin-tabs").getByRole("link", { name: "医生" }).click();
  await expect(ap).toHaveURL(new RegExp(`/admin/doctors\\?from=${range.from}&to=${range.to}`));
});

test("医生详情：从总览点进去；病人只有数量；库存消耗过门槛", { tag: ["@PLAT-4"] }, async () => {
  await ap.goto(`/admin${q}`);
  await ap.getByTestId("admin-user").filter({ hasText: doctor.email }).getByRole("link").click();
  await expect(ap).toHaveURL(new RegExp(`/admin/doctors/${ids.doctor}\\?from=${range.from}&to=${range.to}`));
  await expect(ap.getByTestId("admin-doctor-name")).toContainText(doctor.email);
  const e = expectedAdminUsers(month).get("doctor")!;
  const used = expectedDoctorConsumption(month);
  await expect(ap.getByTestId("admin-doc-patients-value")).toHaveText("6");
  await expect(ap.getByTestId("admin-doc-patients-sub")).toHaveText(`这段时间新建 0 · 看过 ${e.patients}`); // 病人档案是今天建的
  await expect(ap.getByTestId("admin-doc-rx-value")).toHaveText(String(e.rx));
  await expect(ap.getByTestId("admin-doc-decoctions-value")).toHaveText(String(ADMIN_DOCTOR_DECOCTIONS));
  await expect(ap.getByTestId("admin-doc-consumed-value")).toHaveText(g(used.total));
  const bars = await ap
    .getByTestId("admin-trend")
    .locator("li[data-bucket]")
    .evaluateAll((els) => els.map((x) => [x.getAttribute("data-bucket"), Number(x.getAttribute("data-count"))]));
  expect(new Map(bars as [string, number][])).toEqual(expectedAdminDays(month, "doctor"));
  await expect(ap.getByTestId("admin-consumption-name")).toHaveText(used.shown.map((h) => h.name));
  await expect(ap.getByTestId("admin-consumption-value")).toHaveText(used.shown.map((h) => g(h.grams)));
  await expect(ap.getByTestId("admin-consumption-other")).toContainText(`其他 ${used.other} 味`);
  const text = await ap.locator("main").innerText();
  for (const s of [SECRET.name, SECRET.phone, SECRET.notes, CLINIC]) expect(text, s).not.toContain(s);
  await ap.screenshot({ path: `${SHOTS}/管理员看板-医生.png`, fullPage: true });
  // 医生列表也能点进来
  await ap.goto(`/admin/doctors${q}`);
  await expect(ap.getByTestId("admin-doctor").filter({ hasText: doctor.email })).toContainText(`这段时间处方 ${e.rx} 张`);
});

test("病人账号详情：只有数字，没有邮箱和药名", { tag: ["@PLAT-4"] }, async () => {
  await ap.goto(`/admin${q}`);
  await ap.getByTestId("admin-user").filter({ hasText: "（你）" }).getByRole("link").click();
  await expect(ap).toHaveURL(new RegExp(`/admin/patients/${ids.admin}\\?`));
  const e = expectedAdminUsers(month).get("admin")!;
  await expect(ap.getByTestId("admin-patient-name")).toContainText(/病人 #\d+/);
  await expect(ap.getByTestId("admin-pa-rx-value")).toHaveText(String(e.rx));
  await expect(ap.getByTestId("admin-pa-herbs-value")).toHaveText(String(e.herbs));
  await expect(ap.getByTestId("admin-pa-days-value")).toHaveText(String(e.days));
  const text = await ap.locator("main").innerText();
  for (const s of [admin.email, ...new Set(ADMIN_RX.flatMap((r) => r.herbs))]) expect(text, s).not.toContain(s);

  // 病人列表：另一个病人账号也在，数字一致，没有邮箱
  await ap.goto(`/admin/patients${q}`);
  const h = expectedAdminUsers(month).get("home")!;
  await expect(ap.getByTestId("admin-patient").filter({ hasText: `这段时间处方 ${h.rx} 张 · 药材 ${h.herbs} 种` })).toHaveCount(1);
  expect(await ap.locator("main").innerText()).not.toContain(home.email);
  await ap.screenshot({ path: `${SHOTS}/管理员看板-病人.png`, fullPage: true });
});

test("Bugs：看到反馈，改状态", { tag: ["@PLAT-4"] }, async () => {
  await ap.goto("/admin/bugs");
  const card = ap.getByTestId("admin-bug").filter({ hasText: BUG });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("admin-bug-status")).toHaveText("新");
  await expect(card.getByTestId("admin-bug-path")).toHaveText("/prescriptions/new");
  await expect(card).toContainText(/提交人：病人 #\d+/);
  expect(await card.innerText()).not.toContain(home.email);
  await ap.screenshot({ path: `${SHOTS}/管理员看板-Bugs.png`, fullPage: true });
  await card.getByLabel("状态").selectOption("fixed");
  await card.getByRole("button", { name: "保存" }).click();
  await expect(card.getByTestId("admin-bug-status")).toHaveText("已修");
  expect((await sql<{ status: string }>("select status from bug_reports where description = $1", [BUG]))[0].status).toBe("fixed");
  await ap.getByTestId("admin-bug-filter").getByRole("link", { name: /^已修/ }).click();
  await expect(ap.getByTestId("admin-bug").filter({ hasText: BUG })).toHaveCount(1);
  await ap.getByTestId("admin-bug-filter").getByRole("link", { name: /^新/ }).click();
  await expect(ap.getByTestId("admin-bug").filter({ hasText: BUG })).toHaveCount(0);
});

test("医生和病人账号仍然 404", { tag: ["@PLAT-4"] }, async () => {
  for (const p of [dp, hp]) for (const url of ["/admin", "/admin/bugs"]) expect((await p.goto(url))?.status(), url).toBe(404);
});
