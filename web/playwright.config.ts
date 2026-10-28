import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// 读 scripts/local-stack.sh 生成的本地 Supabase-lite 配置
const envFile = path.resolve(__dirname, "../.local/env");
if (!fs.existsSync(envFile)) throw new Error("先运行 scripts/local-stack.sh up（或 scripts/e2e.sh）");
const stackEnv = Object.fromEntries(
  fs
    .readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
for (const [k, v] of Object.entries(stackEnv)) process.env[k] ??= v;

process.env.E2E_RUN ??= Date.now().toString(36); // 每次运行用不同的邮箱，各 project 共用

const PORT = 3100;
const MOCK_PORT = 54400;

export default defineConfig({
  testDir: "./e2e",
  // 线上冒烟测试有自己的配置（playwright.smoke.config.ts）；不排除的话 /clinic\.spec\.ts/ 会把 smoke/clinic.spec.ts 也匹配进来
  testIgnore: "**/smoke/**",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "../.local/playwright-report" }]],
  outputDir: "../.local/test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "zh-CN",
    timezoneId: "America/Toronto",
  },
  projects: [
    { name: "scenario", testMatch: /scenario\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mvp2", testMatch: /mvp2\.spec\.ts/, dependencies: ["scenario"], use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /mobile\.spec\.ts/, dependencies: ["scenario"], use: { ...devices["Pixel 7"] } },
    { name: "isolated", testMatch: /isolated\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "learn", testMatch: /learn\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "clinic", testMatch: /clinic\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: `node e2e/mock-openrouter.mjs`,
      port: MOCK_PORT,
      env: { MOCK_OPENROUTER_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `npx next start -p ${PORT}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...stackEnv,
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/api/v1`,
        OPENROUTER_MODELS: "test/free-vl:free,test/deepseek-vl",
        PARSE_DAILY_LIMIT: "5",
      },
    },
  ],
});
