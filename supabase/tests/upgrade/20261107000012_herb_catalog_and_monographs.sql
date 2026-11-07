-- migration 20261107000012_herb_catalog_and_monographs 在「有数据的库」上的行为（docs/design/0010 §3.2、§3.4）
-- 1. 「沙参」改名「南沙参」：药材 id 不变，已有药方跟着变；输入「沙参」还能找到
-- 2. 用户自己加过的同名药不重复建，资料挂在它上面
-- 3. 目录里每味药都有资料，全是草稿
\ir ../_helpers.sql

select assert_eq((select count(*) from herbs where name_zh = '沙参'), 0::bigint, '「沙参」改名了');
select assert_eq((select h.name_zh from prescription_items i join herbs h on h.id = i.herb_id where i.raw_name = '沙参'), '南沙参', '已有药方里的沙参显示南沙参（id 不变）');
select assert_eq((select name_zh from herbs where id = match_herb('沙参')), '南沙参', '输入「沙参」找到南沙参');
select assert_eq((select count(*) from herbs where name_zh = '北沙参'), 1::bigint, '北沙参另列');

select assert_eq((select count(*) from herbs where name_zh = '铁皮石斛'), 1::bigint, '用户加过的铁皮石斛没有重复建');
select assert_eq((select m.nature from herb_monographs m join herbs h on h.id = m.herb_id where h.name_zh = '铁皮石斛'), '微寒', '资料挂在用户加的那味药上');

select assert_eq((select count(*) from herbs h where h.pinyin is not null and not exists (select 1 from herb_monographs m where m.herb_id = h.id)), 0::bigint, '目录里每味药都有资料');
select assert_eq((select count(*) from herb_monographs where status <> 'draft'), 0::bigint, '全是草稿');
