/**
 * 药材的来源和入药部位（CAT-2，docs/design/0018）：目录按来源分组、每味药的来源小图标、详情页的「来源 · 部位」标签、手机不溢出。
 * 期望值按 supabase/data/herb-kinds.json 和 seed.sql 的名单手数（每组 = 原药材 + 跟着它的炮制品），不读 App 的结果。
 * 目录是全站共用的：同一次运行里别的测试会新增没有分类的药，所以「未分类」组只查在最后、不查味数。
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { RUN, signUp, sql } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const SUFFIX = process.env.SHOT_SUFFIX ?? "";
const user = { email: `kinds+${RUN}@example.com`, password: "secret-kinds-123" };
const PHONE = { width: 390, height: 844 };
const OWN_HERB = `自加药${RUN}`; // 用户自己加的药（App 里只能写药名）→ 未分类

async function noOverflow(p: Page) {
  expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

// 按来源分组的顺序和味数：植物按部位 8 组，再是菌藻、动物、矿物、加工品
// （根及根茎 122 + 30 个炮制品、果实种子 108 + 22、全草 43 + 1、叶 15 + 3、花 25 + 2、皮 15 + 4、茎木 26 + 1、树脂及其他 8 + 2、
//  菌藻 9、动物 35 + 6、矿物 16 + 4、加工品 8 + 2；胆南星算加工品，不跟天南星）
const ORIGIN_GROUPS: [string, string, number][] = [
  ["root", "植物 · 根及根茎", 152],
  ["fruit_seed", "植物 · 果实种子", 130],
  ["whole", "植物 · 全草", 44],
  ["leaf", "植物 · 叶", 18],
  ["flower", "植物 · 花", 27],
  ["bark", "植物 · 皮", 19],
  ["stem", "植物 · 茎木", 27],
  ["resin_other", "植物 · 树脂及其他", 10],
  ["fungus", "菌藻", 9],
  ["animal", "动物", 41],
  ["mineral", "矿物", 20],
  ["manufactured", "加工品", 10],
];

test.beforeAll(async ({ browser }) => {
  const p = await browser.newPage();
  await signUp(p, user);
  await p.close();
  await sql(`insert into herbs (name_zh) values ($1) on conflict do nothing`, [OWN_HERB]);
});

test.afterAll(async () => {
  await sql(`delete from herbs where name_zh = $1`, [OWN_HERB]);
});

async function login(p: Page) {
  await p.goto("/login");
  await p.getByLabel("邮箱").fill(user.email);
  await p.getByLabel("密码").fill(user.password);
  await p.getByRole("button", { name: "登录" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test(
  "药材页：默认按功效分组，每味药前有来源小图标；切到「按来源」：植物按部位，13 组，味数和名单一致",
  { tag: ["@CAT-2"] },
  async ({ browser }) => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await login(p);
    await p.goto("/herbs");

    // 默认：按功效（和以前一样），「按功效」是选中的
    const groupBy = p.getByTestId("herbs-group-by");
    await expect(groupBy.getByRole("link", { name: "按功效" })).toHaveAttribute("aria-current", "page");
    await expect(p.locator('[data-testid^="catalog-"]').first()).toHaveAttribute("data-testid", "catalog-解表药");
    // 小标签前的图标：麻黄 植物、蝉蜕 动物、淡豆豉 加工品；清热药里的石膏 矿物、马勃 菌藻
    await p.getByTestId("catalog-解表药").locator("summary").click();
    const jiebiao = p.getByTestId("catalog-解表药");
    for (const [name, icon] of [
      ["麻黄", "plant"],
      ["蝉蜕", "animal"],
      ["淡豆豉", "manufactured"],
    ]) {
      await expect(jiebiao.getByRole("link", { name, exact: true }).locator("svg")).toHaveAttribute("data-kind-icon", icon);
    }
    await expect(jiebiao.getByRole("link", { name: "麻黄", exact: true })).toHaveAttribute("title", "ma huang · 解表药 · 植物 · 全草");
    await p.getByTestId("catalog-清热药").locator("summary").click();
    await expect(p.getByTestId("catalog-清热药").getByRole("link", { name: "石膏", exact: true }).locator("svg")).toHaveAttribute(
      "data-kind-icon",
      "mineral",
    );
    await expect(p.getByTestId("catalog-清热药").getByRole("link", { name: "马勃", exact: true }).locator("svg")).toHaveAttribute(
      "data-kind-icon",
      "fungus",
    );
    // 用户自己加的药在「其他」里，图标是未分类
    await p.getByTestId("catalog-其他").locator("summary").click();
    await expect(p.getByTestId("catalog-其他").getByRole("link", { name: OWN_HERB }).locator("svg")).toHaveAttribute(
      "data-kind-icon",
      "unclassified",
    );
    await p.screenshot({ path: `${SHOTS}/来源分类-按功效${SUFFIX}.png`, fullPage: true });

    // 切到按来源
    await groupBy.getByRole("link", { name: "按来源" }).click();
    await expect(p).toHaveURL(/\/herbs\?by=origin$/);
    await expect(groupBy.getByRole("link", { name: "按来源" })).toHaveAttribute("aria-current", "page");
    const groups = p.locator('details[data-testid^="catalog-"]');
    for (const [i, [key, label, count]] of ORIGIN_GROUPS.entries()) {
      const g = groups.nth(i);
      await expect(g).toHaveAttribute("data-testid", `catalog-${key}`);
      await expect(g.locator("summary")).toHaveText(`${label}${count} 味`);
      await expect(g.locator("summary svg")).toHaveAttribute("data-kind-icon", key); // 组标题带这一组的图标
    }
    // 用户自己加的药：最后一组「未分类」
    await expect(groups.last()).toHaveAttribute("data-testid", "catalog-unclassified");
    await expect(groups).toHaveCount(ORIGIN_GROUPS.length + 1);
    await groups.last().locator("summary").click();
    await expect(groups.last().getByRole("link", { name: OWN_HERB })).toBeVisible();

    // 几味有代表性的：胆南星在加工品（不跟天南星）、天南星在根、陈皮在果实种子、龙骨在矿物；组内的小标签不再放图标
    await p.getByTestId("catalog-manufactured").locator("summary").click();
    const made = p.getByTestId("catalog-manufactured");
    for (const n of ["胆南星", "阿胶", "神曲", "焦神曲", "冰片"])
      await expect(made.getByRole("link", { name: n, exact: true })).toBeVisible();
    await expect(made.getByRole("link", { name: "阿胶", exact: true }).locator("svg")).toHaveCount(0);
    await p.getByTestId("catalog-root").locator("summary").click();
    await expect(p.getByTestId("catalog-root").getByRole("link", { name: "天南星", exact: true })).toBeVisible();
    await expect(p.getByTestId("catalog-root").getByRole("link", { name: "胆南星", exact: true })).toHaveCount(0);
    await p.getByTestId("catalog-mineral").locator("summary").click();
    await expect(p.getByTestId("catalog-mineral").getByRole("link", { name: "龙骨", exact: true })).toBeVisible();
    await expect(p.getByTestId("catalog-mineral").getByRole("link", { name: "煅龙骨", exact: true })).toBeVisible();
    await p.screenshot({ path: `${SHOTS}/来源分类-按来源${SUFFIX}.png`, fullPage: true });

    // 换回按功效
    await groupBy.getByRole("link", { name: "按功效" }).click();
    await expect(p).toHaveURL(/\/herbs$/);
    await expect(p.locator('[data-testid^="catalog-"]').first()).toHaveAttribute("data-testid", "catalog-解表药");
    await p.close();
  },
);

test("详情页：名字下面的标签行最前面是「来源 · 部位」；没有资料的药、炮制品、未分类的药也有", { tag: ["@CAT-2"] }, async ({ browser }) => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p);
  const open = async (name: string) => {
    const [h] = await sql<{ id: string }>(`select id from herbs where name_zh = $1`, [name]);
    await p.goto(`/herbs/${h.id}`);
    await expect(p.getByRole("heading", { name, exact: true })).toBeVisible();
  };

  // 有资料的药：在性味、归经前面
  await open("黄芪");
  const tag = p.getByTestId("herb-kind");
  await expect(tag).toHaveText("植物 · 根及根茎");
  await expect(tag.locator("svg").nth(0)).toHaveAttribute("data-kind-icon", "plant");
  await expect(tag.locator("svg").nth(1)).toHaveAttribute("data-kind-icon", "root");
  await expect(p.getByTestId("monograph-tags").locator("> *").first()).toHaveAttribute("data-testid", "herb-kind");
  await p.screenshot({ path: `${SHOTS}/来源分类-详情-黄芪${SUFFIX}.png` });

  // 炮制品跟原药材
  await open("炙黄芪");
  await expect(p.getByTestId("herb-kind")).toHaveText("植物 · 根及根茎");
  // 没有资料的新药（0017）：照样有
  await open("牡蛎");
  await expect(p.getByTestId("herb-kind")).toHaveText("动物");
  await expect(p.getByTestId("herb-kind").locator("svg")).toHaveAttribute("data-kind-icon", "animal");
  await open("茯苓");
  await expect(p.getByTestId("herb-kind")).toHaveText("菌藻");
  await open("胆南星");
  await expect(p.getByTestId("herb-kind")).toHaveText("加工品");
  await open("乳香");
  await expect(p.getByTestId("herb-kind")).toHaveText("植物 · 树脂及其他");
  // 用户自己加的药
  await open(OWN_HERB);
  await expect(p.getByTestId("herb-kind")).toHaveText("未分类");
  await expect(p.getByTestId("herb-kind").locator("svg")).toHaveAttribute("data-kind-icon", "unclassified");
  await p.close();
});

test("手机 390px：两种分组和详情页都不横向溢出", { tag: ["@CAT-2", "@PLAT-2"] }, async ({ browser }) => {
  const p = await browser.newPage({ viewport: PHONE, hasTouch: true });
  await login(p);
  await p.goto("/herbs?by=origin");
  await p.getByTestId("catalog-root").locator("summary").tap();
  await p.getByTestId("catalog-animal").locator("summary").tap();
  await noOverflow(p);
  await p.screenshot({ path: `${SHOTS}/来源分类-按来源-手机${SUFFIX}.png`, fullPage: true });
  await p.goto("/herbs");
  await p.getByTestId("catalog-解表药").locator("summary").tap();
  await noOverflow(p);
  await p.screenshot({ path: `${SHOTS}/来源分类-按功效-手机${SUFFIX}.png`, fullPage: true });
  await p.getByTestId("catalog-解表药").getByRole("link", { name: "麻黄", exact: true }).tap();
  await expect(p.getByRole("heading", { name: "麻黄" })).toBeVisible();
  await expect(p.getByTestId("herb-kind")).toHaveText("植物 · 全草");
  await noOverflow(p);
  await p.screenshot({ path: `${SHOTS}/来源分类-详情-手机${SUFFIX}.png` });
  await p.close();
});
