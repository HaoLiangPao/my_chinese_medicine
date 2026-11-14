#!/usr/bin/env node
// 生成学堂题库的 migration（docs/design/0020 §3）。题目的来源是 supabase/data/quiz-questions.json。
//
//   node scripts/gen-quiz-questions.mjs supabase/migrations/<14 位时间戳>_quiz_questions_<名字>.sql   新建一个只导题目的 migration
//   node scripts/gen-quiz-questions.mjs --update <还没上线的 migration>                              只替换文件里 >>> <<< 之间的题库
//
// 生成的 SQL 把整份 JSON 放进一个 $quiz$…$quiz$ 字面量，按 id upsert：
// - 新题插入；已有的题内容变了就更新（JSON 是唯一来源，还没有审核页；有了审核页以后改成「已有的不覆盖」，见 0020 §8）
// - 题目不删：要下架就把 status 改成 retired（作答记录指向它）
// 可以重复执行。单元测试（web/src/lib/quiz-bank.test.ts）检查最新的题库 migration 和 JSON 一致。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BEGIN = "-- >>> 题库（scripts/gen-quiz-questions.mjs 生成，不要手改）";
const END = "-- <<< 题库";
const COLS = ["kind", "stem", "options", "answer", "explanation", "source", "topics", "difficulty", "status", "reviewed_by", "reviewed_at"];

const { questions } = JSON.parse(readFileSync(join(root, "supabase/data/quiz-questions.json"), "utf8"));
// 字面量里只放数据库要的字段，一行一题，方便看 diff
const rows = questions.map((q) =>
  JSON.stringify({
    id: q.id,
    kind: q.kind,
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation,
    source: q.source,
    topics: q.topics,
    difficulty: q.difficulty,
    status: q.status,
    reviewed_by: q.reviewed_by ?? null,
    reviewed_at: q.reviewed_at ?? null,
  }),
);
const literal = `[\n${rows.join(",\n")}\n]`;
if (literal.includes("$quiz$")) throw new Error("题目里不能有 $quiz$");

const block = `${BEGIN}
-- 来源：supabase/data/quiz-questions.json（${questions.length} 题）。按 id upsert，可以重复执行；不删题（下架用 status = 'retired'）
insert into public.quiz_questions (id, ${COLS.join(", ")})
select q.id, ${COLS.map((c) => `q.${c}`).join(", ")}
from jsonb_to_recordset($quiz$${literal}$quiz$::jsonb) as q(
  id text, kind text, stem text, options text[], answer smallint, explanation text, source text,
  topics text[], difficulty smallint, status text, reviewed_by text, reviewed_at date)
on conflict (id) do update set ${COLS.map((c) => `${c} = excluded.${c}`).join(", ")}, updated_at = now()
where (${COLS.map((c) => `quiz_questions.${c}`).join(", ")})
  is distinct from (${COLS.map((c) => `excluded.${c}`).join(", ")});
${END}
`;

const args = process.argv.slice(2);
if (args[0] === "--update") {
  const file = args[1];
  if (!file || !existsSync(file)) throw new Error("用法：--update <已有的 migration 文件>");
  const sql = readFileSync(file, "utf8");
  const a = sql.indexOf(BEGIN);
  const b = sql.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${file} 里没有题库的标记`);
  writeFileSync(file, sql.slice(0, a) + block + sql.slice(b + END.length + 1));
  console.log(`已更新 ${file} 的题库：${questions.length} 题。只能改还没上线的 migration（scripts/check-migrations.sh 会检查）`);
} else {
  const out = args[0];
  if (!out || !/supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(out)) {
    console.error("用法：node scripts/gen-quiz-questions.mjs supabase/migrations/<14 位时间戳>_<名字>.sql");
    process.exit(1);
  }
  if (existsSync(out)) {
    console.error(`${out} 已经存在。已上线的 migration 不能改，换一个新的时间戳（还没上线的用 --update）。`);
    process.exit(1);
  }
  writeFileSync(
    out,
    `-- =============================================================================
-- 学堂题库更新。由 scripts/gen-quiz-questions.mjs 生成，不要手改。设计：docs/design/0020。
-- =============================================================================

${block}`,
  );
  console.log(`已生成 ${out}：${questions.length} 题`);
}
