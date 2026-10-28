// 冒烟测试共用：登录、切到需要的药柜类型
import { expect, type Page } from "@playwright/test";

export type Account = { email: string; password: string };

/** 从环境变量取测试账号；没配置就返回 null（测试跳过） */
export function account(prefix: "SMOKE_PATIENT" | "SMOKE_CLINIC"): Account | null {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}

export async function login(page: Page, a: Account) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(a.email);
  await page.getByLabel("密码").fill(a.password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: `退出登录 ${a.email}` })).toBeVisible(); // 总览页正常（自动建好了药柜）
}

/** 账号同时有家庭和诊所时，切到需要的那个（在总览页点「切换到 …」） */
export async function useWorkspace(page: Page, kind: "household" | "clinic") {
  await page.goto("/");
  const inClinic = (await page.getByTestId("clinic-badge").count()) > 0;
  if (inClinic === (kind === "clinic")) return;
  const btn = page.getByRole("button", { name: kind === "clinic" ? /^切换到 诊所·/ : /^切换到 (?!诊所·)/ }).first();
  if (!(await btn.count())) throw new Error(`这个账号没有${kind === "clinic" ? "诊所" : "家庭药柜"}`);
  await btn.click();
  await expect(page.getByTestId("clinic-badge")).toHaveCount(kind === "clinic" ? 1 : 0);
}
