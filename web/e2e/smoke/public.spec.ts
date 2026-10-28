/** 不需要登录的线上检查：页面能打开、内部页跳登录、接口拒绝未登录、安全响应头 */
import { expect, test } from "@playwright/test";

test("登录页和学堂能打开", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("邮箱")).toBeVisible();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  const res = await page.goto("/learn");
  expect(res?.status()).toBe(200);
});

test("未登录访问内部页面 → 跳到登录页", async ({ page }) => {
  for (const path of ["/", "/inventory", "/prescriptions/new", "/clinic/prescribe"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/);
  }
});

test("未登录调用识别接口 → 401", async ({ request }) => {
  const res = await request.post("/api/parse-prescription", {
    multipart: { photo: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: "未登录" });
});

test("安全响应头", async ({ request }) => {
  const h = (await request.get("/login")).headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();
});
