import { defineConfig, devices } from "@playwright/test";

// 线上冒烟测试：不启动本地服务，直接测 SMOKE_BASE_URL（默认生产环境）。
// 设计见 docs/design/0007-ci-cd.md。用法：npm run smoke（可选 SMOKE_PATIENT_* / SMOKE_CLINIC_* 账号跑登录后的流程）
export default defineConfig({
  testDir: "./e2e/smoke",
  fullyParallel: false,
  workers: 1,
  retries: 1, // 冷启动偶尔会慢
  timeout: 60_000,
  reporter: [["list"], ["html", { outputFolder: "../.local/smoke-report", open: "never" }]],
  outputDir: "../.local/smoke-results",
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "https://mychinesemedicine.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
