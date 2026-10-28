/**
 * MVP2 E2E：在 scenario 跑完的数据上验证比价、每副成本、各店对比、诊所对比、药柜价值。
 * 所有期望值都由 fixtures/scenario.ts 独立计算，不读 App 的计算结果。
 */
import { expect, test, type Page } from "@playwright/test";
import { FORMULAS, PURCHASES, SHOPS, expectedPrices, expectedStock } from "./fixtures/scenario";
import { signIn, sql, users } from "./helpers";

test.describe.configure({ mode: "serial" });

// 和数据库一致的舍入：单价保留 6 位，每 100g/每副按分取整
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r2 = (n: number) => Math.round(n * 100) / 100;
const $ = (n: number) => `$${n.toFixed(2)}`;

const prices = expectedPrices();
/** 每味药：各店现价（不含赠品） */
function offers(herb: string) {
  return (prices.get(herb) ?? []).filter((o) => o.perGram > 0).map((o) => ({ ...o, perGram: r6(o.perGram) }));
}
function cheapestOffer(herb: string) {
  return offers(herb).sort((a, b) => a.perGram - b.perGram || a.shop.localeCompare(b.shop))[0];
}
function avgCost(herb: string) {
  let g = 0, p = 0;
  for (const pu of PURCHASES) for (const l of pu.lines) if (l.herb === herb) { g += l.grams; p += l.price ?? 0; }
  return g && p > 0 ? r6(p / g) : null; // 只有赠品 → 没有成本
}
function rxCost(name: string, pick: (herb: string) => number | null) {
  const f = FORMULAS.find((x) => x.name === name)!;
  let perDose = 0;
  const missing: string[] = [];
  for (const i of f.items) {
    const ppg = pick(i.herb);
    if (ppg === null || ppg === undefined) missing.push(i.herb);
    else perDose += r4(i.grams * ppg);
  }
  return { perDose: r2(perDose), exact: perDose, total: r2(perDose * f.doses), missing, doses: f.doses }; // 不取整的每副 × 副数，最后才取整
}

let page: Page;
const rxId = async (title: string) =>
  (
    await sql<{ id: string }>(
      `select p.id from prescriptions p join workspace_members m on m.workspace_id = p.workspace_id
       join auth.users u on u.id = m.user_id where u.email = $1 and p.title = $2`,
      [users.hao.email, title],
    )
  )[0].id;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signIn(page, users.hao);
});
test.afterAll(async () => page.close());

test("比价页：每味药各店现价、最便宜的高亮、价差、赠品不参与", async () => {
  await page.locator(`nav a[href="/prices"]`).click();
  await expect(page.getByRole("heading", { name: "比价" })).toBeVisible();

  for (const herb of ["黄芪", "白术", "茯苓", "炙甘草", "当归"]) {
    const os = offers(herb);
    const best = cheapestOffer(herb);
    for (const o of os) {
      const cell = page.getByTestId(`price-${herb}-${o.shop}`);
      await expect(cell, `${herb}@${o.shop}`).toHaveText($(r2(o.perGram * 100)));
      if (o.shop === best.shop) await expect(cell).toHaveClass(/text-jade/);
      else await expect(cell).not.toHaveClass(/text-jade/);
    }
    const min = Math.min(...os.map((o) => o.perGram));
    const max = Math.max(...os.map((o) => o.perGram));
    await expect(page.getByTestId(`spread-${herb}`)).toHaveText(os.length > 1 ? `${Math.round(((max - min) / min) * 1000) / 10}%` : "—");
  }
  // 黄芪三家都有价
  expect(offers("黄芪")).toHaveLength(3);
  // 大枣只有赠品 → 不出现在比价表
  await expect(page.getByTestId("price-row-大枣")).toHaveCount(0);
  // 没在那家买过 → —
  await expect(page.getByTestId(`price-人参-${SHOPS[0].name}`)).toHaveText("—");

  // 「最便宜次数」
  const wins = new Map<string, number>();
  for (const herb of prices.keys()) {
    const b = cheapestOffer(herb);
    if (b) wins.set(b.shop, (wins.get(b.shop) ?? 0) + 1);
  }
  for (const s of SHOPS) await expect(page.getByTestId(`wins-${s.name}`)).toContainText(`${wins.get(s.name) ?? 0} 味`);

  // 只看药方里用过的：枸杞子没用过也没买过；生姜用过
  await page.getByRole("link", { name: "只看药方里用过的" }).click();
  await expect(page).toHaveURL(/used=1/);
  await expect(page.getByTestId("price-row-生姜")).toBeVisible();
});

test("药方成本：各店最低价 / 平均成本 / 指定一家店", async () => {
  const id = await rxId("四君子汤");
  await page.goto(`/prescriptions/${id}`);
  const section = page.getByTestId("cost-section");

  const cheap = rxCost("四君子汤", (h) => cheapestOffer(h)?.perGram ?? null);
  expect(cheap.missing).toEqual([]);
  await expect(section.getByTestId("cost-summary")).toHaveText(`每副 ${$(cheap.perDose)} · ${cheap.doses} 副共 ${$(cheap.total)}`);
  await expect(section.getByTestId("cost-row-人参")).toContainText(SHOPS[3].name); // 人参只有参茸行有

  await section.getByRole("link", { name: "我买入的平均成本" }).click();
  await expect(page).toHaveURL(/cost=average/);
  const avg = rxCost("四君子汤", avgCost);
  await expect(section.getByTestId("cost-summary")).toHaveText(`每副 ${$(avg.perDose)} · ${avg.doses} 副共 ${$(avg.total)}`);

  // 只在仁和堂买：人参没有 → 标出缺的
  await section.getByRole("link", { name: `只在${SHOPS[0].name}` }).click();
  const a = rxCost("四君子汤", (h) => offers(h).find((o) => o.shop === SHOPS[0].name)?.perGram ?? null);
  expect(a.missing).toEqual(["人参"]);
  await expect(section.getByTestId("cost-missing")).toHaveText("（不含没有价格的：人参）");
  await expect(section.getByTestId("cost-row-人参")).toContainText("无价格");
  await expect(section.getByTestId("cost-summary")).toContainText(`每副 ${$(a.perDose)}`);

  // 各店对比：缺得少的排前面，每家的每副价格
  const byStore = SHOPS.map((s) => {
    const c = rxCost("四君子汤", (h) => offers(h).find((o) => o.shop === s.name)?.perGram ?? null);
    return { shop: s.name, ...c };
  })
    .filter((c) => c.missing.length < 4)
    .sort((x, y) => x.missing.length - y.missing.length || x.perDose - y.perDose || x.shop.localeCompare(y.shop));
  const items = section.getByTestId("by-store").locator("li");
  await expect(items).toHaveCount(byStore.length);
  for (const [i, c] of byStore.entries()) {
    await expect(items.nth(i)).toContainText(c.shop);
    await expect(items.nth(i)).toContainText(`每副 ${$(c.perDose)}`);
    await expect(items.nth(i)).toContainText(c.missing.length ? `缺 ${c.missing.length} 味` : "齐全");
  }
});

test("和诊所实付比较；有药没价格时不比较", async () => {
  const id = await rxId("四君子汤");
  await page.goto(`/prescriptions/${id}`);
  await page.getByLabel(/诊所实付/).fill("70");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const cheap = rxCost("四君子汤", (h) => cheapestOffer(h)?.perGram ?? null);
  const savingExact = 10 - cheap.exact; // 用不取整的每副成本比较，显示时才取整
  const saving = r2(savingExact);
  await expect(page.getByTestId("clinic-compare")).toHaveText(
    saving >= 0
      ? `诊所实付每副 $10.00，自己买每副便宜 ${$(saving)}（${Math.round((savingExact / 10) * 1000) / 10}%）`
      : `诊所实付每副 $10.00，自己买每副贵 ${$(-saving)}`,
  );
  expect(Number((await sql<{ p: string }>("select price_paid::text p from prescriptions where id = $1", [id]))[0].p)).toBe(70);

  // 补中益气汤：升麻没买过 → 不和诊所比
  const id2 = await rxId("补中益气汤");
  await page.goto(`/prescriptions/${id2}`);
  await page.getByLabel(/诊所实付/).fill("49");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByTestId("clinic-compare")).toContainText("有药材没有价格，暂不比较");
  await expect(page.getByTestId("cost-missing")).toContainText("升麻");

  // 清空实付
  await page.getByLabel(/诊所实付/).fill("");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByTestId("clinic-compare")).toHaveCount(0);
});

test("药柜价值 = Σ 正库存 × 加权平均成本", async () => {
  const stock = expectedStock({ includeCalibration: true });
  let total = 0;
  for (const [herb, g] of stock) {
    const c = avgCost(herb);
    if (c !== null) total += r2(Math.max(g, 0) * c);
  }
  await page.goto("/prices");
  await expect(page.getByTestId("pantry-value")).toHaveText($(r2(total)));
  await page.goto("/inventory");
  await expect(page.getByTestId("inventory-value")).toContainText($(r2(total)));
});

test("在诊所买药：新店类型为诊所，比价表里标出；价格更低时成为最便宜", async () => {
  await page.goto("/purchases/new");
  await page.locator('input[name="store_name"]').fill("李医生诊所");
  await page.locator("#store_kind").selectOption("clinic");
  await page.getByLabel("药名", { exact: true }).first().fill("黄芪");
  await page.getByLabel("克数", { exact: true }).first().fill("100");
  await page.getByLabel("总价", { exact: true }).first().fill("0.5"); // $0.50/100g，比所有药行都便宜
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/purchases(\?.*)?$/);

  const [s] = await sql<{ kind: string }>(
    `select s.kind from stores s join workspace_members m on m.workspace_id = s.workspace_id
     join auth.users u on u.id = m.user_id where u.email = $1 and s.name = '李医生诊所'`,
    [users.hao.email],
  );
  expect(s.kind).toBe("clinic");

  await page.goto("/prices");
  await expect(page.getByRole("columnheader", { name: /李医生诊所\s*诊所/ })).toBeVisible();
  await expect(page.getByTestId("price-黄芪-李医生诊所")).toHaveText("$0.50");
  await expect(page.getByTestId("price-黄芪-李医生诊所")).toHaveClass(/text-jade/);

  // 再录一次同名店，选「网店」也不会改变已有店铺的类型
  await page.goto("/purchases/new");
  await page.locator('input[name="store_name"]').fill("李医生诊所");
  await page.locator("#store_kind").selectOption("online");
  await page.getByLabel("药名", { exact: true }).first().fill("黄芪");
  await page.getByLabel("克数", { exact: true }).first().fill("100");
  await page.getByLabel("总价", { exact: true }).first().fill("0.6");
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/purchases(\?.*)?$/);
  const kinds = await sql<{ kind: string }>(
    `select s.kind from stores s join workspace_members m on m.workspace_id = s.workspace_id
     join auth.users u on u.id = m.user_id where u.email = $1 and s.name = '李医生诊所'`,
    [users.hao.email],
  );
  expect(kinds).toEqual([{ kind: "clinic" }]);
  // 现价 = 最近一次（0.6）
  await page.goto("/prices");
  await expect(page.getByTestId("price-黄芪-李医生诊所")).toHaveText("$0.60");
});
