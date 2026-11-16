-- migration 20261114000026_herb_kinds 在「有数据的库」上的行为（docs/design/0018 §3.4）
-- 1. 目录里的药（包括 20261113000025 新加的）都填上；用户自己加的、名字和目录一样的药（延胡索、红参）按名字填
-- 2. 用户自己加的、目录里没有的名字（云苓）不填，「未分类」
-- 3. 旧代码照常：只写药名能新增；处方不变
-- 4. 可以重复执行；已经有值的不改
\ir ../_helpers.sql

-- 1. 目录
select assert_eq((select count(*) from herbs where pinyin is not null and origin_kind is null), 0::bigint, '目录里每味药都有来源');
select assert_eq((select origin_kind || '/' || medicinal_part from herbs where name_zh = '延胡索'), 'plant/root', '用户自己加的延胡索按名字填上');
select assert_eq((select origin_kind || '/' || medicinal_part from herbs where name_zh = '红参'), 'plant/root', '用户自己加的红参（没挂到人参下）按名字填上');
select assert_eq((select origin_kind from herbs where name_zh = '龟甲'), 'animal', '#34 新加的龟甲：动物');
select assert_eq((select origin_kind || '/' || medicinal_part from herbs where name_zh = '制附子'), 'plant/root', '#34 新加的炮制品跟原药材');
select assert_eq((select origin_kind || '/' || medicinal_part from herbs where name_zh = '醋延胡索'), 'plant/root', '挂在用户的延胡索下的炮制品');

-- 2. 目录里没有的名字
select assert_eq((select row(origin_kind, medicinal_part)::text from herbs where name_zh = '云苓'), '(,)', '用户自己加的云苓不填');

-- 3. 旧代码：只写药名
select assert_eq((select count(*) from prescription_items i join herbs h on h.id = i.herb_id where h.name_zh in ('云苓', '红参', '延胡索')), 3::bigint, '写了这些药的处方不变');
:as_hao;
insert into herbs (name_zh) values ('升级后新加的药');
select assert_raises($$update herbs set origin_kind = 'animal' where name_zh = '升级后新加的药'$$, 'permission denied', '客户端不能改来源');
reset role;
select assert_eq((select origin_kind from herbs where name_zh = '升级后新加的药'), null::text, '新加的药是未分类');

-- 4. 重复执行：什么都不变；已经有值的不改（模拟以后有人手工改过某味药）
update herbs set origin_kind = 'mineral', medicinal_part = null where name_zh = '龙眼肉';
create temp table before_rerun as
  select md5(string_agg(name_zh || ':' || coalesce(origin_kind, '') || ':' || coalesce(medicinal_part, ''), ',' order by name_zh)) k from herbs;
\ir ../../migrations/20261114000026_herb_kinds.sql
select assert_eq((select k from before_rerun),
  (select md5(string_agg(name_zh || ':' || coalesce(origin_kind, '') || ':' || coalesce(medicinal_part, ''), ',' order by name_zh)) from herbs),
  '再执行一遍什么都不变');
select assert_eq((select origin_kind from herbs where name_zh = '龙眼肉'), 'mineral', '已经有值的不覆盖');
