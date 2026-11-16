-- 药材的来源和入药部位（docs/design/0018）：数据、约束、谁都不能改
\ir _helpers.sql
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to anon;

-- ---- 数据：目录里每味药都有来源；植物都有部位，别的都没有 ----
-- 期望值按 herb-kinds.json 手数的（0018 §2）；炮制品跟原药材，胆南星例外
select assert_eq((select count(*) from herbs where pinyin is not null and origin_kind is null), 0::bigint, '目录里每味药都有来源');
select assert_eq((select count(*) from herbs where origin_kind = 'plant' and medicinal_part is null), 0::bigint, '植物都有部位');
select assert_eq((select string_agg(origin_kind || ' ' || n, ', ' order by origin_kind) from (
  select origin_kind, count(*) n from herbs where base_herb_id is null and pinyin is not null group by 1) s),
  'animal 35, fungus 9, manufactured 8, mineral 16, plant 362', '原药材各来源的味数');
select assert_eq((select string_agg(origin_kind || ' ' || n, ', ' order by origin_kind) from (
  select origin_kind, count(*) n from herbs where base_herb_id is not null group by 1) s),
  'animal 6, manufactured 2, mineral 4, plant 65', '炮制品各来源的味数');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '黄芪'), 'plant/root', '黄芪：植物 · 根');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '炙黄芪'), 'plant/root', '炙黄芪跟黄芪');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '茯苓'), 'fungus/-', '茯苓：菌藻，没有部位');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '煅牡蛎'), 'animal/-', '煅牡蛎跟牡蛎：动物');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '枯矾'), 'mineral/-', '枯矾跟白矾：矿物');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '天南星'), 'plant/root', '天南星：植物 · 根及根茎');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '胆南星'), 'manufactured/-', '胆南星例外：加工品');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '陈皮'), 'plant/fruit_seed', '陈皮是果皮：果实种子');
select assert_eq((select origin_kind || '/' || coalesce(medicinal_part, '-') from herbs where name_zh = '侧柏炭'), 'plant/leaf', '侧柏炭跟侧柏叶：叶');

-- ---- 约束 ----
select assert_raises($$update herbs set origin_kind = 'wild' where name_zh = '黄芪'$$, 'check', '来源只能是固定几种（野生不是来源）');
select assert_raises($$update herbs set medicinal_part = 'seed' where name_zh = '黄芪'$$, 'check', '部位只能是固定几种');
select assert_raises($$update herbs set medicinal_part = null where name_zh = '黄芪'$$, 'herbs_medicinal_part_plant_only', '植物一定有部位');
select assert_raises($$update herbs set medicinal_part = 'root' where name_zh = '牡蛎'$$, 'herbs_medicinal_part_plant_only', '动物不能有部位');
select assert_raises($$update herbs set medicinal_part = 'root' where name_zh = '茯苓'$$, 'herbs_medicinal_part_plant_only', '菌藻不能有部位');
select assert_raises($$update herbs set origin_kind = null where name_zh = '黄芪'$$, 'herbs_medicinal_part_plant_only', '没有来源就不能有部位');

-- ---- 谁都不能改（目录只读，0004 S2）----
:as_hao;
select assert_eq((select origin_kind from herbs where name_zh = '石膏'), 'mineral', '登录用户能读');
select assert_raises($$update herbs set origin_kind = 'animal' where name_zh = '石膏'$$, 'permission denied', '登录用户不能改来源');
select assert_raises($$update herbs set medicinal_part = 'leaf' where name_zh = '黄芪'$$, 'permission denied', '登录用户不能改部位');
select assert_raises($$insert into herbs (name_zh, origin_kind) values ('秘方草甲', 'mineral')$$, 'permission denied', '新增时不能写来源');
select assert_raises($$insert into herbs (name_zh, origin_kind, medicinal_part) values ('秘方草乙', 'plant', 'root')$$, 'permission denied', '新增时不能写部位');
-- 旧代码只写药名：照常能新增，新药是「未分类」
insert into herbs (name_zh) values ('秘方草丙');
select assert_eq((select row(origin_kind, medicinal_part)::text from herbs where name_zh = '秘方草丙'), '(,)', '用户新增的药没有来源和部位');
reset role;
set role anon; set request.jwt.claim.sub = '';
select assert_raises($$update herbs set origin_kind = 'animal' where name_zh = '石膏'$$, 'permission denied', '未登录不能改');
reset role;
select assert_eq((select origin_kind from herbs where name_zh = '石膏'), 'mineral', '石膏还是矿物');
