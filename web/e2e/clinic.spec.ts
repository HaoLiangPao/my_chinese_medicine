/**
 * MVP4 医生开方 E2E：建诊所 → 进货 → 新病人 → 用首字母 / 搜索选药（含炮制品、新药材）→ 修改、删除、排序
 * → 实时成本 → 保存 → 微信消息全文 → 复制 → 病历 → 再开一张 → 电话去重 → 和家庭药柜隔离。
 * 期望的成本和消息全文都在测试里独立写出来，不读 App 的计算结果。
 */
import { expect, test, type Page } from "@playwright/test";
import { signUp, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const RUN = process.env.E2E_RUN ?? "dev";
const doctor = { email: `doctor+${RUN}@example.com`, password: "secret-doc-123" };
const CLINIC = "测试中医诊所";
// 进货：每克单价 = 总价 / 克数
const STOCK = [
  { herb: "炙黄芪", grams: 500, price: 15 }, // 0.03
  { herb: "党参", grams: 500, price: 20 }, // 0.04
  { herb: "薄荷", grams: 100, price: 3 }, // 0.03
  { herb: "炙甘草", grams: 250, price: 5 }, // 0.02
];
const ppg = Object.fromEntries(STOCK.map((s) => [s.herb, s.price / s.grams]));

let page: Page;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
});
test.afterAll(async () => page.context().close());

/** 用首字母按钮选药；variant = 要选的炮制品（或原药材本身） */
async function pickByLetter(letter: string, herb: string, variant?: string) {
  await page.getByTestId(`letter-${letter}`).click();
  await page.getByTestId("letter-panel").getByTestId(`herb-${herb}`).click();
  if (variant) await page.getByTestId("variant-chooser").getByTestId(`variant-${variant}`).click();
  await expect(page.getByTestId("line-editor")).toContainText(variant ?? herb);
}
async function pickBySearch(q: string, herb: string, variant?: string) {
  await page.getByLabel("搜药材").fill(q);
  await page.getByTestId("letter-panel").getByTestId(`herb-${herb}`).click();
  if (variant) await page.getByTestId("variant-chooser").getByTestId(`variant-${variant}`).click();
}
async function fillLine(grams: number | string, opts: { prep?: string; note?: string; chip?: boolean } = {}) {
  const ed = page.getByTestId("line-editor");
  if (opts.chip) await ed.getByRole("button", { name: `${grams}g`, exact: true }).click();
  else await ed.getByLabel("克数").fill(String(grams));
  if (opts.prep) await ed.getByLabel("脚注").selectOption(opts.prep);
  if (opts.note) await ed.getByLabel("备注").fill(opts.note);
  await ed.getByRole("button", { name: /加入处方|更新/ }).click();
  await expect(ed).toHaveCount(0);
}
const lineNames = () => page.getByTestId("rx-lines").locator("tbody tr td:first-child").allTextContents();

test("1. 医生注册、创建诊所；导航切换成诊所模式", async () => {
  await signUp(page, doctor);
  await page.getByTestId("clinic-entry").locator("summary").click();
  await page.getByLabel("诊所名称").fill(CLINIC);
  await page.getByRole("button", { name: "创建诊所" }).click();
  await page.waitForURL(/\/clinic\/prescribe$/);
  await expect(page.getByTestId("clinic-badge")).toHaveText(CLINIC);
  await expect(page.getByTestId("nav").getByRole("link", { name: "开方" })).toBeVisible();
  await expect(page.getByTestId("nav").getByRole("link", { name: "病人" })).toBeVisible();
});

test("2. 诊所进货（成本用这些价格）", async () => {
  await page.goto("/purchases/new");
  await page.locator('input[name="store_name"]').fill("供应商甲");
  for (let i = 2; i < STOCK.length; i++) await page.getByRole("button", { name: "＋ 加一行" }).click();
  for (const [i, s] of STOCK.entries()) {
    await page.getByLabel("药名", { exact: true }).nth(i).fill(s.herb);
    await page.getByLabel("克数", { exact: true }).nth(i).fill(String(s.grams));
    await page.getByLabel("总价", { exact: true }).nth(i).fill(String(s.price));
  }
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/purchases(\?.*)?$/);
});

test("3. 开方：新病人、选药（首字母、炮制品、搜索、新药材）、修改、删除、排序、成本", async () => {
  await page.goto("/clinic/prescribe");
  const save = page.getByRole("button", { name: /保存并生成消息|先选一个病人|先加药/ });
  await expect(save).toBeDisabled();
  await expect(save).toHaveText("先选一个病人");

  // 新病人
  await page.getByRole("button", { name: "＋ 新病人" }).click();
  await page.getByLabel("病人姓名").fill("张三");
  await page.getByLabel("病人电话").fill("(416) 555-0101");
  await page.getByRole("button", { name: "保存病人" }).click();
  await expect(page.getByTestId("selected-patient")).toContainText("张三");
  await expect(save).toHaveText("先加药");

  // 首字母：H → 黄芪（有炮制品）→ 炙黄芪
  await page.getByTestId("letter-H").click();
  const panel = page.getByTestId("letter-panel");
  await expect(panel.getByTestId("herb-黄芪")).toContainText("+1");
  await expect(panel.getByTestId("herb-炙黄芪")).toHaveCount(0); // 炮制品不单独列出
  await panel.getByTestId("herb-黄芪").click();
  await page.getByTestId("variant-chooser").getByTestId("variant-炙黄芪").click();
  await fillLine(18, { chip: true });

  // 没有炮制品的药直接进编辑；回车加入
  await pickByLetter("D", "党参");
  await page.getByTestId("line-editor").getByLabel("克数").fill("12");
  await page.getByTestId("line-editor").getByLabel("克数").press("Enter");
  await expect(page.getByTestId("line-editor")).toHaveCount(0);

  await pickByLetter("B", "薄荷");
  await fillLine(3, { prep: "后下", note: "最后 5 分钟放", chip: true });

  // 炮制品按原药材归类：Z 下面有知母、泽泻……但没有炙甘草、炙黄芪
  await page.getByTestId("letter-Z").click();
  await expect(page.getByTestId("letter-panel").getByTestId("herb-知母")).toBeVisible();
  await expect(page.getByTestId("letter-panel").getByTestId("herb-炙甘草")).toHaveCount(0);
  await expect(page.getByTestId("letter-panel").getByTestId("herb-炙黄芪")).toHaveCount(0);
  await pickByLetter("G", "甘草", "炙甘草");
  await fillLine(6, { chip: true });

  // 拼音首字母搜索
  await pickBySearch("bz", "白术", "白术");
  await fillLine(9, { note: "另包", chip: true });
  await pickBySearch("dg", "当归", "当归");
  await fillLine(9);

  // 目录里没有的药：新增
  // （药材目录是全局的：同一个本地库上重复跑测试时，鸡血藤可能已经被之前的运行加进去了）
  await page.getByLabel("搜药材").fill("鸡血藤");
  const addNew = page.getByRole("button", { name: "＋ 新增「鸡血藤」" });
  if (await addNew.count()) await addNew.click();
  else await page.getByTestId("letter-panel").getByTestId("herb-鸡血藤").click();
  await fillLine(15, { chip: true });

  expect(await lineNames()).toEqual(["炙黄芪", "党参", "薄荷", "炙甘草", "白术", "当归", "鸡血藤"]);

  // 删除当归
  await page.getByTestId("line-当归").getByRole("button", { name: "删" }).click();
  // 修改党参 12 → 15
  await page.getByTestId("line-党参").getByRole("button", { name: "改" }).click();
  await expect(page.getByTestId("line-editor")).toContainText("已在处方里");
  await expect(page.getByTestId("line-editor").getByLabel("克数")).toHaveValue("12");
  await fillLine(15);
  // 再选一次炙甘草 → 不会多一行，只是更新
  await pickByLetter("G", "甘草", "炙甘草");
  await expect(page.getByTestId("line-editor").getByLabel("克数")).toHaveValue("6");
  await fillLine(6);
  // 炙甘草上移一位
  await page.getByRole("button", { name: "炙甘草 上移" }).click();
  expect(await lineNames()).toEqual(["炙黄芪", "党参", "炙甘草", "薄荷", "白术", "鸡血藤"]);
  await expect(page.getByTestId("line-薄荷")).toContainText("后下；最后 5 分钟放");

  // 克数多打一个 0 → 拦下
  await page.getByTestId("line-党参").getByRole("button", { name: "改" }).click();
  await fillLine(150 * 10);
  await expect(page.getByText("党参 1500g 太多了，请确认")).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByTestId("line-党参").getByRole("button", { name: "改" }).click();
  await fillLine(15);

  // 成本（独立计算）：有进货价的药加起来，白术和鸡血藤没有进货价
  const perDose = 18 * ppg["炙黄芪"] + 15 * ppg["党参"] + 6 * ppg["炙甘草"] + 3 * ppg["薄荷"];
  await expect(page.getByTestId("cost-summary")).toContainText(`每副 $${perDose.toFixed(2)} · 7 剂共 $${(perDose * 7).toFixed(2)}`);
  await expect(page.getByTestId("cost-summary")).toContainText("不含没有进货价的：白术、鸡血藤");
  await expect(page.getByTestId("line-cost-白术")).toHaveText("无进货价");
  await expect(page.getByTestId("line-cost-炙黄芪")).toHaveText(`$${(18 * ppg["炙黄芪"]).toFixed(2)}`);
});

const EXPECTED = [
  `【${CLINIC}】处方`,
  "日期：2026-10-27",
  "患者：张三",
  "共 7 剂",
  "————————",
  "1. 炙黄芪 18g",
  "2. 党参 15g",
  "3. 炙甘草 6g",
  "4. 薄荷 3g（后下；最后 5 分钟放）",
  "5. 白术 9g（另包）",
  "6. 鸡血藤 15g",
  "————————",
  "煎服法：水煎服，日一剂，早晚分服",
  "医嘱：忌生冷",
].join("\n");

test("4. 保存 → 微信消息全文正确、没有价格、可以一键复制", async () => {
  await page.getByLabel("剂数").fill("7");
  await page.getByLabel("日期").fill("2026-10-27");
  await page.getByLabel("医嘱（可选）").fill("忌生冷");
  await page.getByRole("button", { name: "保存并生成消息" }).click();
  await page.waitForURL(/\/prescriptions\/[0-9a-f-]{36}\?new=1$/);

  const box = page.getByTestId("message-box");
  await expect(box).toContainText("处方已保存");
  await expect(page.getByTestId("wechat-message")).toHaveValue(EXPECTED);
  expect(EXPECTED).not.toMatch(/\$/);

  await box.getByRole("button", { name: "复制，粘贴到微信" }).click();
  await expect(box.getByRole("button", { name: "已复制 ✓" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EXPECTED);

  // 数据库里：挂在病人名下、来源 clinic、备注存了
  const id = page.url().split("/").pop()!.split("?")[0];
  const [rx] = await sql<{ source: string; patient: string; notes: string }>(
    "select p.source, pt.name patient, p.notes from prescriptions p join patients pt on pt.id = p.patient_id where p.id = $1",
    [id],
  );
  expect(rx).toEqual({ source: "clinic", patient: "张三", notes: "忌生冷" });
  const notes = await sql<{ name_zh: string; note: string | null }>(
    "select h.name_zh, i.note from prescription_items i join herbs h on h.id = i.herb_id where prescription_id = $1 and i.note is not null order by sort_order",
    [id],
  );
  expect(notes).toEqual([{ name_zh: "薄荷", note: "最后 5 分钟放" }, { name_zh: "白术", note: "另包" }]);
  // 页面上成本是诊所看的，不出现「诊所实付」对比
  await expect(page.getByTestId("cost-section")).toContainText("只有诊所成员看得到");
  await expect(page.getByLabel(/诊所实付/)).toHaveCount(0);
});

test("5. 病历：查到这张处方；从病历再开一张（病人自动选好）", async () => {
  await page.getByTestId("back-to-patient").click();
  await expect(page.getByTestId("patient-name")).toHaveText("张三");
  await expect(page.getByTestId("patient-rx")).toHaveCount(1);
  await expect(page.getByTestId("patient-rx")).toContainText("炙黄芪 18g");
  await page.getByRole("link", { name: "＋ 给 Ta 开新方" }).click();
  await expect(page.getByTestId("selected-patient")).toContainText("张三");
  await pickByLetter("H", "黄芪", "黄芪");
  await fillLine(30, { chip: true });
  await page.getByRole("button", { name: "保存并生成消息" }).click();
  await page.waitForURL(/\?new=1$/);
  await expect(page.getByTestId("wechat-message")).toHaveValue(/1\. 黄芪 30g/);
  await page.getByTestId("back-to-patient").click();
  await expect(page.getByTestId("patient-rx")).toHaveCount(2);
});

test("6. 找病人：按电话后几位；电话重复时提示并可以直接选；只有电话的病人", async () => {
  await page.goto("/clinic/prescribe");
  await page.getByLabel("搜病人").fill("0101");
  await expect(page.getByTestId("patient-result")).toHaveCount(1);
  await expect(page.getByTestId("patient-result")).toContainText("张三");
  await page.getByLabel("搜病人").fill("张");
  await expect(page.getByTestId("patient-result")).toContainText("张三");

  // 同一个电话，不同格式
  await page.getByRole("button", { name: "＋ 新病人" }).click();
  await page.getByLabel("病人姓名").fill("张三丰");
  await page.getByLabel("病人电话").fill("416 555 0101");
  await page.getByRole("button", { name: "保存病人" }).click();
  await expect(page.getByText("这个电话已经有病人了：张三")).toBeVisible();
  await page.getByRole("button", { name: "就用这个病人" }).click();
  await expect(page.getByTestId("selected-patient")).toContainText("张三");

  // 只有电话的病人：消息里显示电话
  await page.getByRole("button", { name: "换一个" }).click();
  await page.getByRole("button", { name: "＋ 新病人" }).click();
  await page.getByLabel("病人电话").fill("647-555-0202");
  await page.getByRole("button", { name: "保存病人" }).click();
  await pickByLetter("D", "党参");
  await fillLine(10, { chip: true });
  await page.getByLabel("煎服法").fill("");
  await page.getByRole("button", { name: "保存并生成消息" }).click();
  await page.waitForURL(/\?new=1$/);
  const msg = await page.getByTestId("wechat-message").inputValue();
  expect(msg).toContain("患者：647-555-0202");
  expect(msg).not.toContain("煎服法");
  expect(msg).not.toContain("医嘱");

  await page.goto("/clinic/patients");
  await expect(page.getByTestId("patient-list").locator("a")).toHaveCount(2);
});

test("7. 和家庭药柜隔离：切回自己的药柜看不到病人和诊所处方；别人更看不到", async ({ browser }) => {
  await page.goto("/");
  await page.getByTestId("workspace-switcher").getByRole("button", { name: /切换到/ }).click();
  await expect(page.getByTestId("workspace-switcher")).toContainText("我们家（我创建的，当前）");
  await expect(page.getByTestId("clinic-badge")).toHaveCount(0);
  await page.goto("/prescriptions");
  await expect(page.getByText("还没有药方")).toBeVisible();
  await page.goto("/clinic/patients");
  await expect(page.getByTestId("create-clinic")).toBeVisible(); // 不在诊所里

  const other = await browser.newPage();
  await signUp(other, { email: `nosy+${RUN}@example.com`, password: "secret-nosy-123" });
  await other.goto("/clinic/patients");
  await expect(other.getByTestId("create-clinic")).toBeVisible();
  const [{ id }] = await sql<{ id: string }>("select id from patients where name = '张三' order by created_at desc limit 1");
  await other.goto(`/clinic/patients/${id}`);
  await expect(other.getByText("找不到这个页面")).toBeVisible();
  await other.close();

  // 切回诊所
  await page.goto("/");
  await page.getByTestId("workspace-switcher").getByRole("button", { name: /切换到 诊所·/ }).click();
  await expect(page.getByTestId("clinic-badge")).toHaveText(CLINIC);
});

test("8. 手机上：开方页、病人页、处方页不横向溢出，首字母按钮点得到", async ({ browser }) => {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await m.goto("/login");
  await m.getByLabel("邮箱").fill(doctor.email);
  await m.getByLabel("密码").fill(doctor.password);
  await m.getByRole("button", { name: "登录" }).click();
  await m.waitForURL(/\/$/);
  const [{ id }] = await sql<{ id: string }>("select id from patients where name = '张三' order by created_at desc limit 1");
  const [{ rx }] = await sql<{ rx: string }>("select id rx from prescriptions where patient_id = $1 order by created_at limit 1", [id]);
  for (const url of ["/clinic/prescribe", "/clinic/patients", `/clinic/patients/${id}`, `/prescriptions/${rx}`]) {
    await m.goto(url);
    await m.waitForLoadState("networkidle");
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await m.goto("/clinic/prescribe");
  await m.getByTestId("letter-H").tap();
  await expect(m.getByTestId("letter-panel").getByTestId("herb-黄芪")).toBeVisible();
  await m.close();
});
