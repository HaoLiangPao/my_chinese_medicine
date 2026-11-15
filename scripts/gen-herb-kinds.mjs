#!/usr/bin/env node
// 生成「药材的来源和入药部位」的 migration（docs/design/0018）。
//
//   node scripts/gen-herb-kinds.mjs supabase/migrations/<时间戳>_herb_kinds.sql
//
// 读 supabase/data/herb-kinds.json（原药材的来源、部位）和 supabase/seed.sql（目录、炮制品挂在哪味原药材下面）。
// 炮制品跟原药材，processed_overrides 里的例外。生成的 SQL：
//   1. herbs 加两列（可以为空）和约束（植物一定有部位，别的一定没有）
//   2. 按药名填，只填还是空的（可以重复执行；用户自己加的、目录里没有的名字不填）
//   3. 检查名单里已经在库里的药都填上了
// 生成以后不要手改，要改就改 JSON 再生成一个新的 migration（那时要明确 update 已经有值的行）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2];
if (!out || !/supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(out)) {
  console.error("用法：node scripts/gen-herb-kinds.mjs supabase/migrations/<14 位时间戳>_<名字>.sql");
  process.exit(1);
}
if (existsSync(out)) {
  console.error(`${out} 已经存在。已上线的 migration 不能改，换一个新的时间戳。`);
  process.exit(1);
}

const ORIGINS = ["plant", "fungus", "animal", "mineral", "manufactured"];
const PARTS = ["root", "fruit_seed", "whole", "leaf", "flower", "bark", "stem", "resin_other"];

const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
const processedAt = seed.indexOf("base_herb_id");
const aliasAt = seed.indexOf("herb_aliases");
const base = [...seed.slice(0, processedAt).matchAll(/\('([^']+)', '([a-z ]+)', '([^']+)'\)/g)].map((m) => m[1]);
const processed = [...seed.slice(processedAt, aliasAt).matchAll(/\('([^']+)', '([a-z ]+)', '([^']+)'\)/g)].map((m) => [m[1], m[3]]);
if (base.length < 100 || processed.length < 10) throw new Error("seed.sql 的格式变了，解析出来的数量不对");

const data = JSON.parse(readFileSync(join(root, "supabase/data/herb-kinds.json"), "utf8"));
/** 药名 → [来源, 部位 | null] */
const kinds = new Map();
const put = (name, origin, part) => {
  if (kinds.has(name)) throw new Error(`${name} 在 herb-kinds.json 里出现了两次`);
  kinds.set(name, [origin, part]);
};
for (const [part, names] of Object.entries(data.plant)) {
  if (!PARTS.includes(part)) throw new Error(`不认识的部位 ${part}`);
  for (const n of names) put(n, "plant", part);
}
for (const origin of ORIGINS.filter((o) => o !== "plant")) for (const n of data[origin]) put(n, origin, null);

const missing = base.filter((n) => !kinds.has(n));
const extra = [...kinds.keys()].filter((n) => !base.includes(n));
if (missing.length || extra.length) throw new Error(`herb-kinds.json 和 seed.sql 的原药材对不上。缺：${missing.join("、")}；多：${extra.join("、")}`);

const processedNames = new Set(processed.map(([n]) => n));
for (const [name, o] of Object.entries(data.processed_overrides ?? {})) {
  if (!processedNames.has(name)) throw new Error(`processed_overrides 里的 ${name} 不是 seed.sql 里的炮制品`);
  if (!ORIGINS.includes(o.origin) || (o.origin === "plant") !== PARTS.includes(o.part)) throw new Error(`${name} 的来源 / 部位不对`);
}
for (const [name, b] of processed) {
  const o = data.processed_overrides?.[name];
  const [origin, part] = o ? [o.origin, o.part ?? null] : kinds.get(b);
  kinds.set(name, [origin, part]);
}

const q = (v) => (v === null ? "null::text" : `'${String(v).replaceAll("'", "''")}'`);
const rows = [...kinds].map(([n, [o, p]]) => `  (${q(n)}, ${q(o)}, ${q(p)})`).join(",\n");
const list = (a) => a.map((x) => `'${x}'`).join(", ");

const sql = `-- =============================================================================
-- 药材的来源（植物 / 菌藻 / 动物 / 矿物 / 加工品）和入药部位（只有植物）。
-- 由 scripts/gen-herb-kinds.mjs 生成，不要手改。来源：supabase/data/herb-kinds.json、supabase/seed.sql。
-- 设计：docs/design/0018-herb-kinds.md。可以重复执行。
-- 只加可以为空的列、填数据：线上正在跑的旧代码不读这两列。
-- 目录只读的规则不变：authenticated 只有 insert (name_zh)（20261027000007），新列没有授权给客户端。
-- =============================================================================

alter table public.herbs
  add column if not exists origin_kind text check (origin_kind in (${list(ORIGINS)})),
  add column if not exists medicinal_part text check (medicinal_part in (${list(PARTS)}));

-- 植物一定有部位；菌藻、动物、矿物、加工品和还没分类的一定没有
alter table public.herbs drop constraint if exists herbs_medicinal_part_plant_only;
alter table public.herbs add constraint herbs_medicinal_part_plant_only
  check (case when origin_kind = 'plant' then medicinal_part is not null else medicinal_part is null end);

comment on column public.herbs.origin_kind is '来源：plant 植物 / fungus 菌藻 / animal 动物 / mineral 矿物 / manufactured 加工品。空 = 未分类（用户自己加的药）。docs/design/0018';
comment on column public.herbs.medicinal_part is '入药部位（只有植物）：root 根及根茎 / fruit_seed 果实种子 / whole 全草 / leaf 叶 / flower 花 / bark 皮 / stem 茎木 / resin_other 树脂及其他';

-- 按药名填（${base.length} 味原药材 + ${processed.length} 个炮制品）。只填还是空的；用户自己加的同名药（比如自己建的「延胡索」）也是这味药，一起填
update public.herbs h set origin_kind = v.origin_kind, medicinal_part = v.medicinal_part
from (values
${rows}
) as v(name_zh, origin_kind, medicinal_part)
where h.name_zh = v.name_zh and h.origin_kind is null;

-- 名单里已经在库里的药都要有来源（少了说明上面没执行到）
do $$
declare missing text;
begin
  select string_agg(name_zh, '、') into missing from public.herbs
  where origin_kind is null and name_zh in (${[...kinds.keys()].map((n) => `'${n}'`).join(", ")});
  if missing is not null then raise exception '这些药没有填上来源：%', missing; end if;
end $$;
`;

writeFileSync(out, sql);
const count = (o) => [...kinds.values()].filter(([x]) => x === o).length;
console.log(`已生成 ${out}：${kinds.size} 味（${ORIGINS.map((o) => `${o} ${count(o)}`).join("、")}）`);
