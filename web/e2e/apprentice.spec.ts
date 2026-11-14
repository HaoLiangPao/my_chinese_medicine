/**
 * 中医小学徒（APR-1，docs/design/0019）：目录页「随便翻一味」、详情页说话框、减少动态效果、手机。
 * 期望值从 supabase/seed.sql、supabase/data/herb-monographs.json 和测试自己写进数据库的数据算，不读 App 的结果。
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RUN, signUp, sql, workspaceOf } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const PHONE = { width: 390, height: 844 };
const ACTIONS = { read: "读书", pound: "捣药", weigh: "称药", drawer: "翻药柜", needle: "练针灸" } as const;
const DISCLAIMER = "小学徒在学习，仅为中药知识，不作用药建议";
const user = { email: `apprentice+${RUN}@example.com`, password: "secret-apprentice-123" };
const doctor = { email: `apprentice-doc+${RUN}@example.com`, password: "secret-apprentice-123" };

const root = path.resolve(__dirname, "../..");
const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");
const baseBlock = seed.slice(0, seed.indexOf("base_herb_id"));
const aliasBlock = seed.slice(seed.indexOf("herb_aliases"));
const catalog = [...baseBlock.matchAll(/\('([^']+)', '([^']+)', '([^']+)'\)/g)].map((m) => ({ name: m[1], pinyin: m[2], category: m[3] }));
const aliasesOf = (name: string) => [...aliasBlock.matchAll(/\('([^']+)', '([^']+)'\)/g)].filter((m) => m[2] === name).map((m) => m[1]);
type Draft = { name: string; flavors: string[]; nature: string; meridians: string[]; use: string; cautions: string | null };
const drafts = (JSON.parse(readFileSync(path.join(root, "supabase/data/herb-monographs.json"), "utf8")) as { herbs: Draft[] }).herbs;

const herbId = async (name: string) => (await sql<{ id: string }>("select id from herbs where name_zh = $1", [name]))[0].id;

/** 一直点说话框，收集所有不同的台词（台词按顺序循环，点 n 次一定能看全 n 句以内的） */
async function collectLines(p: Page, clicks: number) {
  const line = p.getByTestId("apprentice-line");
  const seen: string[] = [];
  for (let i = 0; i < clicks; i++) {
    await expect(line).toHaveAttribute("data-index", String(i));
    const t = (await line.innerText()).replace(/\s*↻ 换一句$/, "");
    if (!seen.includes(t)) seen.push(t);
    await line.click();
  }
  return seen;
}

/** 页面上小学徒以外的按钮和链接，都没被挡住（中心点上最上面的元素是它自己或它里面的） */
async function nothingCovered(p: Page) {
  const covered = await p.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main a[href], main button, main input")) {
      if (el.closest("[data-testid=apprentice]")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && !el.contains(top) && top.closest("[data-testid=apprentice]")) out.push(el.outerHTML.slice(0, 80));
    }
    return out;
  });
  expect(covered).toEqual([]);
}

async function noOverflow(p: Page) {
  expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

/** 场景里所有元素的动画名（减少动态效果时都应该是 none） */
const animations = (p: Page, testId = "apprentice-scene") =>
  p
    .getByTestId(testId)
    .first()
    .evaluate((svg) => [svg, ...svg.querySelectorAll("*")].map((el) => getComputedStyle(el).animationName).filter((n) => n !== "none"));

test("目录页：小学徒随机做五个动作之一；「随便翻一味」打开的都是目录里的药", { tag: ["@APR-1"] }, async ({ page }) => {
  await signUp(page, user);
  await page.goto("/herbs");
  const corner = page.getByTestId("apprentice-corner");
  await expect(corner).toBeVisible();
  const scene = corner.getByTestId("apprentice-scene");
  const action = (await scene.getAttribute("data-action")) as keyof typeof ACTIONS;
  expect(Object.keys(ACTIONS)).toContain(action);
  await expect(scene).toHaveAccessibleName(`小学徒在${ACTIONS[action]}`);
  await expect(corner.getByTestId("apprentice-disclaimer")).toHaveText(DISCLAIMER);
  // 目录页的台词：第一句是目录的味数（seed.sql 里原药材 + 炮制品），其余是通用的
  const catalogSize = Number((await sql<{ n: string }>("select count(*) n from herbs where category is not null"))[0].n);
  const lines = await collectLines(page, 25);
  expect(lines).toContain(`药柜里有 ${catalogSize} 味药，我一天认几味，慢慢来。`);
  expect(lines.length).toBeGreaterThanOrEqual(15);
  // 药柜是空的：「只翻我药柜里有的」点不了
  await expect(corner.getByTestId("random-herb-mine")).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/小学徒-目录页.png` });

  const visited = new Set<string>();
  for (let i = 0; i < 4; i++) {
    await page.goto("/herbs");
    await page.getByTestId("random-herb").click();
    await page.waitForURL(/\/herbs\/[0-9a-f-]{36}\?flip=all$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    const [h] = await sql<{ name_zh: string; category: string | null }>("select name_zh, category from herbs where id = $1", [id]);
    expect(h.category, `${h.name_zh} 应该是目录里的药`).not.toBeNull();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h.name_zh);
    visited.add(id);
  }
  expect(visited.size).toBeGreaterThan(1); // 500 多味里随机 4 次，全一样的概率可以忽略
  // 详情页「再翻一味」：换到另一味目录里的药
  const before = new URL(page.url()).pathname;
  await page.getByTestId("random-herb").click();
  await page.waitForURL((u) => u.pathname !== before && /^\/herbs\/[0-9a-f-]{36}$/.test(u.pathname));
});

test("只翻我药柜里有的：药柜里只有茯苓和猪苓 → 从茯苓「再翻一味」一定是猪苓", { tag: ["@APR-1"] }, async ({ page }) => {
  await signUp(page, { ...user, email: `apprentice-mine+${RUN}@example.com` });
  const ws = await workspaceOf(`apprentice-mine+${RUN}@example.com`);
  const [fuling, zhuling] = [await herbId("茯苓"), await herbId("猪苓")];
  for (const h of [fuling, zhuling])
    await sql("insert into inventory_txns (workspace_id, herb_id, delta_grams, kind) values ($1, $2, 100, 'adjust')", [ws, h]);
  await page.goto("/herbs");
  await page.getByTestId("random-herb-mine").check();
  await page.getByTestId("random-herb").click();
  await page.waitForURL(/\?flip=mine$/);
  const first = new URL(page.url()).pathname.split("/")[2];
  expect([fuling, zhuling]).toContain(first);
  const other = first === fuling ? zhuling : fuling;
  await expect(page.getByTestId("random-herb")).toHaveText("🎲 再翻一味（药柜里的）");
  await page.getByTestId("random-herb").click();
  await page.waitForURL(`**/herbs/${other}?flip=mine`);
});

test("详情页：说话框只说确定的数据；草稿资料不说；点一下换一句", { tag: ["@APR-1"] }, async ({ page }) => {
  await signUp(page, { ...user, email: `apprentice-detail+${RUN}@example.com` });
  // 茯苓：资料是草稿（本地库从空库跑 migration，全部是草稿）
  const fuling = catalog.find((h) => h.name === "茯苓")!;
  const same = catalog.filter((h) => h.category === fuling.category && h.name !== "茯苓").map((h) => h.name);
  const aliases = aliasesOf("茯苓");
  await page.goto(`/herbs/${await herbId("茯苓")}`);
  const ap = page.getByTestId("apprentice");
  await expect(ap.getByTestId("apprentice-scene")).toHaveAttribute("data-action", /^(read|pound|weigh|drawer|needle)$/);
  await expect(ap.getByTestId("apprentice-disclaimer")).toHaveText(DISCLAIMER);
  const lines = await collectLines(page, 8);
  const expected = [
    `茯苓，拼音 ${fuling.pinyin}。先把字认准，抓药才不会抓错。`,
    `茯苓归在${fuling.category}里，我在一类一类地背。`,
    `茯苓也写作${aliases.slice(0, 3).join("、")}。方子上看到别的写法，也要认得是它。`,
  ];
  for (const e of expected) expect(lines).toContain(e);
  const recite = lines.find((l) => l.startsWith(`我在背${fuling.category}：茯苓、`))!;
  expect(recite, "同一类的药").toBeTruthy();
  for (const n of recite
    .replace(/^.*：茯苓、/, "")
    .replace(/……$/, "")
    .split("、"))
    expect(same).toContain(n);
  expect(lines).toHaveLength(4);
  const draft = drafts.find((d) => d.name === "茯苓")!;
  expect(lines.join("")).not.toContain(draft.use); // 草稿（没经医生审核）的资料不说
  await page.screenshot({ path: `${SHOTS}/小学徒-详情页.png` });
});

test("详情页：已审核的资料能说（性味归经、传统用途），不说使用注意", { tag: ["@APR-1"] }, async ({ page }) => {
  await signUp(page, { ...user, email: `apprentice-reviewed+${RUN}@example.com` });
  const d = drafts.find((x) => x.name === "猪苓")!;
  const id = await herbId("猪苓");
  // 测试自己把猪苓标成已审核，测完改回草稿
  await sql("update herb_monographs set status = 'reviewed', reviewed_by = '测试审核人', reviewed_at = current_date where herb_id = $1", [
    id,
  ]);
  try {
    await page.goto(`/herbs/${id}`);
    const lines = await collectLines(page, 14);
    expect(lines).toContain(`猪苓：${d.flavors.join("、")}，${d.nature}，归${d.meridians.join("、")}经。背下来了！`);
    expect(lines).toContain(`书上记的猪苓的传统用途：${d.use}。这是中医传统用法，我先背下来。`);
    if (d.cautions) expect(lines.join("")).not.toContain(d.cautions);
    for (const l of lines) expect(l).not.toMatch(/\d\s*(g|克|钱)|服用|患者|病人|需要/);
  } finally {
    await sql("update herb_monographs set status = 'draft', reviewed_by = null, reviewed_at = null where herb_id = $1", [id]);
  }
});

test("减少动态效果：所有动画都停下；平时有动画", { tag: ["@APR-1"] }, async ({ browser }) => {
  const p = await browser.newPage();
  await signUp(p, { ...user, email: `apprentice-motion+${RUN}@example.com` });
  await p.goto("/herbs/apprentice");
  for (const a of Object.keys(ACTIONS)) expect((await animations(p, `gallery-${a}`)).length, `${a} 平时有动画`).toBeGreaterThan(0);
  await p.emulateMedia({ reducedMotion: "reduce" });
  for (const a of Object.keys(ACTIONS)) expect(await animations(p, `gallery-${a}`), `${a} 减少动态效果`).toEqual([]);
  await p.goto(`/herbs/${await herbId("茯苓")}`);
  expect(await animations(p)).toEqual([]);
  await p.close();
});

test("认识小学徒：五个动作和道具都在；每个动作截一张（浅色、深色）", { tag: ["@APR-1"] }, async ({ browser }) => {
  const p = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await signUp(p, { ...user, email: `apprentice-gallery+${RUN}@example.com` });
  await p.goto("/herbs");
  await p.getByRole("link", { name: "认识小学徒 →" }).click();
  await p.waitForURL("**/herbs/apprentice");
  for (const [a, label] of Object.entries(ACTIONS)) {
    const fig = p.getByTestId(`gallery-${a}`);
    await expect(fig.getByRole("img", { name: `小学徒在${label}` })).toBeVisible();
    await fig.screenshot({ path: `${SHOTS}/小学徒-动作-${label}.png`, animations: "disabled" });
  }
  for (const name of ["小学徒", "药柜", "书卷", "药臼和杵", "戥子", "针灸铜人和针", "鞠躬的小药童"])
    await expect(p.getByRole("img", { name, exact: true })).toBeVisible();
  await p.screenshot({ path: `${SHOTS}/小学徒-素材库.png`, fullPage: true, animations: "disabled" });
  await p.emulateMedia({ colorScheme: "dark" });
  await p.screenshot({ path: `${SHOTS}/小学徒-素材库-深色.png`, fullPage: true, animations: "disabled" });
  await p.close();
});

test("手机 390px：目录页、详情页不溢出，小学徒不挡住按钮", { tag: ["@APR-1", "@PLAT-2"] }, async ({ browser }) => {
  const p = await browser.newPage({ viewport: PHONE, hasTouch: true });
  await signUp(p, { ...user, email: `apprentice-phone+${RUN}@example.com` });
  await p.goto("/herbs");
  await expect(p.getByTestId("apprentice-corner")).toBeVisible();
  await noOverflow(p);
  await nothingCovered(p);
  await p.screenshot({ path: `${SHOTS}/小学徒-目录页-手机.png` });
  // 没有照片的药：占位图（鞠躬的小学徒）+「拍一张上传」，下面是说话框
  await p.goto(`/herbs/${await herbId("猪苓")}`);
  await expect(p.getByTestId("apprentice-line")).toBeVisible();
  await noOverflow(p);
  await nothingCovered(p);
  const first = await p.getByTestId("apprentice-line").innerText();
  await p.getByTestId("apprentice-line").tap();
  await expect(p.getByTestId("apprentice-line")).not.toHaveText(first);
  await noOverflow(p);
  await p.screenshot({ path: `${SHOTS}/小学徒-详情页-手机.png` });
  await p.close();
});

test("开方、录方这些干活的页面没有小学徒", { tag: ["@APR-1"] }, async ({ browser }) => {
  const p = await browser.newPage();
  await signUp(p, doctor, "小学徒测试诊所");
  for (const url of ["/clinic/prescribe", "/prescriptions", "/inventory", "/"]) {
    await p.goto(url);
    await expect(p.locator("main")).toBeVisible();
    await expect(p.getByTestId("apprentice")).toHaveCount(0);
  }
  await p.goto("/herbs");
  await expect(p.getByTestId("apprentice")).toHaveCount(1);
  await expect(p.getByTestId("random-herb-mine")).toBeDisabled();
  await expect(p.getByTestId("apprentice-corner")).toContainText("只翻库存里有的"); // 诊所用语
  await p.close();
});
