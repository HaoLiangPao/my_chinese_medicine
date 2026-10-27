# 项目说明（给 AI 助手）

- 中文界面、中文文档；代码标识符用英文。
- 设计决定写在 `docs/design/NNNN-*.md`，改动数据模型前先更新设计文档。
- 数据库改动只加新的 migration 文件，不改已经上线的 migration；改完跑 `scripts/test-db.sh`（非 root 用户）。
- 库存是流水账（`inventory_txns`），不要加「剩余克数」字段。
- 炮制品是独立药材（`base_herb_id` 指回原药材），别名放 `herb_aliases`。
- `web/` 是 Next.js 16，和旧版本差别很大：写代码前先看 `web/node_modules/next/dist/docs/`。**Cache Components 是关闭的**（原因见 docs/design/0002 §4），不要重新打开，除非 E2E 的回归测试全过。
- 写操作（server action）结束时调用 `invalidateAll()`（`src/lib/invalidate.ts`）。
- 纯计算逻辑放在 `web/src/lib/*.ts` 并写 `*.test.ts`；改动后跑 `scripts/test-all.sh`（非 root）。
- E2E 场景数据和期望值在 `web/e2e/fixtures/scenario.ts`；期望值要独立计算，不要读 App 的结果。
- AI 只做转录和科普，不生成面向患者的用药/剂量建议。
