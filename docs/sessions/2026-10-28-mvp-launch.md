# 2026-10-28 会话记录：MVP 上线

下一个会话从这里接着做。先读 `CLAUDE.md`、本文件，再看 §4「待办」。

- 线上：https://mychinesemedicine.vercel.app（Vercel 项目 `my_chinese_medicine`，Supabase 项目 ref `sktmqyahvhzyxpyyaojb`，区域 us-east-1）
- 只有一个环境（生产）。测试账号：**病人 / 家庭 = hao-test@gmail.com**，**诊所 = tina-test@gmail.com**（GitHub Actions 的 `SMOKE_PATIENT_*` / `SMOKE_CLINIC_*`）
- 上线方式：合并到 `main` → GitHub Actions：测试 → `supabase db push` → `vercel deploy --prod` → 线上冒烟测试

## 1. 做完的

### 上线
| 内容 | 位置 |
|---|---|
| Supabase：`supabase db push` 推了 migration 0001–0008 + seed（药材 113 味、别名 26 个），之后又推了 0009 | `supabase/migrations/` |
| Vercel：Root Directory = `web`；`web/vercel.json` 固定 framework = nextjs（项目设置里原来是 Other）；从**仓库根目录**部署，根目录 `.vercelignore` 控制上传内容 | `web/vercel.json`、`.vercelignore` |
| PR #1（MVP1–MVP4）合并到 `main` | |

### 拍照识别改用 OpenRouter（PR #1 分支上）
- `web/src/lib/ai-parse.ts`：OpenAI 兼容的 `chat/completions`，直接 `fetch`；structured outputs（schema 由 zod 生成）+ `provider.require_parameters`
- 按 `OPENROUTER_MODELS` 的顺序依次尝试；HTTP 错误、超时、返回的不是 JSON、不符合 schema 都会换下一个模型；不管试了几个模型只扣一次额度
- 生产环境配置：`OPENROUTER_MODELS=deepseek/deepseek-v4.1-flash`；去掉了 `@anthropic-ai/sdk`
- E2E 假服务改成 `e2e/mock-openrouter.mjs`，新增「免费模型失败 → 换 DeepSeek」的用例

### CI/CD（PR #2，设计 `docs/design/0007-ci-cd.md`）
- `.github/workflows/ci-cd.yml`：PR 跑全部测试；`main` 上测试 → migration → 部署 → 冒烟测试
- `.github/workflows/smoke.yml`：部署后自动跑、每天 13:17 UTC 跑、可以手动触发（勾选 `parse` 测真实识别）
- `scripts/check-migrations.sh`：已上线的 migration 只能新增；修改、删除、时间戳排在旧文件前面都会失败
- 冒烟测试 `web/e2e/smoke/`：`public`（不用登录）、`patient`（家庭）、`clinic`（诊所）、`shared.ts`（登录、切换药柜类型）；`npm run smoke`
- GitHub Secrets：`SUPABASE_ACCESS_TOKEN`、`VERCEL_TOKEN`、`SMOKE_PATIENT_PASSWORD`、`SMOKE_CLINIC_PASSWORD`；Variables：`SMOKE_PATIENT_EMAIL`、`SMOKE_CLINIC_EMAIL`
- Vercel 的 Git 集成**已断开**（只由 Actions 部署）

### 上线后加固（PR #2）
- migration `20261028000009_lock_down_rpc.sql`（已推到线上）：13 个业务函数不再对 anon 开放；3 个触发器函数谁都不能直接调用；`match_herb` 固定 search_path；`user_settings` 的 policy 改用 `(select auth.uid())`
- SQL 测试 `rpc_privileges_test.sql`；本地 `auth_stub.sql` 补上 `anon` 角色（和 Supabase 一致）
- `next.config.ts`：`X-Frame-Options: DENY`、`frame-ancestors 'none'`、`nosniff`、`Referrer-Policy`、`Permissions-Policy`；去掉 `x-powered-by`

### 线上测试发现的 4 个 bug（PR #3）
1. 手动录方时别名（北芪）被标成「不在目录里」→ `src/lib/herb-match.ts`，规则和 `match_herb` 一样，并显示「北芪 = 黄芪」
2. 成本总价先取整再乘副数（$1.554 × 5 显示 $7.75，应为 $7.77）→ `summarizeCost` 只在最后取整；设计文档 0003 §2 补了这条规则
3. 诊所模式处方页的「＋ 新药方」进了家庭录方表单，副标题写死「李医生」→ 诊所显示「＋ 开方」，`/prescriptions/new` 转到 `/clinic/prescribe`
4. 开方搜「bx」「法半夏」也提示「＋ 新增」→ `canAddHerb()`

### 冒烟测试自己的问题（PR #4，**CI 已通过，等合并**）
- 主 E2E 配置排除 `e2e/smoke/`（`/clinic\.spec\.ts/` 误匹配了 smoke 里的 clinic.spec.ts）
- 冒烟测试用 `browser.newContext()`（`browser.newPage()` 的上下文里不能再开页面）
- 拍照识别用例先等 `networkidle` 再选文件

### 验证过的
- 在你的浏览器登录状态下走完家庭和诊所流程：录方、采购、比价、成本、煎药（处方外加药、缺货变负）、校准、盘点、真实识别（DeepSeek 3.5 秒，6 味全对）、进货、开方、微信消息、病历；金额都手算核对过
- 数据隔离（RLS）：在只读事务里模拟陌生用户和未登录用户，药方、病人、库存流水、照片都是 0；本人能看到自己的
- 线上冒烟测试 9 条全部通过（含真实识别）

## 2. 决定（及理由）

| 决定 | 理由 |
|---|---|
| 识别模型走 OpenRouter，生产只用 `deepseek/deepseek-v4.1-flash` | 便宜（约 $0.14 / $0.42 每百万 token），支持图片和 structured outputs；免费模型的服务商可能记录输入，药方照片上有患者姓名 |
| fallback 写在我们自己的代码里，不只靠 OpenRouter 的 `models` 参数 | OpenRouter 只在 HTTP 层面失败时切换；模型返回乱码时不会切换 |
| 部署由 GitHub Actions 控制，断开 Vercel 的 Git 集成 | Vercel 自动部署不知道 migration，也不等测试通过 |
| **先推 migration、后部署代码**；migration 必须兼容线上正在跑的旧代码（先扩展、后收缩）；失败时只往前修（加新 migration） | 部署中途代码和数据库都能对得上；已上线的 migration 不改 |
| `seed.sql` 不放进流水线 | 只有第一次建库需要；以后补药材写成 migration |
| `SUPABASE_DB_PASSWORD` 可选 | Supabase CLI 会用 access token 建临时登录角色，本地实测 `db push` 没要密码 |
| `.vercelignore` 里根目录路径加前导 `/` | 第一次部署时 `supabase` 这条规则把 `web/src/lib/supabase/` 也排除了，导致构建失败 |
| `is_member()` 仍对 anon 开放 | RLS 规则里要用它，未登录查表时也会调用（返回 false）；advisors 里剩的这一条警告是预期的 |
| 安全头只加 `frame-ancestors`，不做完整的 CSP | 完整 CSP 和 Next.js 的内联脚本冲突风险大，等专门做的时候再说 |
| `Permissions-Policy` 关掉摄像头 | 拍照用的是 `<input capture>`，不需要 `getUserMedia` |
| 金额只在显示时取整 | 先取整再乘会放大误差 |
| 前端的别名判断只用来提示，保存时以数据库的 `match_herb` 为准 | 前后端规则一致，但数据库才是权威 |
| 诊所模式不用家庭的录方表单 | 诊所走开方页（选病人、首字母选药） |
| 「新增药材」只接受汉字，且不能和结果或它的炮制品同名 | 防止往**全局**药材目录加 `bx` 或重复的法半夏 |
| 冒烟测试用专门的测试账号，只动测试账号自己的数据；诊所测试复用固定的「冒烟测试病人」（病人不能删）；真实识别默认不跑 | 不污染真实数据；识别要花钱，照片会留在存储里 |
| **识别用例：线上冷启动时 React 还没水合，`setInputFiles` 选的文件事件丢失。真实用户要先点「📷 拍照」按钮才会弹出选图，那时页面早已准备好，不会遇到。只改测试：先等页面网络空闲再选文件** | 问题只出在测试的操作时机上，不是 App 的 bug |
| Claude 不在生产网站上输入密码登录，也不读取密钥的值 | 安全规则；登录后的流程由你在浏览器里登录后测试，或者由 CI 用测试账号跑 |
| Claude 不在 CI 跑完之前自己合并 PR | 权限规则会拦下来；由你合并，或者你在 CI 通过后明确让 Claude 合并 |
| MVP 只用一个生产环境，正式上线前再分 staging / production | Supabase 免费账号的两个项目已用完；先把功能做出来 |
| Supabase 区域用 us-east-1（不是计划中的 Canada Central） | 项目已经建好了；和 Vercel 的 iad1 在同一片，延迟更低 |
| 诊所账号先去掉「比价」 | 你决定的；以后需要再加 |
| 导航图标自己画 SVG | 你确认的；emoji 在不同手机上长得不一样 |
| 语音录入用手机键盘或浏览器自带的语音识别，转成文字后先由用户自己核对填写，不一定要用 LLM 解析；不行再想别的办法 | 你决定的；省钱、简单 |
| 盘点录入 = 把库存设成称出来的克数（不是加上去） | 现有设计，线上验证过 |

## 3. 发现了但还没修的问题

| # | 问题 | 计划 |
|---|---|---|
| 5 | 诊所模式还有很多家庭用语：总览页的「家庭成员」「录药方 / 拍照识别」，库存页的「家里每个罐子…」「盘点：家里原本就有的」，导航写「进货」、页面标题写「采购」，「剂」和「副」混用 | 和「注册时选账号类型」一起做 |
| 6 | 药柜列表按汉字的 Unicode 编码排序，不是拼音 | 和 A–Z 选药一起做 |
| 7 | 手机上药柜卡片展开后，输入框太窄，提示文字显示不全 | 和按钮样式统一一起做 |
| 8 | 识别后没保存药方，照片会一直留在存储里没人用（冒烟测试每次手动测识别也会留一张） | 定期清理，或者在保存药方时才正式挂上 |
| — | 家庭录方表单的医生默认值写死「李医生」 | 和「医生下拉选择」一起做 |
| — | ESLint 两条警告：`ai-parse.test.ts` 的 `_n`、`ai-parse.ts` 的 `_ignored` 没用到 | 小清理 |
| — | Vercel 里的 `TEST_PATIENT_EMAIL` / `TEST_PATIENT_PASSWORD` 应该删掉（运行时用不到） | 你在 Vercel 里删 |
| — | Supabase Auth 的 Leaked password protection（拒绝已泄露的密码）没开 | 要 Pro 计划 |
| — | 两个测试账号现在都同时有家庭和诊所 | 做账号类型时迁移：hao-test 只留家庭，tina-test 只留诊所 |
| — | 仓库根目录有一个未跟踪的 `AGENTS.md`，来源不明 | 你确认要不要 |

## 4. 讨论过、还没做的（建议顺序）

**第一批：账号类型和导航（会影响后面所有页面，先做）**
1. **注册时选「家庭」或「诊所」**，家庭账号不能再开诊所；诊所账号导航是：开方、病人、处方、库存、进货、学堂（不要比价，`/prices` 也拦住）。这是数据模型改动，要先写设计文档 0008，再加新 migration。还要迁移现有的两个测试账号。
2. **切换药柜改成按钮**，和其他界面统一；账号分了类型以后，只在同类型的多个药柜之间切换（比如被家人邀请进了别人家）。
3. **导航加自己画的 SVG 图标**，项目之间加分隔线。

**第二批：录方体验**

4. **病人端 A–Z 通讯录式选药**：按药名本身的第一个字归类（炙甘草在 Z、法半夏在 F，不和甘草、半夏合在一起；诊所开方那边按原药材归组的方式不变）；右边字母索引条可以点也可以滑；顶部保留搜索（汉字、拼音、首字母、别名）；手机上从底部弹出。顺带把药柜列表改成按拼音排序（问题 6）。
5. **医生改成下拉选择 + 新增**（像诊所里选病人那样）。

**第三批：更多录入方式**

6. **粘贴文字录入**（比如医生发来的微信消息）。你倾向先不用 LLM，由用户自己选填；不行再加 DeepSeek 文字解析（只转录）。
7. **语音录入**：先用手机键盘的麦克风，不用写代码；然后加一个 🎤 按钮（浏览器的 Web Speech API，Chrome 和 Safari 支持中文，Firefox 不支持）。

**以后**
- staging 环境 + PR 预览 + 对预览网址跑完整 E2E（0007 §6）；Dependabot（依赖自动更新）；回滚流程演练
- 定期清理没用到的照片（问题 8）

## 5. 还没回答的问题

1. **诊所账号要不要「邀请成员」**（诊所助手、药房员工）？要的话，诊所的总览页保留成员管理。
2. **医生列表**：(a) 每个药柜一张医生表（名字、诊所、电话），这是数据模型改动，推荐这个；还是 (b) 不加表，只从以前填过的名字里选？
3. 第一批到第三批的顺序是否照上面来？

## 6. PR

| PR | 内容 | 状态 |
|---|---|---|
| #1 | MVP1–MVP4 + OpenRouter | 已合并 |
| #2 | CI/CD + 加固（0009、安全头、冒烟测试） | 已合并 |
| #3 | 4 个 bug + 两个测试账号的冒烟测试 + DB 密码可选 | 已合并，已上线，线上冒烟测试通过 |
| #4 | 冒烟测试修复（排除目录、newContext、等水合） | **CI 通过，等合并** |
