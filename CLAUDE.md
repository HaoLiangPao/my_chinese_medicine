# 项目说明（给 AI 助手）

- 中文界面、中文文档；代码标识符用英文。
- 设计决定写在 `docs/design/NNNN-*.md`，改动数据模型前先更新设计文档。
- 数据库改动只加新的 migration 文件，不改已经上线的 migration；改完跑 `scripts/test-db.sh`（非 root 用户）。
- 库存是流水账（`inventory_txns`），不要加「剩余克数」字段。
- 炮制品是独立药材（`base_herb_id` 指回原药材），别名放 `herb_aliases`。
- `web/` 是 Next.js 16，和旧版本差别很大：写代码前先看 `web/node_modules/next/dist/docs/`。开启了 Cache Components，读 session 的组件必须放在 `<Suspense>` 里。
- AI 只做转录和科普，不生成面向患者的用药/剂量建议。
