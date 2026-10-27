import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const RUN = process.env.E2E_RUN ?? "dev"; // playwright.config.ts 每次运行生成一个，所有 project 共用
export const users = {
  hao: { email: `hao+${RUN}@example.com`, password: "secret-hao-123" },
  tina: { email: `tina+${RUN}@example.com`, password: "secret-tina-123" },
  stranger: { email: `stranger+${RUN}@example.com`, password: "secret-xx-123" },
};
export const usersFor = (run: string) => ({
  hao: { email: `hao+${run}@example.com`, password: "secret-hao-123" },
  tina: { email: `tina+${run}@example.com`, password: "secret-tina-123" },
  stranger: { email: `stranger+${run}@example.com`, password: "secret-xx-123" },
});

/** 直接查数据库（超级用户，绕过 RLS）——只用于断言 */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function workspaceOf(email: string): Promise<string> {
  const [r] = await sql<{ workspace_id: string }>(
    `select m.workspace_id from workspace_members m join auth.users u on u.id = m.user_id
     where u.email = $1 order by m.created_at limit 1`,
    [email],
  );
  return r.workspace_id;
}

/** 用户当前使用的 workspace（user_settings） */
export async function activeWorkspaceOf(email: string): Promise<string | null> {
  const [r] = await sql<{ ws: string | null }>(
    `select s.active_workspace_id ws from user_settings s join auth.users u on u.id = s.user_id where u.email = $1`,
    [email],
  );
  return r?.ws ?? null;
}

export async function signUp(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(u.email);
  await page.getByLabel("密码").fill(u.password);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page.getByRole("heading", { name: "最近的药方" })).toBeVisible();
}

export async function signIn(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(u.email);
  await page.getByLabel("密码").fill(u.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "最近的药方" })).toBeVisible();
}

/** 解析页面上的 "123 g" / "-4.5 g" */
export const parseGrams = (s: string | null) => Number((s ?? "").replace(/[^\d.-]/g, ""));

/** 在表格式表单里确保至少有 n 行 */
export async function ensureRows(page: Page, inputLabel: string, addButton: string, n: number) {
  const inputs = page.getByLabel(inputLabel, { exact: true });
  while ((await inputs.count()) < n) await page.getByRole("button", { name: addButton }).click();
  return inputs;
}
