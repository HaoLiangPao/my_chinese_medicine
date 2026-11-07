/**
 * 账号类型（docs/design/0008-account-types.md）：注册时选病人（家庭）/ 医生（诊所） → 各自的导航、能打开的页面、用语；
 * 旧账号（同时有家庭和诊所、还没选类型）登录后先选，另一种隐藏、数据不删。
 */
import { expect, test } from "@playwright/test";
import { RUN, signUp, sql } from "./helpers";

const fresh = (name: string) => ({ email: `${name}+${RUN}@example.com`, password: "secret-kind-123" });
const navLabels = (page: import("@playwright/test").Page) => page.getByTestId("nav").getByRole("link").allTextContents();

test("注册不选类型 → 提示；选病人 → 家庭导航（带图标），打不开诊所页面", { tag: ["@ACCT-1", "@ACCT-3"] }, async ({ page }) => {
  const u = fresh("kind-home");
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(u.email);
  await page.getByLabel("密码").fill(u.password);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page.getByText("请选择：你是病人还是医生")).toBeVisible();
  await expect(page.getByTestId("account-kind")).toBeVisible(); // 自动展开

  await signUp(page, u);
  expect(await navLabels(page)).toEqual(["药柜", "药方", "药柜", "采购", "比价", "药材", "学堂"]);
  await expect(page.getByTestId("nav").locator("svg[data-icon]")).toHaveCount(6);
  await expect(page.getByTestId("nav-sep")).toHaveCount(5);
  await expect(page.getByTestId("clinic-badge")).toHaveCount(0);
  await expect(page.getByTestId("family")).toBeVisible();

  for (const url of ["/clinic/prescribe", "/clinic/patients"]) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBe(404);
  }
  expect((await page.goto("/prices"))?.status()).toBe(200);

  const [{ kind, n }] = await sql<{ kind: string; n: string }>(
    `select s.account_kind kind, (select count(*) from workspace_members m where m.user_id = u.id)::text n
     from auth.users u join user_settings s on s.user_id = u.id where u.email = $1`,
    [u.email],
  );
  expect([kind, n]).toEqual(["household", "1"]);
});

test("选诊所要填诊所名称；诊所导航没有比价，/prices 打不开；用语是诊所的", { tag: ["@ACCT-1", "@FIX-5"] }, async ({ page }) => {
  const u = fresh("kind-clinic");
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(u.email);
  await page.getByLabel("密码").fill(u.password);
  await page.getByText("第一次用？先选你是病人还是医生").click();
  await page.getByTestId("account-kind").getByLabel("我是医生", { exact: true }).check();
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page.getByText("请填写诊所名称")).toBeVisible();

  await signUp(page, u, "王医生诊所");
  expect(await navLabels(page)).toEqual(["药柜", "开方", "病人", "处方", "库存", "进货", "学堂"]);
  await expect(page.getByTestId("clinic-badge")).toHaveText("王医生诊所");
  expect((await page.goto("/prices"))?.status()).toBe(404);

  // 总览、库存、进货：诊所用语，没有家庭用语
  await page.goto("/");
  await expect(page.getByRole("link", { name: "＋ 开方" })).toBeVisible();
  await expect(page.getByRole("link", { name: "＋ 记一笔进货" })).toBeVisible();
  // FIX-5：诊所的总览、库存、进货页不出现家庭用语
  const homeWords = ["家庭成员", "家里", "我们家", "录药方", "拍照识别", "副"];
  for (const w of homeWords) await expect(page.locator("main"), `总览页不应出现「${w}」`).not.toContainText(w);
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "库存", exact: true })).toBeVisible();
  await expect(page.getByText("盘点：诊所原本就有的")).toBeVisible();
  for (const w of homeWords) await expect(page.locator("main"), `库存页不应出现「${w}」`).not.toContainText(w);
  await page.goto("/purchases");
  await expect(page.getByRole("heading", { name: "进货", exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("采购");
  await page.goto("/purchases/new");
  await expect(page.getByRole("heading", { name: "记一笔进货" })).toBeVisible();
  for (const w of [...homeWords, "采购"]) await expect(page.locator("main"), `进货页不应出现「${w}」`).not.toContainText(w);
});

test("旧账号（同时有家庭和诊所、没选类型）：登录后先选；选了诊所以后家庭药柜隐藏，数据还在", { tag: ["@ACCT-1"] }, async ({ page }) => {
  const u = fresh("kind-legacy");
  await signUp(page, u);
  await page.goto("/inventory");
  await page.locator('input[name="herb_name"]').fill("黄芪");
  await page.locator('input[name="actual"]').last().fill("100");
  await page.getByRole("button", { name: "录入" }).click();
  await expect(page.getByTestId("stock-黄芪")).toHaveText("100 g");

  const [{ id: homeRx }] = await sql<{ id: string }>(
    `insert into prescriptions (workspace_id, title)
     select m.workspace_id, '家里的旧方' from workspace_members m join auth.users u on u.id = m.user_id where u.email = $1
     returning id`,
    [u.email],
  );

  // 模拟上线前的账号：类型清空，再挂一个诊所
  await sql(
    `with u as (select id from auth.users where email = $1),
          w as (insert into workspaces (name, kind) values ('旧诊所', 'clinic') returning id),
          m as (insert into workspace_members (workspace_id, user_id, role) select w.id, u.id, 'owner' from w, u)
     update user_settings set account_kind = null where user_id = (select id from u)`,
    [u.email],
  );

  await page.goto("/inventory");
  await page.waitForURL(/\/welcome$/);
  await expect(page.getByTestId("has-both")).toBeVisible();
  expect(await navLabels(page)).toEqual(["药柜"]); // 选之前导航只有首页
  await page.getByTestId("account-kind").getByLabel("我是医生", { exact: true }).check();
  await expect(page.getByLabel("诊所名称")).toHaveCount(0); // 已经有诊所，不用填
  await page.getByRole("button", { name: "确定" }).click();
  await page.waitForURL(/\/clinic\/prescribe$/);
  await expect(page.getByTestId("clinic-badge")).toHaveText("旧诊所");

  await page.goto("/");
  await expect(page.getByText(/切换/)).toHaveCount(0); // 没有切换入口，家庭药柜回不去
  await page.goto("/inventory");
  await expect(page.getByTestId("stock-黄芪")).toHaveCount(0);
  // 书签里的旧链接也打不开隐藏的药柜（Detail 在 Suspense 里，流已开始，状态码还是 200，看页面内容）
  await page.goto(`/prescriptions/${homeRx}`);
  await expect(page.getByText("找不到这个页面")).toBeVisible();
  await expect(page.getByText("家里的旧方")).toHaveCount(0);
  await page.goto("/welcome");
  await page.waitForURL((url) => url.pathname === "/"); // 选过了就不能再选

  const [{ grams }] = await sql<{ grams: string }>(
    `select i.on_hand_grams::text grams from v_inventory i join workspaces w on w.id = i.workspace_id
     join workspace_members m on m.workspace_id = w.id join auth.users u on u.id = m.user_id
     where u.email = $1 and w.kind = 'household' and i.name_zh = '黄芪'`,
    [u.email],
  );
  expect(Number(grams)).toBe(100);

  // 重新登录还是诊所
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(u.email);
  await page.getByLabel("密码").fill(u.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "最近的处方" })).toBeVisible();
});

test("注册时类型没存成功 → 选择页提示重选，选完正常", { tag: ["@ACCT-1"] }, async ({ page }) => {
  const u = fresh("kind-retry");
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(u.email);
  await page.getByLabel("密码").fill(u.password);
  await page.getByText("第一次用？先选你是病人还是医生").click();
  await page.getByTestId("account-kind").getByLabel("我是医生", { exact: true }).check();
  // 去掉浏览器的长度限制，让数据库拒绝这个名字
  await page.getByLabel("诊所名称").evaluate((el) => el.removeAttribute("maxlength"));
  await page.getByLabel("诊所名称").fill("诊".repeat(41));
  await page.getByRole("button", { name: "注册" }).click();
  await page.waitForURL(/\/welcome\?retry=1$/);
  await expect(page.getByTestId("retry")).toBeVisible();
  await page.getByLabel("诊所名称").fill("改短的诊所");
  await page.getByRole("button", { name: "确定" }).click();
  await page.waitForURL(/\/clinic\/prescribe$/);
  await expect(page.getByTestId("clinic-badge")).toHaveText("改短的诊所");
});

test("诊所账号的药材页也是诊所用语", { tag: ["@FIX-5"] }, async ({ page }) => {
  await signUp(page, fresh("kind-herbs"), "药材页诊所");
  const [{ id }] = await sql<{ id: string }>("select id from herbs where name_zh = '黄芪'");
  await page.goto("/herbs");
  await expect(page.locator("main")).not.toContainText("药方");
  await page.goto(`/herbs/${id}`);
  await expect(page.getByText("库存存量")).toBeVisible();
  await expect(page.getByRole("heading", { name: "进货记录" })).toBeVisible();
  for (const word of ["药柜", "药方", "购买"]) await expect(page.locator("main")).not.toContainText(word);
});

test("病人账号接受家人邀请：搬进对方药柜，看不到自己原来的；没有切换", { tag: ["@ACCT-2"] }, async ({ browser }) => {
  const a = fresh("kind-sw-a"), b = fresh("kind-sw-b");
  const pa = await browser.newPage();
  await signUp(pa, a);
  const pb = await browser.newPage();
  pb.on("dialog", (d) => d.accept());
  await signUp(pb, b);
  await pb.goto("/inventory");
  await pb.locator('input[name="herb_name"]').fill("党参");
  await pb.locator('input[name="actual"]').last().fill("50");
  await pb.getByRole("button", { name: "录入" }).click();
  await expect(pb.getByTestId("stock-党参")).toHaveText("50 g");

  await pa.goto("/");
  await pa.getByLabel("邀请邮箱").fill(b.email);
  await pa.getByRole("button", { name: "邀请", exact: true }).click();
  await pb.goto("/");
  await pb.getByTestId("incoming-invites").getByRole("button", { name: "接受" }).click();
  await expect(pb.getByTestId("incoming-invites")).toHaveCount(0);
  await pb.goto("/inventory");
  await expect(pb.getByTestId("stock-党参")).toHaveCount(0);

  // 没有切换入口（直接调 set_active_workspace 也会报错，见 SQL account_kind_test）
  await pb.goto("/");
  await expect(pb.getByText(/切换/)).toHaveCount(0);
  await expect(pb.getByTestId("member-list").locator("li")).toHaveCount(2);
  const [{ n }] = await sql<{ n: string }>(
    `select count(*)::text n from workspace_members m join auth.users u on u.id = m.user_id where u.email = $1`,
    [b.email],
  );
  expect(n).toBe("2"); // 成员关系还在（数据不删），只是隐藏
  await pa.close();
  await pb.close();
});
