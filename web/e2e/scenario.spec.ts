/**
 * 完整场景 E2E：全程通过浏览器操作 App，最后和独立计算的账本对账。
 *   1. Hao 注册；Tina 注册后被拉进同一个药柜
 *   2. 通过表单录入 10 张药方（含别名、重复行、新药材、小数克数、脚注）
 *   3. 第一次盘点：家里原本就有的药材
 *   4. 5 家药行采购（价格不同、数量不同、同单重复行、赠品）
 *   5. 9 次煎药：按处方 / 多用 / 没放 / 处方外加药 / 缺货变负 / 两次煎同一方 / 撤销
 *   6. 称重校准、删除药方
 *   7. 对账：数据库 + 药柜页面 + 药材统计 + 家人视角 + 陌生人隔离
 */
import { expect, test, type Page } from "@playwright/test";
import {
  CALIBRATION,
  DECOCTIONS,
  DELETED_FORMULA,
  FORMULAS,
  INITIAL_STOCK,
  PURCHASES,
  expectedStock,
  expectedUsage,
} from "./fixtures/scenario";
import { ensureRows, parseGrams, signIn, signUp, sql, users, workspaceOf } from "./helpers";

test.describe.configure({ mode: "serial" });

let page: Page;
const rxIds = new Map<string, string>();

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("dialog", (d) => d.accept()); // 删除/撤销的确认框
});
test.afterAll(async () => page.close());

test("1. 注册账号，自动创建药柜；家人注册后被拉进同一个药柜", async ({ browser }) => {
  await signUp(page, users.hao);
  await expect(page.getByText("还没有药方，先录第一张吧。")).toBeVisible();

  const tinaPage = await browser.newPage();
  await signUp(tinaPage, users.tina);
  const tinaOwnWs = await workspaceOf(users.tina.email);
  await tinaPage.close();

  await page.getByPlaceholder("家人的注册邮箱").fill(users.tina.email.toUpperCase()); // 大小写不敏感
  await page.getByRole("button", { name: "添加" }).click();
  await expect(page.getByText("共 2 人共享这个药柜")).toBeVisible();

  const hws = await workspaceOf(users.hao.email);
  expect(await workspaceOf(users.tina.email)).toBe(hws);
  // Tina 自动生成的空药柜被清理
  expect(await sql("select 1 from workspaces where id = $1", [tinaOwnWs])).toHaveLength(0);
});

test("2. 录入 10 张药方", async () => {
  for (const f of FORMULAS) {
    await page.goto("/prescriptions/new");
    await expect(page.getByRole("button", { name: "保存药方" })).toBeDisabled(); // 没填药不能保存
    await page.locator('input[name="title"]').fill(f.name);
    await page.locator('input[name="issued_on"]').fill("2026-10-01");
    await page.locator('input[name="dose_count"]').fill(String(f.doses));
    if (f.patient) await page.locator('input[name="patient_label"]').fill(f.patient);

    const lines = [...f.items, ...(f.extraLines ?? [])];
    const names = await ensureRows(page, "药名", "＋ 加一味", lines.length);
    for (const [i, l] of lines.entries()) {
      await names.nth(i).fill(l.entry ?? l.herb);
      await page.getByLabel("每副克数").nth(i).fill(String(l.grams));
      if (l.prep) await page.getByLabel("脚注").nth(i).selectOption(l.prep);
    }
    // 目录里没有的药名标红
    if (f.name === "逍遥散") await expect(names.nth(7)).toHaveClass(/border-cinnabar/);

    await page.getByRole("button", { name: "保存药方" }).click();
    await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}$/);
    rxIds.set(f.name, page.url().split("/").pop()!);
    await expect(page.getByRole("heading", { name: f.name })).toBeVisible();
  }

  await page.goto("/prescriptions");
  for (const f of FORMULAS) await expect(page.getByText(f.name, { exact: true })).toBeVisible();

  // 别名 → 标准名，原文保留
  const alias = await sql<{ raw_name: string; name_zh: string }>(
    `select i.raw_name, h.name_zh from prescription_items i join herbs h on h.id = i.herb_id
     where i.prescription_id = $1 and i.raw_name = '北芪'`,
    [rxIds.get("补中益气汤")],
  );
  expect(alias).toEqual([{ raw_name: "北芪", name_zh: "黄芪" }]);
  // 同一张方子里当归录了两行 → 合并成 10g
  const [dg] = await sql<{ g: string }>(
    `select grams_per_dose::text g from prescription_items i join herbs h on h.id = i.herb_id
     where i.prescription_id = $1 and h.name_zh = '当归'`,
    [rxIds.get("八珍汤")],
  );
  expect(Number(dg.g)).toBe(10);
  // 新药材被自动加入目录
  expect(await sql("select 1 from herbs where name_zh in ('茯神', '煨姜')")).toHaveLength(2);
  // 脚注
  const preps = await sql<{ name_zh: string; special_prep: string }>(
    `select h.name_zh, i.special_prep from prescription_items i join herbs h on h.id = i.herb_id
     where i.special_prep is not null and i.prescription_id = any($1::uuid[]) order by 1`,
    [[...rxIds.values()]],
  );
  expect(preps).toEqual([
    { name_zh: "木香", special_prep: "后下" },
    { name_zh: "薄荷", special_prep: "后下" },
  ]);

  // 详情页：别名显示原文、小数克数
  await page.goto(`/prescriptions/${rxIds.get("补中益气汤")}`);
  await expect(page.getByText("（原文 北芪）")).toBeVisible();
  await page.goto(`/prescriptions/${rxIds.get("逍遥散")}`);
  await expect(page.getByRole("cell", { name: "4.5 g" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "31.5 g" })).toBeVisible(); // 4.5 × 7
});

test("3. 第一次盘点：家里原本就有的药材", async () => {
  await page.goto("/inventory");
  await expect(page.getByText("药柜还是空的")).toBeVisible();
  for (const s of INITIAL_STOCK) {
    await page.locator('input[name="herb_name"]').fill(s.herb);
    await page.locator('input[name="actual"]').last().fill(String(s.grams));
    await page.getByRole("button", { name: "录入" }).click();
    await expect(page.getByTestId(`stock-${s.herb}`)).toHaveText(`${s.grams} g`);
  }
  const rows = await sql<{ kind: string }>("select kind from inventory_txns where workspace_id = $1", [
    await workspaceOf(users.hao.email),
  ]);
  expect(rows.map((r) => r.kind)).toEqual(["adjust", "adjust"]); // 不算采购
});

test("4. 五家药行采购", async () => {
  for (const p of PURCHASES) {
    await page.goto("/purchases/new");
    await page.locator('input[name="store_name"]').fill(p.shop.name);
    await page.locator('input[name="purchased_on"]').fill(p.date);
    const names = await ensureRows(page, "药名", "＋ 加一行", p.lines.length);
    for (const [i, l] of p.lines.entries()) {
      await names.nth(i).fill(l.herb);
      await page.getByLabel("克数", { exact: true }).nth(i).fill(String(l.grams));
      await page.getByLabel("总价", { exact: true }).nth(i).fill(String(l.price));
    }
    const total = p.lines.reduce((s, l) => s + (l.price ?? 0), 0);
    await expect(page.getByText(`合计 $${total.toFixed(2)}`)).toBeVisible();
    await page.getByRole("button", { name: "保存" }).click();
    await page.waitForURL(/\/purchases(\?.*)?$/);
  }

  const ws = await workspaceOf(users.hao.email);
  const stores = await sql<{ name: string }>("select name from stores where workspace_id = $1 order by name", [ws]);
  expect(stores).toHaveLength(5);
  // 同一张单子茯苓两行 → 一行 500g
  const [fl] = await sql<{ grams: string }>(
    `select pi.grams::text from purchase_items pi join purchases pu on pu.id = pi.purchase_id
     join stores s on s.id = pu.store_id join herbs h on h.id = pi.herb_id
     where s.name = '百草园（测试）' and h.name_zh = '茯苓'`,
  );
  expect(Number(fl.grams)).toBe(500);
  // 黄芪三家都有记录，单价各不相同
  const hq = await sql<{ store_name: string; price_per_gram: string }>(
    "select store_name, price_per_gram::text from v_purchase_prices where workspace_id = $1 and name_zh = '黄芪'",
    [ws],
  );
  expect(new Set(hq.map((r) => r.store_name)).size).toBe(3);
  expect(new Set(hq.map((r) => r.price_per_gram)).size).toBe(3);
  // 赠品 0 元
  const [dz] = await sql<{ price_per_gram: string }>(
    "select price_per_gram::text from v_purchase_prices where workspace_id = $1 and name_zh = '大枣'",
    [ws],
  );
  expect(Number(dz.price_per_gram)).toBe(0);

  // 采购后、煎药前：药柜 = 盘点 + 采购
  await page.goto("/inventory");
  await expect(page.getByTestId("stock-黄芪")).toHaveText("1750 g");
  await expect(page.getByTestId("stock-茯苓")).toHaveText("1000 g");
  await expect(page.getByTestId("stock-麦冬")).toHaveText("370 g");
});

async function decoct(d: (typeof DECOCTIONS)[number]) {
  await page.goto(`/prescriptions/${rxIds.get(d.formula)}`);
  const entries = page.getByTestId("decoction-entry");
  const before = await entries.count();
  await page.locator("#doses").fill(String(d.doses));
  for (const [herb, g] of Object.entries(d.actual ?? {})) await page.getByLabel(`${herb} 实际用量`).fill(String(g));
  for (const [i, e] of (d.extras ?? []).entries()) {
    await page.getByRole("button", { name: "＋ 加一味处方外的药" }).click();
    await page.getByLabel("加的药", { exact: true }).nth(i).fill(e.herb);
    await page.getByLabel("加的药克数").nth(i).fill(String(e.grams));
  }
  await page.getByRole("button", { name: `煎 ${d.doses} 副，扣库存` }).click();
  await expect(entries).toHaveCount(before + 1);
  if (d.undo) {
    await entries.first().getByRole("button", { name: "撤销" }).click();
    await expect(entries).toHaveCount(before);
  }
}

async function decoctInPlace(doses: number) {
  const entries = page.getByTestId("decoction-entry");
  const before = await entries.count();
  await page.locator("#doses").fill(String(doses));
  await page.getByRole("button", { name: `煎 ${doses} 副，扣库存` }).click();
  await expect(entries).toHaveCount(before + 1);
}

test("5. 煎药（含各种边界情况）", async () => {
  for (const d of DECOCTIONS) await test.step(`${d.formula} ${d.doses} 副：${d.label}`, () => decoct(d));

  const ws = await workspaceOf(users.hao.email);
  const variance = await sql<{ name_zh: string; status: string; diff: string; formula: string }>(
    `select v.name_zh, v.status, v.diff_grams::text diff, p.title formula
     from v_decoction_variance v join prescriptions p on p.id = v.prescription_id
     where v.workspace_id = $1 and v.status <> 'exact' order by 4, 1`,
    [ws],
  );
  expect(variance).toEqual([
    { formula: "六味地黄汤", name_zh: "牡丹皮", status: "omitted", diff: "-63.00" },
    { formula: "小柴胡汤", name_zh: "生姜", status: "over", diff: "6.00" },
    { formula: "小柴胡汤", name_zh: "陈皮", status: "extra", diff: "6.00" },
    { formula: "补中益气汤", name_zh: "黄芪", status: "over", diff: "5.00" },
    { formula: "酸枣仁汤", name_zh: "川芎", status: "under", diff: "-4.00" },
  ]);
  // 撤销的那次不留痕迹
  expect(
    await sql("select 1 from decoctions where prescription_id = $1", [rxIds.get("八珍汤")]),
  ).toHaveLength(0);

  // 回归测试：通过导航链接（客户端跳转，不刷新页面）看到的库存也必须是最新的
  await page.goto("/inventory");
  const hqBefore = parseGrams(await page.getByTestId("stock-黄芪").textContent());
  await page.locator(`nav a[href="/prescriptions"]`).click();
  await page.getByText("玉屏风散", { exact: true }).click();
  await decoctInPlace(1);
  await page.locator(`nav a[href="/inventory"]`).click();
  await expect(page.getByTestId("stock-黄芪")).toHaveText(`${hqBefore - 12} g`);
  await page.locator(`nav a[href="/prescriptions"]`).click();
  await page.getByText("玉屏风散", { exact: true }).click();
  await page.getByTestId("decoction-entry").first().getByRole("button", { name: "撤销" }).click();
  await page.locator(`nav a[href="/inventory"]`).click();
  await expect(page.getByTestId("stock-黄芪")).toHaveText(`${hqBefore} g`);

  // 详情页：煎药记录显示差异；酸枣仁汤煎过两次
  await page.goto(`/prescriptions/${rxIds.get("酸枣仁汤")}`);
  await expect(page.getByTestId("decoction-entry")).toHaveCount(2);
  await expect(page.getByText("川芎 少用 24→20g")).toBeVisible();
  await page.goto(`/prescriptions/${rxIds.get("小柴胡汤")}`);
  await expect(page.getByText("陈皮 加了 6g")).toBeVisible();
  await expect(page.getByText("生姜 多用 45→51g")).toBeVisible();
});

test("6. 非法输入被拦下", async () => {
  await page.goto(`/prescriptions/${rxIds.get("四君子汤")}`);
  const entries = page.getByTestId("decoction-entry");
  const before = await entries.count();
  // 0 副：按钮不可点
  await page.locator("#doses").fill("0");
  await expect(page.getByRole("button", { name: /煎 0 副/ })).toBeDisabled();
  // 绕过浏览器校验提交 1.5 副 → 服务器拒绝
  await page.locator("#doses").evaluate((el: HTMLInputElement) => el.setAttribute("step", "any"));
  await page.locator("#doses").fill("1.5");
  await page.getByRole("button", { name: /煎 1.5 副/ }).click();
  await expect(page.getByText("副数必须是正整数")).toBeVisible();
  // 负数实际用量 → 服务器拒绝
  await page.locator("#doses").fill("1");
  const ginseng = page.getByLabel("人参 实际用量");
  await ginseng.evaluate((el: HTMLInputElement) => el.removeAttribute("min"));
  await ginseng.fill("-5");
  await page.getByRole("button", { name: "煎 1 副，扣库存" }).click();
  await expect(page.getByText("这些药的克数不对：人参")).toBeVisible();
  await expect(entries).toHaveCount(before);
});

test("7. 称重校准、删除药方", async () => {
  const before = expectedStock({ includeCalibration: false }).get(CALIBRATION.herb)!;
  await page.goto("/inventory");
  const card = page.getByTestId(`stock-card-${CALIBRATION.herb}`);
  await expect(card.getByTestId(`stock-${CALIBRATION.herb}`)).toHaveText(`${before} g`);
  await card.locator("summary").click();
  await card.getByLabel(`${CALIBRATION.herb} 称重克数`).fill(String(before + CALIBRATION.diff));
  await card.getByRole("button", { name: "校准" }).click();
  await expect(card.getByTestId(`stock-${CALIBRATION.herb}`)).toHaveText(`${before + CALIBRATION.diff} g`);

  // 删除生脉散：煎药记录保留，库存不回滚
  const stockBefore = await sql<{ g: string }>(
    "select on_hand_grams::text g from v_inventory where workspace_id = $1 and name_zh = '麦冬'",
    [await workspaceOf(users.hao.email)],
  );
  await page.goto(`/prescriptions/${rxIds.get(DELETED_FORMULA)}`);
  await page.getByRole("button", { name: "删除这张药方" }).click();
  await page.waitForURL(/\/prescriptions(\?.*)?$/);
  // 回归测试：跳回列表时不能显示已删除的药方（Cache Components 开启时会出现）
  await expect(page.getByText(DELETED_FORMULA, { exact: true })).toHaveCount(0);
  const stockAfter = await sql<{ g: string }>(
    "select on_hand_grams::text g from v_inventory where workspace_id = $1 and name_zh = '麦冬'",
    [await workspaceOf(users.hao.email)],
  );
  expect(stockAfter).toEqual(stockBefore);
  expect(
    await sql("select 1 from decoctions where workspace_id = $1 and prescription_id is null", [
      await workspaceOf(users.hao.email),
    ]),
  ).toHaveLength(1);
});

test("8. 对账：数据库库存 = 独立账本", async () => {
  const expected = expectedStock({ includeCalibration: true });
  const rows = await sql<{ name_zh: string; g: string }>(
    "select name_zh, on_hand_grams::text g from v_inventory where workspace_id = $1",
    [await workspaceOf(users.hao.email)],
  );
  const actual = new Map(rows.map((r) => [r.name_zh, Number(r.g)]));
  expect(Object.fromEntries([...actual].sort())).toEqual(Object.fromEntries([...expected].sort()));

  // 几个关键边界的具体数值
  expect(expected.get("人参")).toBeLessThan(0); // 贵的药只买了 50g
  expect(expected.get("防风")).toBe(-42); // 从没买过
  expect(expected.get("升麻")).toBe(-18);
  expect(expected.get("牡丹皮")).toBe(100); // 煎六味地黄汤时没放
  expect(expected.get("枸杞子")).toBe(200); // 只盘点、没用过
});

test("9. 对账：药柜页面显示的每一味药", async () => {
  const expected = expectedStock({ includeCalibration: true });
  await page.goto("/inventory");
  const cards = page.locator('[data-testid^="stock-card-"]');
  await expect(cards).toHaveCount(expected.size);
  for (const [herb, g] of expected) {
    expect(parseGrams(await page.getByTestId(`stock-${herb}`).textContent()), herb).toBeCloseTo(g, 2);
  }
  // 负库存标红、首页「该补货了」
  await expect(page.getByTestId("stock-防风")).toHaveClass(/text-cinnabar/);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /防风 -42 g/ })).toBeVisible();
});

test("10. 对账：药材使用统计", async () => {
  const expected = expectedUsage();
  const rows = await sql<{ name_zh: string; c: number; t: string }>(
    "select name_zh, prescription_count::int c, total_grams::text t from v_herb_usage where workspace_id = $1",
    [await workspaceOf(users.hao.email)],
  );
  const actual = Object.fromEntries(rows.map((r) => [r.name_zh, { count: r.c, total: Number(r.t) }]));
  expect(actual).toEqual(Object.fromEntries(expected));

  await page.goto("/herbs");
  const row = page.getByRole("row", { name: /^白术/ });
  const bz = expected.get("白术")!;
  await expect(row.getByRole("cell").nth(1)).toHaveText(String(bz.count));
  await expect(row.getByRole("cell").nth(3)).toHaveText(`${bz.total} g`);

  // 药材详情：出现在哪些方子
  await row.getByRole("link", { name: "白术" }).click();
  await expect(page.getByRole("heading", { name: "白术" })).toBeVisible();
  for (const f of FORMULAS.filter((x) => x.name !== DELETED_FORMULA && x.items.some((i) => i.herb === "白术"))) {
    await expect(page.getByRole("link", { name: f.name })).toBeVisible();
  }
  await expect(page.getByText("仁和堂（测试）")).toBeVisible(); // 购买记录
});

test("11. 家人看到同一个药柜；陌生人什么都看不到", async ({ browser }) => {
  const expected = expectedStock({ includeCalibration: true });

  const tina = await browser.newPage();
  await signIn(tina, users.tina);
  await tina.goto("/prescriptions");
  await expect(tina.getByText("归脾汤", { exact: true })).toBeVisible();
  await tina.goto("/inventory");
  await expect(tina.getByTestId("stock-黄芪")).toHaveText(`${expected.get("黄芪")} g`);
  await tina.close();

  const stranger = await browser.newPage();
  await signUp(stranger, users.stranger);
  await stranger.goto("/prescriptions");
  await expect(stranger.getByText("还没有药方")).toBeVisible();
  await stranger.goto("/inventory");
  await expect(stranger.getByText("药柜还是空的")).toBeVisible();
  // 直接访问别人的药方 → 找不到
  await stranger.goto(`/prescriptions/${rxIds.get("四君子汤")}`);
  await expect(stranger.getByText("找不到这个页面")).toBeVisible();
  await expect(stranger.getByText("四君子汤")).toHaveCount(0);
  await stranger.close();
});
