# my_chinese_medicine · 药柜

记录李医生开的每一张药方、家里每一罐药材，逐步发展成「药方记录 → 医生开方计价 → 比价 → 中医知识库」的综合平台。

| 阶段 | 内容 | 状态 |
|---|---|---|
| **MVP1** | 录药方（拍照识别）、管库存、记采购、煎药记录、按药统计 | ✅ 完成，测试覆盖 |
| **MVP2** | 各家店比价、每副药成本、和诊所对比、药柜价值 | ✅ 完成，测试覆盖 |
| **MVP3** | 药柜学堂（公开科普）：学习路径、阴阳/五行等交互图、中药图鉴、经典选读（原计划的 MVP4，提前） | 🚧 原型：`/learn` |
| **MVP4** | 医生开方：病人档案、首字母选药（炮制品归原药材）、克数/脚注/备注、实时成本（只给医生看）、一键复制微信消息、病历查询 | ✅ 第一版，测试覆盖 |

设计文档在 [`docs/design/`](docs/design/)：[0001 MVP1](docs/design/0001-mvp1.md) · [0002 煎药记录与测试体系](docs/design/0002-decoctions-and-testing.md) · [0003 MVP2 比价](docs/design/0003-mvp2-pricing.md) · [0004 独立代码审查与修复](docs/design/0004-security-review.md) · [0005 学堂与动态图](docs/design/0005-learn-and-visuals.md) · [0006 医生开方](docs/design/0006-clinic-prescribing.md)。

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

需要：Linux x64、PostgreSQL 16+（`sudo apt install postgresql`）、**Node 22.12 以上**（建议用 nvm：`nvm install 22 && nvm use`，仓库里有 `.nvmrc`）。**不要用 root 跑**。

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
| 单元测试（Vitest） | 121 | `cd web && npm test` |
| SQL 测试 | 6 个文件，约 210 条断言 | `scripts/test-db.sh` |
| E2E（Playwright） | 45 | `scripts/e2e.sh`，只跑一组：`scripts/e2e.sh --project=isolated` |

E2E 的完整场景：10 张常用药方、5 家药行不同价格的采购、9 次煎药（多用、没放、处方外加药、缺货变负、撤销……）、称重校准、删除药方，最后和独立计算的账本逐味对账。详见 [0002](docs/design/0002-decoctions-and-testing.md)。失败时的截图和 trace 在 `.local/test-results/`，报告在 `.local/playwright-report/`。

## 上线到 Supabase

1. 在 [supabase.com](https://supabase.com) 新建项目（区域建议选 Canada Central）。
2. 本地运行 `scripts/bundle-sql.sh`，它会把所有 migration 和 seed 合并成 `.local/supabase-all.sql`。在 SQL Editor → New query 里粘贴全部内容，点 Run（整个文件在一个事务里，失败会全部回滚）。只适用于全新项目；以后新增的 migration 单独执行那一个文件。
3. Authentication → Providers → Email：自己家用的话可以关掉 "Confirm email"。Authentication → URL Configuration：Site URL 填 Vercel 的网址。
4. `web/.env.local` 换成项目的 URL 和 publishable key（参考 `web/.env.example`）。

## 第一次使用

1. 注册账号 → 自动创建「我们家」药柜
2. 在总览页「家庭成员」里输入家人的邮箱发邀请；对方注册/登录后在总览页点「接受」，就共用一个药柜了（对方可以随时退出）
3. 去「药柜」页把家里已有的药材称重录入
4. 拍一张药方试试识别；煎药时在药方详情页记录（实际用量可以和处方不一样）
5. 记几笔采购后，「比价」页和药方的「成本」部分就有数据了
6. 医生：总览页底部「我是医生：创建诊所」→ 进入诊所模式（导航变成 开方 / 病人 / 处方 / 库存 / 进货），在总览页可以随时切回家里的药柜

## 部署

`web/` 目录直接部署到 Vercel（Root Directory 设为 `web`），在 Vercel 里配环境变量：

| 变量 | 必填 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | 同上（publishable / anon key，不是 service_role） |
| `ANTHROPIC_API_KEY` | 拍照识别要用 | |
| `ANTHROPIC_MODEL` | 可选 | 默认 `claude-sonnet-5-5` |
| `PARSE_DAILY_LIMIT` | 可选 | 每人每天识别次数上限 |
