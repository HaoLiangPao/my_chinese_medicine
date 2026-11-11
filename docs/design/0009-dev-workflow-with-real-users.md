# 0009 · 有真实用户之后的开发流程

- 状态：流程已生效。2026-11-07 Hao 决定：先用免费计划 + 每天导出到本地（§4）；李医生还在试用阶段，换区域和清理数据等正式使用前再做（§6）
- 日期：2026-11-06
- 作者：Hao、Claude

## 1. 背景

2026-11-06 起，李医生开始用生产环境（https://mychinesemedicine.vercel.app），里面会有**真实的病人和处方**。在这之前出错最多是测试数据乱掉；从现在开始，出错会影响她看诊，丢数据就是丢病历。

现在的条件：
- 只有一个环境（生产）
- Supabase 免费计划：**没有自动备份**；一周没有访问会暂停项目（每天的冒烟测试会访问，一般不会触发）
- 区域 us-east-1
- 上线流程见 0007：合并到 `main` → 测试 → `supabase db push` → `vercel deploy --prod` → 冒烟测试

## 2. 日常流程

```
1. 开分支
2. docs/features.md：加一行（⬜），写清楚验收 E2E 要测什么
3. 改数据模型？→ 先写设计文档 docs/design/NNNN-*.md（CLAUDE.md 的规则）
4. 写代码 + 单元 / SQL / E2E 测试，测试带上功能编号的 tag，状态改成 ✅
5. 本地：scripts/test-all.sh 全过；scripts/local-stack.sh up + npm run dev 自己点一遍
6. 开 PR → CI 跑全部测试。改了前端的，PR 正文贴截图（`scripts/pr-screenshots.sh`，见 CLAUDE.md）
7. 合并 → （批准）→ migration → 部署 → 线上冒烟测试
8. 自己用测试账号在线上看一眼新功能
```

**「预览」就是本地环境。** `scripts/local-stack.sh` 是一个完整的 Supabase 替身：数据库、登录、API 都有，每次启动都从空库跑一遍全部 migration。新功能先在本地看，效果和 Vercel 的预览一样，而且碰不到真实数据。

现在**不用 Vercel Preview**，原因：
- Preview 只能连生产数据库，PR 里的 migration 还没执行，看到的结果不可信
- 在预览里试用新功能，会把测试数据写进有真实病人的库

等有了 staging（§5）再加。

### 每次上线的回归测试（从空库开始）

每个 PR 和每次合并到 `main`，CI 都先跑 `scripts/test-all.sh`，**全过才会部署**（0007）。E2E 每次都从空库开始，按真实用户的顺序一步一步做，后一步用前一步的数据，期望值都在 `e2e/fixtures/` 里独立算好：

| 流程 | 步骤 | 文件 |
|---|---|---|
| 家庭 | 注册账号 → 邀请家人 → 录 10 张药方 → 第一次盘点 → 五家药行采购 → 煎药（各种边界情况）→ 非法输入 → 称重校准、删药方 → 对账（数据库、药柜页面、使用统计）→ 隔离 | `scenario.spec.ts` |
| 比价 | 接着上面的数据：比价、药方成本、和诊所实付比较、药柜价值、在诊所买药 | `mvp2.spec.ts` |
| 诊所 | 医生注册、建诊所 → 进货 → 新病人 + 开方 → 微信消息 → 病历、再开一张 → 找病人 → 和家庭隔离 → 手机 | `clinic.spec.ts` |

规则：
- 改了已有的行为，E2E 跟着改，PR 里写清楚为什么改；**不能为了让测试通过去改期望值**
- 新功能把自己的步骤加进对应的流程（或者在 `isolated.spec.ts` 里单独测），在 `docs/features.md` 标上编号


## 3. 改数据库（schema）

### 规则（0007 §3 已有，这里加上「有数据」之后的要求）

1. **只加新的 migration**，已上线的不改（CI 会检查）。
2. **先扩展、后收缩**：migration 先上线，代码后上线，所以每个 migration 都必须让**正在线上跑的旧代码**继续能用。
   - 可以一步做的：加表、加可以为空的列、加函数、加索引
   - 要分几次上线的：删列、改名、改函数参数、把列改成必填
3. **迁移已有数据**（backfill）写在 migration 里，要满足：
   - 重复执行结果一样
   - 在有数据的库上测过（见下面「带数据的升级测试」）
4. 新表一定要有 RLS 和 SQL 测试（不同药柜之间看不到），和 `patients` 一样。
5. 部署日志里先看 `supabase db push --dry-run` 打印的将要执行的 migration，和预期一致。

### 例子：医生改成下拉选择（RX-6）

| 上线 | 数据库 | 代码 | 旧代码还能用吗 |
|---|---|---|---|
| 第 1 次 | 加 `prescribers` 表；`prescriptions` 加可以为空的 `prescriber_id`；把已有的 `prescriber` 文字按药柜去重，生成医生记录，回填 `prescriber_id` | 读写新字段，同时继续写文字字段 | 能：旧代码只用文字字段 |
| 第 2 次（确认没问题以后） | 不动 | 不再写文字字段 | — |
| 以后（可以不做） | 删掉文字字段 | — | — |

### 带数据的升级测试（✅ `scripts/test-upgrade.sh`，2026-11-07 随 ACCT-1 加入）

SQL 测试和 E2E 都在**空库**上跑 migration。线上的库有数据，有些 migration 在空库上没问题、遇到真实数据会失败，比如：
- 加唯一约束，但已有重复数据
- 回填时漏掉了某种情况

`scripts/test-upgrade.sh`（在 `test-all.sh` 里，CI 每个 PR 都跑；相对 `origin/main` 没有新 migration 时跳过）：
1. 用 `main` 上的 migration 建库
2. 灌一份「像线上一样」的数据（`supabase/tests/upgrade/fixture.sql`）：家庭和诊所都有，有病人、处方、采购、煎药，还有老账号同时有两个药柜这样的边界情况。用脚本生成，**不用线上的真实数据**
3. 执行这个 PR 新增的 migration
4. 检查：
   - 各表行数不少、库存流水的合计不变、成员关系和当前药柜不变（`compare.sql`，通用）
   - 这个 migration 在有数据的库上的行为：`supabase/tests/upgrade/<和 migration 同名>.sql`，只在这个 migration 是新增的时候跑（迁移已有数据的 migration 必须写）

维护：
- `fixture.sql` 只能用 `main` 上已有的表和函数（它是在旧库上跑的）
- 新的表上线以后，把它的数据加进 `fixture.sql`，以后的升级测试就会检查它不丢

ACCT-1（账号类型）是第一个要迁移现有账号的改动，里面包括李医生的账号，所以从它开始需要这个测试。

### 上线时间

改 schema 的 PR 在**李医生不看诊的时候**合并（比如晚上）。

## 4. 保护真实数据

**2026-11-07 决定：先用 Supabase 免费计划，每天导出一份到本地。** 李医生现在是试用阶段，正式使用之前再考虑升级 Pro（每天自动备份、不会暂停、可以建 staging）。

### 每天导出

```bash
scripts/backup-prod.sh
```

- 导出 `public`（业务数据）、`auth`（账号）、`storage`（照片的元数据），默认保留 30 天（`KEEP_DAYS` 可改）
- `backups/` 在 `.gitignore` 里：**里面有病人信息，不能提交、不能上传**
- 两种连法，脚本自动选（2026-11-08 加了第二种）：
  - **有连接串**：`~/.config/my-chinese-medicine/backup.env`（放在仓库外面，权限 600，写法见脚本开头）→ `pg_dump`，得到 `backups/prod-<时间>.dump`
  - **没有连接串**：用已经 `supabase login` + `supabase link` 到线上项目的 CLI 导出，不用数据库密码，要开着 Docker → 得到 `backups/prod-<时间>-schema.sql`（三个 schema 的结构）和 `-data.sql`。link 的不是线上项目（以 `ci-cd.yml` 里的 `SUPABASE_PROJECT_REF` 为准）就报错
- 两种都会检查导出结果里有 `prescriptions` 表的数据；中途失败会删掉半截文件
- 照片本身在 Supabase Storage 里，这个脚本不导出
- 想每天自动跑：先手动跑一次确认能连上，再加到自己电脑的 crontab（电脑要开着）：
  ```
  0 23 * * * cd <仓库路径> && mkdir -p backups && scripts/backup-prod.sh >> backups/backup.log 2>&1
  ```
  cron 里建议用连接串方式。CLI 方式在 cron 下可能找不到 npx、docker，或者读不到 CLI 的登录，要先确认能跑通
- **改 schema 的 PR 合并之前**，不管当天有没有导出过，都再手动导出一份

恢复：先恢复到本地库里检查，确认没问题再决定怎么修线上。注意：
- `.dump`：用 `pg_restore --list` 看内容。导出用的是 pg_dump 18，恢复要用 pg_restore 18 或更新的版本
- `.sql`：新建一个空库（普通 Postgres 就行，不用 Supabase），用超级用户（叫什么名字都行）、带 `-v ON_ERROR_STOP=1` 依次跑 `scripts/backup-restore-prep.sql`（补上 Supabase 自带的角色、schema、扩展）、`-schema.sql`、`-data.sql`，命令见脚本开头。2026-11-08 用线上备份在本机的临时库里试过：没有报错，行数和线上一致，RLS 策略和触发器都在
- 只恢复 `public` 时，业务表指向 `auth.users` 的外键会因为本地没有这些用户而报错，要连 `auth` 一起恢复

### 上线审批（还没决定）

建议在 GitHub → Settings → Environments → `production` 加 **Required reviewers（你自己）**。这样合并以后，要你点「批准」才会执行 migration 和部署，可以挑李医生不看诊的时间上线。

### 回滚

- 代码：在 Vercel 里把上一个部署 Promote 回去
- 数据库：不回滚，加一个新的 migration 往前修
- 数据真的写坏了：用最近一次本地导出的数据，在本地恢复后挑出需要的数据补回去

## 5. 以后：staging（需要升级 Pro）

PR → Supabase Branching 建临时库并执行 PR 的 migration → Vercel Preview（环境变量指向这个临时库）→ 对预览网址跑完整 E2E → 合并后临时库自动删除。到时候更新 0007 §6。

## 6. 隐私（开放问题）

真实病人数据已经开始进入 us-east-1 的库。这和 0006 §4 的计划（加拿大区域）不一样。0006 §4 里这几项也还没做：
- 病人同意书
- 数据保留期限
- 访问日志

换区域需要新建项目再搬数据，病人越少越容易。

**2026-11-07 决定**：李医生还在试用阶段，现在不换。正式使用之前，再一起做：换区域（新建项目、搬数据）、清理试用期间的测试数据、病人同意书和保留期限。
