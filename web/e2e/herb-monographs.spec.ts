/**
 * 药材资料和核对页（docs/design/0010 §3.1、§3.2、§4.1）。
 * 期望值从 supabase/data/herb-monographs.json 读（资料的来源文件），不读 App 的结果。
 * 审核会改全站共用的资料，所以这一组按顺序跑。
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RUN, signUp, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

type Draft = { name: string; flavors: string[]; nature: string; meridians: string[]; use: string; regions?: string; check?: string; status: string };
const drafts = (JSON.parse(readFileSync(path.resolve(__dirname, "../../supabase/data/herb-monographs.json"), "utf8")) as { herbs: Draft[] }).herbs;
const draft = (name: string) => drafts.find((d) => d.name === name)!;
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");

const patient = { email: `mono-patient+${RUN}@example.com`, password: "secret-mono-123" };
const reviewer = { email: `mono-reviewer+${RUN}@example.com`, password: "secret-mono-123" };
const herbId = async (name: string) => (await sql<{ id: string }>("select id from herbs where name_zh = $1", [name]))[0].id;

let pp: Page; // 病人账号（不是审核人）
let rp: Page; // 审核人

test.beforeAll(async ({ browser }) => {
  pp = await browser.newPage();
  await signUp(pp, patient);
  rp = await browser.newPage();
  await signUp(rp, reviewer, "核对诊所");
});
test.afterAll(async () => {
  await pp.close();
  await rp.close();
});

test("药材详情页：性味归经标签、资料、草稿标「待审核」", { tag: ["@LBL-1"] }, async () => {
  const md = draft("麦冬");
  await pp.goto(`/herbs/${await herbId("麦冬")}`);
  const tags = pp.getByTestId("monograph-tags");
  await expect(tags).toContainText(md.flavors.join(" · "));
  await expect(tags).toContainText(md.nature);
  await expect(tags).toContainText(`${md.meridians.join(" · ")}经`);
  await expect(tags).toContainText("无毒");
  await expect(pp.getByTestId("monograph-性味")).toHaveText(`${md.flavors.join("、")}，${md.nature}`);
  await expect(pp.getByTestId("monograph-归经")).toHaveText(`${md.meridians.join("、")}经`);
  await expect(pp.getByTestId("monograph-传统用途")).toHaveText(`${md.use}（中医传统用法）`);
  await expect(pp.getByTestId("monograph-draft")).toHaveText("草稿 · 待审核");
  await expect(pp.getByTestId("monograph-footer")).toContainText("还没有经过医生审核");
  await expect(pp.getByRole("link", { name: "去核对" })).toHaveCount(0); // 不是审核人
  await expect(pp.getByTestId("monograph")).toBeVisible();
  await pp.getByTestId("monograph").screenshot({ path: `${SHOTS}/药材详情-资料.png` });
  await pp.locator("main").screenshot({ path: `${SHOTS}/药材详情-整页.png` });

  // 有毒的药标出来
  await pp.goto(`/herbs/${await herbId("半夏")}`);
  await expect(pp.getByTestId("monograph-tags")).toContainText("有毒");
});

test("炮制品：自己的资料没写的字段用原药材的；没有资料的用原药材的并注明", { tag: ["@LBL-1"] }, async () => {
  await pp.goto(`/herbs/${await herbId("炙甘草")}`);
  await expect(pp.getByTestId("monograph-传统用途")).toHaveText(`${draft("炙甘草").use}（中医传统用法）`);
  await expect(pp.getByTestId("monograph-道地产区")).toHaveText(draft("甘草").regions!); // 炙甘草没写产区
  await expect(pp.getByTestId("monograph-tags")).toContainText("无毒");

  // 用户自己加的炮制品，没有资料 → 显示原药材「山楂」的
  const [{ id }] = await sql<{ id: string }>(
    `insert into herbs (name_zh, base_herb_id) select '测试炒山楂', id from herbs where name_zh = '山楂'
     on conflict (name_zh) do update set name_zh = excluded.name_zh returning id`,
  );
  await pp.goto(`/herbs/${id}`);
  await expect(pp.getByTestId("monograph")).toContainText("还没有单独的资料，下面是原药材「山楂」的");
  await expect(pp.getByTestId("monograph-传统用途")).toHaveText(`${draft("山楂").use}（中医传统用法）`);
});

test("核对页：不是审核人打不开；审核人从药材页进入", { tag: ["@LBL-7"] }, async () => {
  for (const url of ["/review/herbs", `/review/herbs/${await herbId("麦冬")}`]) {
    const res = await pp.goto(url);
    expect(res?.status(), url).toBe(404);
  }
  const res = await rp.goto("/review/herbs");
  expect(res?.status()).toBe(404); // 还没加成审核人

  await sql(
    `insert into monograph_reviewers (user_id, display_name) select id, '测试医生' from auth.users where email = $1`,
    [reviewer.email],
  );
  await rp.goto("/herbs");
  await expect(rp.getByTestId("review-entry")).toContainText(`${drafts.length} 味待审核`);
  await rp.getByTestId("review-entry").click();
  await expect(rp.getByTestId("review-progress")).toHaveText(`已审核 0 / ${drafts.length} 味`);
  await expect(rp.getByRole("link", { name: /^要重点核对（\d+）$/ })).toHaveText(`要重点核对（${drafts.filter((d) => d.check).length}）`);
  await rp.screenshot({ path: `${SHOTS}/核对-列表.png` });
});

test("审核一味药：格式不对保存不了 → 改好通过 → 跳到下一味；详情页显示审核人", { tag: ["@LBL-7", "@LBL-1"] }, async () => {
  const mdId = await herbId("麦冬");
  await rp.goto(`/review/herbs/${mdId}`);
  await expect(rp.getByTestId("review-herb-name")).toHaveText("麦冬");
  await expect(rp.getByTestId("review-status")).toHaveText("草稿 · 待审核");
  await rp.screenshot({ path: `${SHOTS}/核对-麦冬.png`, fullPage: true });

  // 先改产区，再把归经写错：报错后填过的内容都还在（表单不能被重置）
  await rp.getByLabel("道地产区").fill("浙江慈溪（浙麦冬）、四川绵阳（川麦冬）");
  await rp.getByLabel("归经").fill("心、肺、头");
  await rp.getByRole("button", { name: "通过，下一味" }).click();
  await expect(rp.getByTestId("review-form").getByRole("alert")).toContainText("「归经」只能写");
  await expect(rp.getByLabel("归经")).toHaveValue("心、肺、头");
  await expect(rp.getByLabel("道地产区")).toHaveValue("浙江慈溪（浙麦冬）、四川绵阳（川麦冬）");
  // 写了用量
  await rp.getByLabel("归经").fill("心经、肺经、胃经");
  await rp.getByLabel("传统用途").fill("养阴生津，润肺清心，每次 10g");
  await rp.getByRole("button", { name: "通过，下一味" }).click();
  await expect(rp.getByTestId("review-form").getByRole("alert")).toContainText("不写用量");
  await expect(rp.getByLabel("传统用途")).toHaveValue("养阴生津，润肺清心，每次 10g");

  // 改好，通过（产区用的是前面填的）
  await rp.getByLabel("传统用途").fill(draft("麦冬").use);
  await rp.getByRole("button", { name: "通过，下一味" }).click();
  await expect(rp.getByTestId("approved-prev")).toContainText("「麦冬」已通过");
  await expect(rp).not.toHaveURL(new RegExp(`/review/herbs/${mdId}(\\?|$)`)); // 跳到了别的药
  await expect(rp.getByTestId("review-status")).toHaveText("草稿 · 待审核"); // 下一味还是草稿

  const [row] = await sql<{ status: string; reviewed_by: string; meridians: string[]; regions: string }>(
    "select status, reviewed_by, meridians, regions from herb_monographs where herb_id = $1",
    [mdId],
  );
  expect(row).toEqual({ status: "reviewed", reviewed_by: "测试医生", meridians: ["心", "肺", "胃"], regions: "浙江慈溪（浙麦冬）、四川绵阳（川麦冬）" });

  // 病人账号的详情页：不再是草稿，写审核人和月份
  await pp.goto(`/herbs/${mdId}`);
  await expect(pp.getByTestId("monograph-draft")).toHaveCount(0);
  const month = new Date().toISOString().slice(0, 7);
  await expect(pp.getByTestId("monograph-footer")).toContainText(`内容审核：测试医生 · ${month}`);
  await expect(pp.getByTestId("monograph-道地产区")).toHaveText("浙江慈溪（浙麦冬）、四川绵阳（川麦冬）");
});

test("审核过的再改 → 退回草稿；有问题 → 记备注；修改记录", { tag: ["@LBL-7"] }, async () => {
  const mdId = await herbId("麦冬");
  await rp.goto(`/review/herbs/${mdId}`);
  await expect(rp.getByTestId("review-status")).toContainText("已审核 · 测试医生");
  await rp.getByLabel("保存", { exact: true }).fill("密封，置阴凉干燥处");
  await rp.getByRole("button", { name: "先存着" }).click();
  await expect(rp.getByTestId("review-form").getByRole("status")).toHaveText("已保存（还是草稿）。");
  await expect(rp.getByTestId("review-status")).toHaveText("草稿 · 待审核");

  // 要重点核对的药：提示显示在最上面；记下问题
  const trId = await herbId("桃仁");
  await rp.goto(`/review/herbs/${trId}`);
  await expect(rp.getByTestId("check-note")).toContainText(draft("桃仁").check!);
  await rp.getByText("有问题？").click();
  await rp.getByLabel("问题备注").fill("药典原文要再查");
  await rp.getByRole("button", { name: "记下问题" }).click();
  await expect(rp.getByTestId("review-form").getByRole("status")).toHaveText("已记下，我们会处理。");
  await rp.goto("/review/herbs?filter=flagged");
  await expect(rp.getByTestId("review-list")).toContainText("桃仁");

  await rp.goto(`/review/herbs/${mdId}`);
  await expect(rp.getByTestId("revisions").locator("li")).toHaveCount(2);
  await expect(rp.getByTestId("revisions").locator("li").first()).toContainText("测试医生 · 保存");
});

test("炮制品通过了，但用到原药材还没审核的字段 → 还是按草稿显示；核对页看得到继承的内容", { tag: ["@LBL-7", "@LBL-1"] }, async () => {
  const id = await herbId("炙甘草");
  await rp.goto(`/review/herbs/${id}`);
  await expect(rp.getByLabel("道地产区")).toHaveAttribute("placeholder", `空着 = 同原药材：${draft("甘草").regions}`);
  await expect(rp.getByLabel("毒性")).toContainText("同原药材（无毒）");
  await rp.getByRole("button", { name: "通过，下一味" }).click();
  await expect(rp.getByTestId("approved-prev")).toContainText("「炙甘草」已通过");

  await pp.goto(`/herbs/${id}`);
  await expect(pp.getByTestId("monograph-draft")).toHaveText("草稿 · 待审核"); // 甘草还没审核
  await expect(pp.getByTestId("monograph-footer")).toContainText("部分内容来自原药材「甘草」");
  await expect(pp.getByTestId("monograph-footer")).not.toContainText("内容审核");
});

test("手机上核对页不横向溢出，按钮点得到", { tag: ["@LBL-7", "@PLAT-2"] }, async ({ browser }) => {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await m.goto("/login");
  await m.getByLabel("邮箱").fill(reviewer.email);
  await m.getByLabel("密码").fill(reviewer.password);
  await m.getByRole("button", { name: "登录" }).click();
  await m.waitForURL((u) => !u.pathname.startsWith("/login"));
  for (const url of ["/review/herbs", `/review/herbs/${await herbId("黄芪")}`]) {
    await m.goto(url);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await m.getByRole("button", { name: "通过，下一味" }).scrollIntoViewIfNeeded();
  await expect(m.getByRole("button", { name: "通过，下一味" })).toBeVisible();
  await m.evaluate(() => window.scrollTo(0, 0));
  await m.screenshot({ path: `${SHOTS}/核对-手机.png` });
  await m.close();
});
