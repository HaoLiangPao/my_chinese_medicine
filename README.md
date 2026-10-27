# my_chinese_medicine · 药柜

记录李医生开的每一张药方、家里每一罐药材，逐步发展成「药方记录 → 医生开方计价 → 比价 → 中医知识库」的综合平台。

| 阶段 | 内容 | 状态 |
|---|---|---|
| **MVP1** | 录药方（拍照识别）、管库存、记采购、煎药记录、按药统计 | ✅ 完成，测试覆盖 |
| **MVP2** | 各家店比价、每副药成本、和诊所对比、药柜价值 | ✅ 完成，测试覆盖 |
| MVP3 | 多用户：医生角色，开方时自动计价 | 计划中 |
| MVP4 | 知识库：药材资料、方剂解读（RAG）、科普 | 计划中 |

设计文档在 [`docs/design/`](docs/design/)：[0001 MVP1](docs/design/0001-mvp1.md) · [0002 煎药记录与测试体系](docs/design/0002-decoctions-and-testing.md) · [0003 MVP2 比价](docs/design/0003-mvp2-pricing.md)。

## 目录结构

```
docs/design/            设计文档（每个决定一份，编号递增）
supabase/
  migrations/           数据库 schema（按时间戳命名，只加不改）
  seed.sql              常用药材 + 炮制品 + 别名
  tests/                SQL 测试（*_test.sql，每个文件一个全新数据库）
  local/bootstrap.sql   本地 Supabase-lite 的角色
scripts/
  local-stack.sh        本地 Supabase-lite：Postgres + Auth + PostgREST + 存储网关（不需要 Docker）
  test-all.sh           全部测试
  test-db.sh            SQL 测试
  e2e.sh                E2E 测试
web/                    Next.js 16 应用
  src/lib/*.test.ts     单元测试
  e2e/                  Playwright E2E（场景数据在 e2e/fixtures/）
```

## 本地跑起来（不需要 Supabase 账号）

需要：Linux x64、PostgreSQL 16+（`sudo apt install postgresql`）、Node 20+。**不要用 root 跑**。

```bash
scripts/local-stack.sh up     # 启动本地 Supabase-lite，会自动写好 web/.env.local
cd web && npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local   # 可选：拍照识别要用
npm run dev                   # http://localhost:3000
# 用完：scripts/local-stack.sh down（每次 up 都会清空数据）
```

## 测试

```bash
cd web && npm install && npx playwright install chromium   # 第一次
scripts/test-all.sh           # 类型检查 → lint → 单元测试 → SQL 测试 → E2E
```

| 层 | 数量 | 单独跑 |
|---|---|---|
| 单元测试（Vitest） | 59 | `cd web && npm test` |
| SQL 测试 | 4 个文件，约 135 条断言 | `scripts/test-db.sh` |
| E2E（Playwright） | 28 | `scripts/e2e.sh`，只跑一组：`scripts/e2e.sh --project=isolated` |

E2E 的完整场景：10 张常用药方、5 家药行不同价格的采购、9 次煎药（多用、没放、处方外加药、缺货变负、撤销……）、称重校准、删除药方，最后和独立计算的账本逐味对账。详见 [0002](docs/design/0002-decoctions-and-testing.md)。失败时的截图和 trace 在 `.local/test-results/`，报告在 `.local/playwright-report/`。

## 上线到 Supabase

1. 在 [supabase.com](https://supabase.com) 新建项目（区域建议选 Canada Central）。
2. SQL Editor 里按顺序执行 `supabase/migrations/*.sql`，再执行 `supabase/seed.sql`（或者用 Supabase CLI：`supabase link` 后 `supabase db push`）。
3. Authentication → Providers → Email：自己家用的话可以关掉 "Confirm email"。
4. `web/.env.local` 换成项目的 URL 和 publishable key（参考 `web/.env.example`）。

## 第一次使用

1. 注册账号 → 自动创建「我们家」药柜
2. 让家人也注册，然后在总览页输入 Ta 的邮箱，拉进同一个药柜
3. 去「药柜」页把家里已有的药材称重录入
4. 拍一张药方试试识别；煎药时在药方详情页记录（实际用量可以和处方不一样）
5. 记几笔采购后，「比价」页和药方的「成本」部分就有数据了

## 部署

`web/` 目录直接部署到 Vercel（Root Directory 设为 `web`），在 Vercel 里配同样的环境变量。
