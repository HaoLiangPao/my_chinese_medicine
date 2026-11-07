# 功能清单与测试地图

这个文件**一直保持最新**（不是一次性的设计文档）。每个功能有一个编号，E2E 测试用 Playwright 的 tag 标上这个编号：

```ts
test("开方：……", { tag: ["@CLN-3"] }, async ({ page }) => { … });
```

- `scripts/check-features.mjs`（`test-all.sh` 和 CI 都会跑）检查两件事：
  - 下面表格里标 ✅ 的功能，至少有一条 E2E 带它的 tag
  - E2E 里用到的 tag 在这里都有定义
- **加新功能的顺序**：
  1. 先在这里加一行（状态 ⬜），写清楚验收用的 E2E 要测什么
  2. 写代码和测试
  3. 测试带上 tag，状态改成 ✅
- 只跑某个功能的测试：`scripts/e2e.sh --grep @RX-3`。
  - 注意：`scenario`、`mvp2`、`clinic` 三组是按顺序串起来的（后一步用前一步的数据），只能整组跑，例如 `scripts/e2e.sh --project=clinic`。
  - `isolated`、`learn`、`mobile` 可以按 tag 单独跑。

图例：✅ 已有 E2E　◐ 只有一部分　⬜ 还没有（下面写了要测什么）

---

## 1. 现有功能（截至 2026-11-06，线上版本）

### ACC · 账号与药柜

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| ACC-1 | 注册（自动建「我们家」）、登录、密码错误、退出 | `/login` | ✅ scenario 1、isolated「密码错误」「重复注册」 | | |
| ACC-2 | 未登录访问内部页面 → 登录页；未登录调 API → 401 | `proxy.ts` | ✅ isolated | | ✅ public |
| ACC-3 | 邀请家人：发出、接受、拒绝、撤销；不泄露邮箱是否注册 | 总览「家庭成员」 | ✅ scenario 1、isolated | SQL `invitations_test` | |
| ACC-4 | 同时在多个药柜：切换、只显示当前的、退出；◐ 移除成员只有 SQL 测试 | 总览 | ◐ isolated | SQL `invitations_test` | ✅ patient（切换） |
| ACC-5 | 数据隔离：陌生人、未接受邀请的人、家庭 ↔ 诊所都互相看不到 | 全部 | ✅ scenario 11、isolated、clinic 7 | SQL 各文件的 RLS 断言、`rpc_privileges_test` | |

> 2026-10-29 决定暂时不扩展「邀请成员」。ACC-3 / ACC-4 的功能保留，测试照跑。

### RX · 药方（家庭）

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| RX-1 | 手动录方：空行忽略、同名合并、去空格、没有药不能保存 | `/prescriptions/new` | ✅ scenario 2、isolated「表单校验」 | 单元 `rx.test.ts` | ✅ patient |
| RX-2 | 别名匹配（北芪 = 黄芪）；目录里没有的才标红 | 同上 | ✅ isolated | 单元 `herb-match.test.ts`；SQL `match_herb` | ✅ patient |
| RX-3 | 拍照识别：预填表单、换模型重试、出错可手动录、每日次数上限、只收图片、≤5MB | 同上 + `/api/parse-prescription` | ✅ isolated（假 OpenRouter） | 单元 `ai-parse.test.ts` | ✅ patient（手动触发、真实模型） |
| RX-4 | 药方列表、详情（原始照片）、删除 | `/prescriptions`、`/prescriptions/[id]` | ✅ scenario 2、7 | | ✅ patient |

### INV · 药柜（库存）

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| INV-1 | 第一次盘点、称重校准（库存设成称出来的克数） | `/inventory` | ✅ scenario 3、7、isolated | SQL `mvp1_test` | |
| INV-2 | 罐子设置、补货提醒 | `/inventory`、总览 | ✅ isolated | | |
| INV-3 | 库存 = 流水账：数据库和页面都和独立账本逐味一致 | `/inventory` | ✅ scenario 8、9 | SQL `mvp1_test` | |

### BUY · 采购 / 进货

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| BUY-1 | 记一笔采购：新店自动建、价格 0（赠品）、不完整的行不能保存、入库 | `/purchases/new` | ✅ scenario 4、isolated、mvp2 | SQL 采购触发器、日期同步 | |
| BUY-2 | 购买记录列表 | `/purchases` | ⬜ 只测了手机上不溢出 | | |

**BUY-2 要测的**：
- 列表按日期倒序
- 每笔显示日期、店名、味数、总金额，总金额 = Σ 克数 × 单价，独立计算
- 点进去能看到明细

### DEC · 煎药

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| DEC-1 | 记录煎药：按方扣库存、多用几克、没放、处方外加药、缺货变负、非法输入（0 副）被拦下 | `/prescriptions/[id]` | ✅ scenario 5、6、mobile | 单元 `decoction.test.ts`；SQL `decoctions_test` | |
| DEC-2 | 撤销一次煎药（库存加回去） | 同上 | ✅ scenario 5 | SQL `decoctions_test` | |

### STAT · 统计

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| STAT-1 | 每味药用了几次、共多少克；药材详情：出现在哪些方子、购买记录 | `/herbs`、`/herbs/[id]` | ✅ scenario 10 | | |

### PRICE · 比价与成本（只有家庭账号；诊所账号已去掉「比价」导航）

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| PRICE-1 | 比价页：各店现价、最便宜高亮、价差、赠品不参与 | `/prices` | ✅ mvp2 | 单元 `pricing.test.ts`；SQL `pricing_test` | |
| PRICE-2 | 药方成本：各店最低价 / 平均成本 / 指定一家店；只在最后取整 | `/prescriptions/[id]` | ✅ mvp2 | 同上 | |
| PRICE-3 | 和诊所实付比较；有药没价格时不比较 | 同上 | ✅ mvp2 | | |
| PRICE-4 | 药柜价值 = Σ 正库存 × 加权平均成本 | `/inventory` | ✅ mvp2 | SQL `pricing_test` | |
| PRICE-5 | 在诊所买药：店铺类型为诊所，参与比价 | `/purchases/new`、`/prices` | ✅ mvp2 | | |

### CLN · 诊所开方

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| CLN-1 | 创建诊所，导航切换成诊所模式 | 总览 | ✅ clinic 1 | SQL `clinic_test` | ✅ clinic |
| CLN-2 | 病人：新建（名字或电话至少一个）、按名字或电话后几位搜、电话去重（只比数字） | `/clinic/prescribe`、`/clinic/patients` | ✅ clinic 3、6 | SQL `clinic_test` | |
| CLN-3 | 选药：首字母按钮、炮制品归在原药材下、汉字/全拼/首字母搜索、新增药材（只收汉字）；克数、脚注、备注；改、删、排序 | `/clinic/prescribe` | ✅ clinic 3、8 | 单元 `herb-index`、`rx-lines` | ✅ clinic |
| CLN-4 | 实时成本（只有医生看得到） | 同上 | ✅ clinic 3 | 单元 `pricing` | |
| CLN-5 | 保存 → 微信消息：全文和独立拼出来的一致、不含价格、一键复制 | `/prescriptions/[id]` | ✅ clinic 4 | 单元 `rx-message.test.ts` | ✅ clinic |
| CLN-6 | 病历：病人名下的处方；从病历再开一张（病人自动选好） | `/clinic/patients/[id]` | ✅ clinic 5 | | |
| CLN-7 | 诊所和家庭药柜隔离 | 全部 | ✅ clinic 7 | SQL `clinic_test` | |
| CLN-8 | 诊所进货（成本用这些价格） | `/purchases/new` | ✅ clinic 2 | | |

### LEARN · 学堂（公开）

| 编号 | 功能 | 页面 | E2E | 其他测试 | 冒烟 |
|---|---|---|---|---|---|
| LEARN-1 | 学习路径，不登录也能看 | `/learn` | ✅ learn | | ✅ public |
| LEARN-2 | 五行图：相生相克、点选显示对应；和人体脏腑图联动 | `/learn/wuxing` | ✅ learn | 单元 `wuxing.test.ts` | |
| LEARN-3 | 阴阳图：拖动时间，比例和时辰跟着变 | `/learn/yinyang` | ✅ learn | 单元 `wuxing.test.ts` | |

### PLAT · 全站

| 编号 | 功能 | E2E | 冒烟 |
|---|---|---|---|
| PLAT-1 | 安全响应头（不能被 iframe 嵌入、不暴露框架） | ✅ isolated | ✅ public |
| PLAT-2 | 手机上每个页面不横向溢出，主要按钮点得到 | ✅ mobile、clinic 8、learn | |

---

## 2. 已知问题：修之前先写好的 E2E

问题编号来自 `docs/sessions/2026-10-28-mvp-launch.md` §3。修的时候先把下面的测试写出来，确认它们失败，再修到通过。

| 编号 | 问题 | E2E 要测的 |
|---|---|---|
| FIX-5 | 诊所模式里还有家庭用语 | 诊所账号逐页检查（总览、库存、进货、处方）：页面上不出现「家庭成员」「家里」「我们家」「录药方」「拍照识别」「副」；导航和页面标题都叫「进货」 |
| FIX-6 | 药柜列表按 Unicode 排序 | 药柜里放「白术、甘草、黄芪、川芎」，页面顺序是 白术 → 川芎 → 甘草 → 黄芪（拼音顺序） |
| FIX-7 | 手机上药柜卡片展开后输入框太窄 | 390px 宽，展开一张卡片：每个输入框宽度 ≥ 120px，placeholder 没有被截断（`scrollWidth ≤ clientWidth`） |
| FIX-8 | 识别后没保存，照片一直留在存储里 | 识别后不保存就离开 → 照片标记为「未使用」；保存药方后照片挂到药方上。具体清理方式定下来以后再写成测试，可能放在 SQL 测试或定时任务里 |

---

## 3. 计划中的功能：先定义验收 E2E

顺序见会话记录 §4。每一项开始做之前，把这里的「要测的」细化成具体步骤和期望值（期望值写在 `e2e/fixtures/`，独立计算）。

### 第一批：账号类型和导航

| 编号 | 功能 | E2E 要测的 |
|---|---|---|
| ACCT-1 | 注册时选「家庭」或「诊所」 | 1. 注册时必须选一个类型<br>2. 家庭账号：导航是家庭的，总览页没有「创建诊所」，直接访问诊所页面会被拦住<br>3. 诊所账号：导航是 开方 / 病人 / 处方 / 库存 / 进货 / 学堂，没有比价，访问 `/prices` 被拦住<br>4. 账号类型以后不能自己改<br>5. **老账号迁移**：已经同时有家庭和诊所的账号，迁移后数据一条不少（见 `docs/design/0008` §3「带数据的升级测试」） |
| ACCT-2 | 切换药柜改成按钮，只在同类型之间切换 | 有两个家庭药柜的账号：按钮切换，切换后库存、药方都跟着变；诊所账号看不到家庭药柜的切换入口 |
| ACCT-3 | 导航 SVG 图标、分组分隔线 | 每个导航项有图标和文字，可访问名称还是中文；手机上不溢出（PLAT-2 覆盖） |

### 第二批：录方体验

| 编号 | 功能 | E2E 要测的 |
|---|---|---|
| RX-5 | 家庭录方用 A–Z 通讯录式选药 | 1. 按药名本身的第一个字归类：炙甘草在 Z，法半夏在 F<br>2. 右侧字母条可以点也可以滑，点 H 滚到 H 组<br>3. 搜索支持汉字、全拼、首字母、别名（「北芪」找到黄芪）<br>4. 手机上从底部弹出，选完关闭，药加进表单<br>5. 诊所开方的归类方式不变（CLN-3 照常通过） |
| RX-6 | 医生改成下拉选择 + 当场新增（新表 `prescribers`） | 1. 新建医生「李医生」，录方时下拉能选<br>2. 下一张方子默认选上一次的医生<br>3. 药方详情显示医生名字<br>4. 别的药柜看不到这个医生（RLS，SQL 测试也要有）<br>5. 老药方只有文字形式的 `prescriber`，照样能显示 |

### 第三批：更多录入方式

| 编号 | 功能 | E2E 要测的 |
|---|---|---|
| RX-7 | 粘贴文字录入（比如医生的微信消息） | 1. 粘贴 CLN-5 生成的那段消息，药名、克数、脚注都能填进表单<br>2. 认不出的行原样留着，让用户自己改<br>3. 不调用模型（先不用 LLM 的版本） |
| RX-8 | 语音录入 🎤 | 1. 浏览器不支持 Web Speech API 时不显示按钮（Firefox）<br>2. 用假的 SpeechRecognition 喂一段文字，文字进入和 RX-7 一样的解析流程 |
