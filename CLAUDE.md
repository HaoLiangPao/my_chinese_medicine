# 项目说明（给 AI 助手）

- 中文界面、中文文档；代码标识符用英文。
- 设计决定写在 `docs/design/NNNN-*.md`，改动数据模型前先更新设计文档。
- 数据库改动只加新的 migration 文件，不改已经上线的 migration；改完跑 `scripts/test-db.sh`（非 root 用户）。
- 库存是流水账（`inventory_txns`），不要加「剩余克数」字段。
- 炮制品是独立药材（`base_herb_id` 指回原药材），别名放 `herb_aliases`。
- `web/` 是 Next.js 16，和旧版本差别很大：写代码前先看 `web/node_modules/next/dist/docs/`。**Cache Components 是关闭的**（原因见 docs/design/0002 §4），不要重新打开，除非 E2E 的回归测试全过。
- 写操作（server action）结束时调用 `invalidateAll()`（`src/lib/invalidate.ts`）。
- 代码格式用 Prettier（`web/.prettierrc.json`，行宽 140）：改完代码在 `web/` 下跑 `npm run format`；`test-all.sh` 和 CI 会跑 `npm run format:check`，格式不对就失败。Markdown 不格式化。
- 纯计算逻辑放在 `web/src/lib/*.ts` 并写 `*.test.ts`；改动后跑 `scripts/test-all.sh`（非 root）。
- E2E 场景数据和期望值在 `web/e2e/fixtures/scenario.ts`；期望值要独立计算，不要读 App 的结果。
- 当前顺序和交接记录在 `docs/roadmap.md`，判断方法在 `.claude/skills/product-steward/`：接手推进项目时先读，收工前更新。
- 功能清单和 E2E 对照在 `docs/features.md`：新功能先在那里加一行并写好验收 E2E；E2E 用 `{ tag: ["@编号"] }` 标上功能编号（`scripts/check-features.mjs` 会检查）。
- 生产环境有真实病人数据（2026-11-06 起）：开发流程见 `docs/design/0009`；migration 必须兼容线上正在跑的旧代码（先扩展、后收缩），迁移已有数据要在有数据的库上测过。
- **前端改动的 PR 要有截图**（2026-11-07 起，所有 PR）：改了页面、样式、文案的 PR，正文里必须贴改动后的截图（改了已有页面的，前后对比；涉及手机的，加 390px 宽的截图）。截图用本地环境（`scripts/local-stack.sh`）和测试数据拍，E2E 里可以 `page.screenshot()` 存到 `.local/screenshots/`；用 `scripts/pr-screenshots.sh <分支名> <图片>...` 传到 `pr-assets` 分支，把它打印的 Markdown 贴进 PR 正文。**仓库是公开的：截图里不能有真实病人、真实账号或线上数据。**
- Bug 反馈会记录「点了哪个按钮」，但不读按钮上的字（`docs/design/0014` §4）：新加的按钮带一个写死的 `data-bug-label="…"`（说明是哪个按钮，比如「保存处方」「选病人」），不能写成 `{表达式}`，里面不能有病人姓名、电话或用户输入的内容。
- AI 只做转录和科普，不生成面向患者的用药/剂量建议。
