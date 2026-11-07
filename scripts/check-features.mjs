#!/usr/bin/env node
// 功能清单 ↔ E2E tag 对照检查（见 docs/features.md 开头）：
//   1. docs/features.md 里标 ✅ 的功能，至少有一条 E2E（不含冒烟测试）带它的 tag
//   2. E2E（含冒烟测试）里用到的 tag 都在 docs/features.md 里定义过
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(root, "docs/features.md"), "utf8");

// 表格行：| 编号 | 功能 | … |，状态看这一行里有没有 ✅ / ◐ / ⬜
const features = new Map();
for (const line of doc.split("\n")) {
  const m = line.match(/^\|\s*([A-Z]+-\d+)\s*\|/);
  if (!m) continue;
  // 以这一行里第一个出现的状态符号为准（冒烟那一列的 ✅ 在后面）
  const sym = line.match(/[✅◐⬜]/u)?.[0];
  const status = sym === "✅" ? "done" : sym === "◐" ? "partial" : "todo";
  features.set(m[1], status);
}

function specFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? specFiles(join(dir, e.name)) : e.name.endsWith(".spec.ts") ? [join(dir, e.name)] : [],
  );
}

const e2eDir = join(root, "web/e2e");
const used = new Map(); // tag → 文件列表（不含冒烟）
const errors = [];
for (const file of specFiles(e2eDir)) {
  const rel = relative(e2eDir, file);
  const smoke = rel.startsWith("smoke");
  for (const m of readFileSync(file, "utf8").matchAll(/"@([A-Z]+-\d+)"/g)) {
    const id = m[1];
    if (!features.has(id)) errors.push(`${rel} 用了 @${id}，但 docs/features.md 里没有这个编号`);
    if (!smoke) used.set(id, [...(used.get(id) ?? []), rel]);
  }
}

for (const [id, status] of features) {
  if (status !== "todo" && !used.has(id)) errors.push(`${id} 在 docs/features.md 里标为已有 E2E，但没有测试带 @${id}`);
  if (status === "todo" && used.has(id)) errors.push(`${id} 已经有 E2E（${used.get(id).join("、")}），把 docs/features.md 里的状态改成 ✅`);
}

if (errors.length) {
  console.error(errors.map((e) => `✘ ${e}`).join("\n"));
  process.exit(1);
}
const count = (s) => [...features.values()].filter((v) => v === s).length;
console.log(`功能清单：${features.size} 项（✅ ${count("done")}、◐ ${count("partial")}、⬜ ${count("todo")}），E2E tag 都对得上`);
