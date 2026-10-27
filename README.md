# my_chinese_medicine · 药柜

记录李医生开的每一张药方、家里每一罐药材，逐步发展成「药方记录 → 医生开方计价 → 比价 → 中医知识库」的综合平台。

| 阶段 | 内容 | 状态 |
|---|---|---|
| **MVP1** | 录药方（拍照识别）、管库存、记采购、按药统计 | 🚧 进行中 |
| MVP2 | 每副药成本、各家店比价 | 计划中 |
| MVP3 | 多用户：医生角色，开方时自动计价 | 计划中 |
| MVP4 | 知识库：药材资料、方剂解读（RAG）、科普 | 计划中 |

设计文档在 [`docs/design/`](docs/design/)，从 [0001-mvp1](docs/design/0001-mvp1.md) 开始看。

## 目录结构

```
docs/design/        设计文档（每个决定一份，编号递增）
supabase/
  migrations/       数据库 schema（按时间戳命名）
  seed.sql          常用药材 + 炮制品 + 别名
  tests/            SQL 测试
scripts/test-db.sh  本地一次性 Postgres 跑 schema 测试
web/                Next.js 16 应用
```

## 本地跑起来

### 1. 建 Supabase 项目

1. 在 [supabase.com](https://supabase.com) 新建项目（区域建议选 Canada Central）。
2. 打开 SQL Editor，依次执行：
   - `supabase/migrations/20261027000001_init.sql`
   - `supabase/seed.sql`
3. Authentication → Providers → Email：自己家用的话，可以关掉 "Confirm email"，注册后直接登录。

（如果装了 [Supabase CLI](https://supabase.com/docs/guides/cli)，也可以 `supabase link` 后 `supabase db push`。）

### 2. 配环境变量并启动

```bash
cd web
cp .env.example .env.local   # 填上 Supabase URL / publishable key / Anthropic API key
npm install
npm run dev                  # http://localhost:3000
```

### 3. 第一次使用

1. 注册账号 → 自动创建「我们家」药柜
2. 让家人也注册，然后在总览页输入 Ta 的邮箱，拉进同一个药柜
3. 去「药柜」页把家里已有的药材称重录入
4. 拍一张药方试试识别

## 测试

```bash
scripts/test-db.sh      # 需要本机装 PostgreSQL（不需要 Docker），不能用 root 跑
cd web && npm run lint && npm run build
```

## 部署

`web/` 目录直接部署到 Vercel（Root Directory 设为 `web`），在 Vercel 里配同样的环境变量。
