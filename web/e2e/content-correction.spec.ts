/**
 * 信息纠错（PLAT-5，docs/design/0021）：药材页「信息有误？」、学堂「这题有误？」→ 同一个反馈面板 → 管理员看板。
 * 期望值都在这里独立写出来（字段的中文名、哪些字段、数据库里应该是什么），不读 App 里的函数。
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";
import { RUN, signIn, signUp, sql } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOTS = path.resolve(__dirname, "../../.local/screenshots");
const SLACK = "http://127.0.0.1:54400/__slack";
const me = { email: `fix-home+${RUN}@example.com`, password: "secret-fix-123" };
const other = { email: `fix-other+${RUN}@example.com`, password: "secret-fix-456" };
const admin = { email: `fix-admin+${RUN}@example.com`, password: "secret-fix-789" };
const FIX = `麻黄应该是辛、微苦，温 ${RUN}`;
const EVIDENCE = "《中国药典》2020 年版一部";
const QUIZ_FIX = `这题的答案应该是另一个 ${RUN}`;

type Row = {
  id: string;
  reporter_id: string;
  workspace_id: string | null;
  kind: string;
  subject_type: string | null;
  subject_herb_id: string | null;
  subject_question_id: string | null;
  field: string | null;
  description: string;
  evidence: string | null;
  page_path: string;
  user_agent: string | null;
  viewport: string | null;
  recent_actions: unknown[];
  recent_errors: unknown[];
  status: string;
};
const reportsBy = (desc: string) => sql<Row>("select * from bug_reports where description = $1", [desc]);
const userId = async (email: string) => (await sql<{ id: string }>("select id from auth.users where email = $1", [email]))[0].id;
const herbId = async (name: string) => (await sql<{ id: string }>("select id from herbs where name_zh = $1", [name]))[0].id;

const panel = (p: Page) => p.getByTestId("bug-report-panel");
const send = (p: Page) => panel(p).getByRole("button", { name: "提交" });
// 设计文档 0021 §3.2 的表：药材页有资料、显示默认照片时的全部字段
const HERB_FIELDS = [
  "药名",
  "拼音",
  "别名",
  "功效分类",
  "来源（植物 / 动物 / 矿物……）",
  "入药部位",
  "原药材 / 炮制品的对应",
  "性味归经",
  "其他资料（功效、炮制、产区、毒性、使用注意等）",
  "照片",
  "其他",
];
const QUIZ_FIELDS = ["题干", "选项", "答案", "解析", "出处", "其他"];

let page: Page;
let mahuang: string;
let herbReport: Row;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  mahuang = await herbId("麻黄");
});
test.afterAll(async () => {
  await page.close();
});

test("1. 药材页「信息有误？」：面板带上这味药；没选哪一项不能提交；数据库里每个字段都对", { tag: ["@PLAT-5"] }, async () => {
  await signUp(page, me);
  await page.goto(`/herbs/${mahuang}`);
  await page.getByTestId("correction-open").click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAccessibleName("指出信息错误");
  await expect(panel(page).getByTestId("correction-subject")).toHaveText("关于：麻黄");
  const field = panel(page).getByLabel("哪一项有误？");
  await expect(field.locator("option")).toHaveText(["请选择", ...HERB_FIELDS]); // 麻黄有资料、有默认照片
  await expect(panel(page).getByTestId("correction-attached")).toHaveText(
    "会附带：这味药、你选的那一项、当前页面的路径。不带操作记录和浏览器信息。",
  );

  // 没选、没写都不能提交
  await expect(send(page)).toBeDisabled();
  await panel(page).getByLabel("应该是什么？").fill(FIX);
  await expect(send(page)).toBeDisabled();
  await field.selectOption({ label: "性味归经" });
  await panel(page).getByLabel("依据（可选）").fill(EVIDENCE);
  await page.screenshot({ path: `${SHOTS}/信息纠错-药材页面板.png` });
  await send(page).click();
  await expect(panel(page).getByTestId("bug-report-ok")).toContainText("已收到，谢谢！");

  const rows = await reportsBy(FIX);
  expect(rows).toHaveLength(1);
  herbReport = rows[0];
  expect(herbReport).toMatchObject({
    reporter_id: await userId(me.email),
    kind: "content",
    subject_type: "herb",
    subject_herb_id: mahuang,
    subject_question_id: null,
    field: "properties",
    evidence: EVIDENCE,
    page_path: `/herbs/${mahuang}`,
    status: "new",
    // 纠错不带药柜、浏览器、操作记录、前端错误（0021 §4）
    workspace_id: null,
    user_agent: null,
    viewport: null,
    recent_actions: [],
    recent_errors: [],
  });
  await expect(panel(page).getByTestId("bug-report-ok")).toContainText(herbReport.id.slice(0, 8));

  // 关掉再点右下角「反馈问题」：回到程序问题的面板
  await panel(page).getByRole("button", { name: "关闭" }).click();
  await page.getByTestId("bug-report-open").click();
  await expect(panel(page)).toHaveAccessibleName("反馈问题");
  await expect(panel(page).getByLabel("遇到了什么问题？")).toBeVisible();
  await expect(panel(page).getByTestId("correction-form")).toHaveCount(0);
  await panel(page).getByRole("button", { name: "关闭" }).click();
});

test("2. Slack（假 webhook）：多一行「类型：信息纠错」，没有建议、依据、药名", { tag: ["@PLAT-5"] }, async () => {
  let mine: { text: string }[] = [];
  await expect
    .poll(async () => {
      const all = (await (await fetch(SLACK)).json()) as { text: string }[];
      mine = all.filter((m) => m.text.includes(herbReport.id));
      return mine.length;
    })
    .toBe(1);
  expect(mine[0].text.split("\n")).toEqual([
    `📝 新的信息纠错 ${herbReport.id}`,
    "类型：信息纠错",
    `页面：/herbs/${mahuang}`,
    expect.stringMatching(/^时间：\d{4}-\d{2}-\d{2}/),
  ]);
  for (const secret of ["辛、微苦", "药典", "麻黄", "性味"]) expect(mine[0].text).not.toContain(secret);
});

test("3. 学堂：答完「这题有误？」→ 记的是这道题；没有资料和照片的药少几项", { tag: ["@PLAT-5"] }, async () => {
  await page.goto("/learn/quiz/practice?topic=wuxing");
  const card = page.getByTestId("quiz-question");
  const qid = await card.getAttribute("data-question-id");
  expect(qid).toMatch(/^wuxing-\d{3}$/);
  const stem = (await sql<{ stem: string }>("select stem from quiz_questions where id = $1", [qid]))[0].stem;
  await expect(card.getByTestId("correction-open")).toHaveCount(0); // 答完才有
  await card.getByTestId("quiz-option-0").click();
  await expect(card.getByTestId("quiz-result")).toBeVisible();
  await card.getByTestId("correction-open").click();
  // 题干超过 60 字时面板里截断
  await expect(panel(page).getByTestId("correction-subject")).toHaveText(`关于这道题：${[...stem].slice(0, 60).join("")}`);
  await expect(panel(page).getByLabel("哪一项有误？").locator("option")).toHaveText(["请选择", ...QUIZ_FIELDS]);
  await expect(panel(page).getByTestId("correction-attached")).toContainText("会附带：这道题、");
  await panel(page).getByLabel("哪一项有误？").selectOption({ label: "答案" });
  await panel(page).getByLabel("应该是什么？").fill(QUIZ_FIX);
  await send(page).click();
  await expect(panel(page).getByTestId("bug-report-ok")).toBeVisible();
  expect(await reportsBy(QUIZ_FIX)).toMatchObject([
    {
      kind: "content",
      subject_type: "quiz_question",
      subject_question_id: qid,
      subject_herb_id: null,
      field: "answer",
      evidence: null,
      page_path: "/learn/quiz/practice?topic",
      recent_actions: [],
    },
  ]);
  await panel(page).getByRole("button", { name: "关闭" }).click();

  // 没有资料、没有默认照片的药（青蒿：herb-monographs.json 和 herb-photos.json 里都没有）：没有「性味归经」「其他资料」「照片」
  await page.goto(`/herbs/${await herbId("青蒿")}`);
  await page.getByTestId("correction-open").click();
  await expect(panel(page).getByTestId("correction-subject")).toHaveText("关于：青蒿");
  await expect(panel(page).getByLabel("哪一项有误？").locator("option")).toHaveText([
    "请选择",
    ...HERB_FIELDS.filter((f) => !["性味归经", "其他资料（功效、炮制、产区、毒性、使用注意等）", "照片"].includes(f)),
  ]);
  // 同一味药再点，写了一半的还在
  await panel(page).getByLabel("应该是什么？").fill("写了一半");
  await panel(page).getByRole("button", { name: "关闭" }).click();
  await page.getByTestId("correction-open").click();
  await expect(panel(page).getByLabel("应该是什么？")).toHaveValue("写了一半");
  await panel(page).getByRole("button", { name: "关闭" }).click();
});

test("4. 没登录：学堂答完没有「这题有误？」，提示登录后可以指出错误", { tag: ["@PLAT-5"] }, async ({ browser }) => {
  const anon = await browser.newPage();
  await anon.goto("/learn");
  const card = anon.getByTestId("daily-quiz");
  await card.getByTestId("quiz-option-0").click();
  await expect(card.getByTestId("quiz-result")).toBeVisible();
  await expect(card.getByTestId("quiz-login-hint")).toHaveText("登录后可以记录和复习，也可以指出错误。");
  await expect(anon.getByTestId("correction-open")).toHaveCount(0);
  await expect(anon.getByTestId("bug-report-open")).toHaveCount(0);
  await anon.close();
});

test(
  "5. 管理员看板：按类型筛选；纠错显示药名、哪一项、建议、依据；被两个人指出的排在汇总第一；改成「已改」",
  { tag: ["@PLAT-5"] },
  async ({ browser }) => {
    // 另一个人也指出麻黄（直接写库，和页面上提交的一样：不带诊断信息）；再来一条程序问题
    const op = await browser.newPage();
    await signUp(op, other);
    await op.close();
    const OTHER_FIX = `麻黄的拼音不对 ${RUN}`;
    const BUG = `程序问题 ${RUN}`;
    await sql(
      `insert into bug_reports (reporter_id, kind, subject_type, subject_herb_id, field, page_path, description)
     values ($1, 'content', 'herb', $2, 'pinyin', $3, $4)`,
      [await userId(other.email), mahuang, `/herbs/${mahuang}`, OTHER_FIX],
    );
    await sql("insert into bug_reports (reporter_id, page_path, description) values ($1, '/prescriptions/new', $2)", [
      await userId(other.email),
      BUG,
    ]);

    const ap = await browser.newPage();
    await signUp(ap, admin);
    await sql("insert into platform_admins (user_id, note) select id, 'E2E' from auth.users where email = $1", [admin.email]);
    try {
      // 期望的计数：从库里独立数（别的 E2E 也会留下反馈）
      const [{ bug, content }] = await sql<{ bug: number; content: number }>(
        `select count(*) filter (where kind = 'bug')::int bug, count(*) filter (where kind = 'content')::int content
       from (select kind from bug_reports order by created_at desc limit 500) r`,
      );
      // 麻黄被指出几次、几次没处理：也从库里独立数（这次是两个人各一条；同一个库上重跑会更多）
      const mahuangCounts = async () =>
        (
          await sql<{ total: number; open: number; fixed: number }>(
            `select count(*)::int total, count(*) filter (where status in ('new', 'in_progress'))::int open,
                    count(*) filter (where status = 'fixed')::int fixed
             from (select * from bug_reports order by created_at desc limit 500) r where subject_herb_id = $1`,
            [mahuang],
          )
        )[0];
      const mh = await mahuangCounts();
      expect(mh.total).toBeGreaterThanOrEqual(2);
      await ap.goto("/admin/bugs");
      const kinds = ap.getByTestId("admin-bug-kind-filter");
      await expect(kinds.getByRole("link")).toHaveText([`全部类型（${bug + content}）`, `程序问题（${bug}）`, `信息纠错（${content}）`]);
      // 全部类型时两种都在
      await expect(ap.getByTestId("admin-bug").filter({ hasText: BUG })).toHaveCount(1);
      await expect(ap.getByTestId("admin-bug").filter({ hasText: FIX })).toHaveCount(1);

      await kinds.getByRole("link", { name: /^程序问题/ }).click();
      await expect(ap).toHaveURL(/\/admin\/bugs\?kind=bug$/);
      await expect(ap.getByTestId("admin-bug").filter({ hasText: BUG })).toHaveCount(1);
      await expect(ap.getByTestId("admin-bug").filter({ hasText: FIX })).toHaveCount(0);
      await expect(ap.getByTestId("admin-correction-subjects")).toHaveCount(0);

      await kinds.getByRole("link", { name: /^信息纠错/ }).click();
      await expect(ap).toHaveURL(/\/admin\/bugs\?kind=content$/);
      await expect(ap.getByTestId("admin-bug").filter({ hasText: BUG })).toHaveCount(0);
      // 状态的叫法：已改 / 不改
      await expect(ap.getByTestId("admin-bug-filter").getByRole("link")).toContainText(["全部", "新", "处理中", "已改", "不改"]);
      // 汇总：麻黄被两个人指出、都没处理，别的药 / 题都只有一条 → 第一
      const first = ap.getByTestId("admin-correction-subject-row").first();
      await expect(first).toContainText("药材 麻黄");
      await expect(first.getByTestId("admin-correction-subject-count")).toHaveText(`被指出 ${mh.total} 次 · 未处理 ${mh.open}`);

      const card = ap.getByTestId("admin-bug").filter({ hasText: FIX });
      await expect(card.getByTestId("admin-bug-kind")).toHaveText("信息纠错");
      await expect(card.getByTestId("admin-correction-subject")).toHaveText("麻黄");
      await expect(card.getByTestId("admin-correction-subject").getByRole("link")).toHaveAttribute("href", `/herbs/${mahuang}`);
      await expect(card.getByTestId("admin-correction-field")).toHaveText("性味归经");
      await expect(card.getByTestId("admin-bug-description")).toHaveText(FIX);
      await expect(card.getByTestId("admin-correction-evidence")).toHaveText(EVIDENCE);
      await expect(card.getByTestId("admin-correction-count")).toContainText(`这味药被指出 ${mh.total} 次（未处理 ${mh.open}）`);
      await expect(card.getByText("诊断信息")).toHaveCount(0); // 纠错没有诊断信息
      const quizCard = ap.getByTestId("admin-bug").filter({ hasText: QUIZ_FIX });
      await expect(quizCard.getByTestId("admin-correction-subject")).toContainText(/^题目 wuxing-\d{3}：/);
      await expect(quizCard.getByTestId("admin-correction-field")).toHaveText("答案");
      await expect(quizCard.getByTestId("admin-correction-evidence")).toHaveText("—");
      await ap.screenshot({ path: `${SHOTS}/信息纠错-管理员看板.png`, fullPage: true });

      // 按对象筛选：只剩麻黄的
      await first.getByRole("link").click();
      await expect(ap).toHaveURL(`/admin/bugs?kind=content&subject=herb%3A${mahuang}`);
      await expect(ap.getByTestId("admin-correction-only")).toContainText("只看：麻黄");
      await expect(ap.getByTestId("admin-bug")).toHaveCount(mh.total);
      await expect(ap.getByTestId("admin-bug").filter({ hasText: OTHER_FIX }).getByTestId("admin-correction-field")).toHaveText("拼音");

      // 改成「已改」：数据库里是 fixed；未处理少一次
      await card.getByLabel("状态").selectOption({ label: "已改" });
      await card.getByRole("button", { name: "保存" }).click();
      await expect(card.getByTestId("admin-bug-status")).toHaveText("已改");
      expect((await reportsBy(FIX))[0].status).toBe("fixed");
      await expect(card.getByTestId("admin-correction-count")).toContainText(`这味药被指出 ${mh.total} 次（未处理 ${mh.open - 1}）`);
      await ap.getByTestId("admin-bug-filter").getByRole("link", { name: /^已改/ }).click();
      await expect(ap).toHaveURL(`/admin/bugs?kind=content&status=fixed&subject=herb%3A${mahuang}`);
      await expect(ap.getByTestId("admin-bug")).toHaveCount(mh.fixed + 1);
      expect(await mahuangCounts()).toEqual({ total: mh.total, open: mh.open - 1, fixed: mh.fixed + 1 });
    } finally {
      await sql("delete from platform_admins where user_id = (select id from auth.users where email = $1)", [admin.email]);
      await ap.close();
    }
  },
);

const phone = (browser: Browser) => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test("6. 手机 390px：入口按钮 ≥ 44px 高，面板不横向溢出", { tag: ["@PLAT-5"] }, async ({ browser }) => {
  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await signIn(p, me);

  const noOverflow = async (where: string) =>
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), where).toBeLessThanOrEqual(0);
  await p.goto(`/herbs/${mahuang}`);
  const btn = p.getByTestId("correction-open");
  await expect(btn).toBeVisible();
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await p.screenshot({ path: `${SHOTS}/信息纠错-药材页-手机.png` });
  await btn.click();
  await expect(panel(p)).toBeVisible();
  await noOverflow("药材页的纠错面板");
  await p.screenshot({ path: `${SHOTS}/信息纠错-面板-手机.png` });
  await panel(p).getByRole("button", { name: "关闭" }).click();

  await p.goto("/learn/quiz/practice?topic=zangfu");
  const card = p.getByTestId("quiz-question");
  await card.getByTestId("quiz-option-0").click();
  await expect(card.getByTestId("quiz-result")).toBeVisible();
  const qb = card.getByTestId("correction-open");
  await expect(qb).toBeVisible();
  expect((await qb.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await noOverflow("学堂答完");
  await qb.click();
  await expect(panel(p)).toBeVisible();
  await noOverflow("学堂的纠错面板");
  await p.screenshot({ path: `${SHOTS}/信息纠错-学堂-手机.png` });
  await ctx.close();
});
