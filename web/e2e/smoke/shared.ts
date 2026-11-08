// 冒烟测试共用：登录（第一次遇到「选择账号类型」就按账号选好）
import { expect, type Page } from "@playwright/test";

export type Account = { email: string; password: string };

/** 从环境变量取测试账号；没配置就返回 null（测试跳过） */
export function account(prefix: "SMOKE_PATIENT" | "SMOKE_CLINIC"): Account | null {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}

/**
 * 登录，并确认账号类型是 kind。
 * 上线前注册的账号还没选类型，会先到选择页（docs/design/0008 §2.3）：这里按账号选好——
 * 病人账号选家庭、诊所账号选诊所。两个测试账号原来都同时有家庭和诊所，选完另一种就隐藏了。
 */
export async function login(page: Page, a: Account, kind: "household" | "clinic") {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(a.email);
  await page.getByLabel("密码").fill(a.password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/");

  const signOut = page.getByRole("button", { name: `退出登录 ${a.email}` });
  const welcome = page.getByTestId("welcome");
  await expect(signOut.or(welcome).first()).toBeVisible();
  if (await welcome.isVisible()) {
    await welcome.getByLabel(kind === "clinic" ? "我是医生" : "我是病人", { exact: true }).check();
    if (await welcome.getByLabel("诊所名称").count()) throw new Error("诊所测试账号没有诊所，请先手动建好再跑冒烟测试");
    await welcome.getByRole("button", { name: "确定" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/welcome"));
    await page.goto("/");
  }
  await expect(signOut).toBeVisible();
  await expect(page.getByTestId("clinic-badge"), `这个账号应该是${kind === "clinic" ? "诊所" : "家庭"}账号`).toHaveCount(
    kind === "clinic" ? 1 : 0,
  );
}
