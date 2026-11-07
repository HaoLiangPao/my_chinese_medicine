#!/usr/bin/env node
// 生成「药材目录 + 药材资料导入」的 migration（docs/design/0010 §3.2、§3.4）。
//
//   node scripts/gen-herb-monographs.mjs supabase/migrations/<时间戳>_herb_catalog_and_monographs.sql
//
// 线上部署只执行 migration、不跑 seed.sql，所以目录里新加的药也要写进 migration。生成的 SQL：
//   1. 改名（RENAMES，只在旧名存在、新名不存在时改；药材 id 不变，已有药方跟着变）
//   2. seed.sql 里的全部药材、炮制品、别名（已有的不动）
//   3. supabase/data/herb-monographs.json 的资料（已有资料的不覆盖：导入以后以数据库为准，审核人在核对页改）
// 可以重复执行。生成以后不要手改，要改就改 JSON / seed.sql 再生成一个新的 migration。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2];
if (!out || !/supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(out)) {
  console.error("用法：node scripts/gen-herb-monographs.mjs supabase/migrations/<14 位时间戳>_<名字>.sql");
  process.exit(1);
}
if (existsSync(out)) {
  console.error(`${out} 已经存在。已上线的 migration 不能改，换一个新的时间戳。`);
  process.exit(1);
}

// 2026-11-07：李医生处方里的「沙参」指南沙参（北沙参另列）
const RENAMES = [{ from: "沙参", to: "南沙参", pinyin: "nan sha shen" }];

const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
const processedAt = seed.indexOf("base_herb_id");
const aliasAt = seed.indexOf("herb_aliases");
const herbs = [...seed.slice(0, processedAt).matchAll(/\('([^']+)', '([a-z ]+)', '([^']+)'\)/g)].map((m) => m.slice(1, 4));
const processed = [...seed.slice(processedAt, aliasAt).matchAll(/\('([^']+)', '([a-z ]+)', '([^']+)'\)/g)].map((m) => m.slice(1, 4));
const aliases = [...seed.slice(aliasAt).matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => m.slice(1, 3));
const { herbs: monographs } = JSON.parse(readFileSync(join(root, "supabase/data/herb-monographs.json"), "utf8"));
if (herbs.length < 100 || processed.length < 10 || aliases.length < 20) throw new Error("seed.sql 的格式变了，解析出来的数量不对");

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`);
const arr = (a) => `array[${a.map(q).join(", ")}]::text[]`;
const rows = (list) => list.map((r) => `  (${r.join(", ")})`).join(",\n");

const cols = ["latin_name", "source", "flavors", "nature", "meridians", "traditional_use", "processing", "regions", "quality",
  "toxicity", "cautions", "storage", "reference", "check_note", "status", "reviewed_by", "reviewed_at"];
const monoRows = monographs.map((m) => [
  `${q(m.name)}::text`, `${q(m.latin)}::text`, `${q(m.source)}::text`, arr(m.flavors), `${q(m.nature)}::text`, arr(m.meridians),
  `${q(m.use)}::text`, `${q(m.processing)}::text`, `${q(m.regions)}::text`, `${q(m.quality)}::text`, `${q(m.toxicity)}::text`,
  `${q(m.cautions)}::text`, `${q(m.storage)}::text`, `${q(m.reference)}::text`, `${q(m.check)}::text`, `${q(m.status)}::text`,
  `${q(m.reviewed_by)}::text`, `${q(m.reviewed_at)}::date`,
]);

const sql = `-- =============================================================================
-- 药材目录 + 药材资料导入。由 scripts/gen-herb-monographs.mjs 生成，不要手改。
-- 来源：supabase/seed.sql（目录）、supabase/data/herb-monographs.json（资料，${monographs.length} 味）
-- 设计：docs/design/0010-herb-labels.md §3.2、§3.4。可以重复执行。
-- =============================================================================

-- 1. 改名：只在旧名存在、新名还没有时改（药材 id 不变，已有药方跟着显示新名）
${RENAMES.map((r) => `update public.herbs set name_zh = ${q(r.to)}, pinyin = ${q(r.pinyin)}
where name_zh = ${q(r.from)} and not exists (select 1 from public.herbs where name_zh = ${q(r.to)});`).join("\n")}

-- 2. 目录（已有的不动）
insert into public.herbs (name_zh, pinyin, category) values
${rows(herbs.map((h) => h.map(q)))}
on conflict (name_zh) do nothing;

insert into public.herbs (name_zh, pinyin, category, base_herb_id)
select v.name_zh, v.pinyin, b.category, b.id from (values
${rows(processed.map((h) => h.map(q)))}
) as v(name_zh, pinyin, base) join public.herbs b on b.name_zh = v.base
on conflict (name_zh) do nothing;

-- 别名不能和药名重复（match_herb 先按药名找）
insert into public.herb_aliases (alias, herb_id)
select v.alias, h.id from (values
${rows(aliases.map((a) => a.map(q)))}
) as v(alias, herb_name) join public.herbs h on h.name_zh = v.herb_name
where not exists (select 1 from public.herbs x where x.name_zh = v.alias)
on conflict (alias) do nothing;

-- 3. 资料（已有的不覆盖）
insert into public.herb_monographs (herb_id, ${cols.join(", ")})
select h.id, ${cols.map((c) => `v.${c}`).join(", ")} from (values
${rows(monoRows)}
) as v(name_zh, ${cols.join(", ")}) join public.herbs h on h.name_zh = v.name_zh
on conflict (herb_id) do nothing;

-- 每味都要导进去（目录在上面刚补齐，少了说明名字对不上）
do $$
declare missing text;
begin
  select string_agg(n, '、') into missing
  from unnest(${arr(monographs.map((m) => m.name))}) n
  where not exists (select 1 from public.herb_monographs m join public.herbs h on h.id = m.herb_id where h.name_zh = n);
  if missing is not null then raise exception '这些药没有导入资料：%', missing; end if;
end $$;
`;

writeFileSync(out, sql);
console.log(`已生成 ${relative(root, join(process.cwd(), out)) || out}：目录 ${herbs.length} + ${processed.length} 味，别名 ${aliases.length} 个，资料 ${monographs.length} 味`);
