-- migration 20261113000025_herb_catalog_expand 在「有数据的库」上的行为（docs/design/0017）
-- 1. 已有的药不动：用户自己加过的同名药不重复建、id 和处方不变；新的炮制品、别名挂在它上面
-- 2. 别名冲突：名字已经被别名占用的新药不建（match_herb 结果不变）；已有的别名不改指向
-- 3. 已有处方引用的药材不受影响；目录扩到 400 味以上
\ir ../_helpers.sql

-- 1. 用户加过的「延胡索」
select assert_eq((select count(*) from herbs where name_zh = '延胡索'), 1::bigint, '用户加过的延胡索没有重复建');
select assert_eq((select pinyin from herbs where name_zh = '延胡索'), null::text, '已有的药不改（拼音还是空的）');
select assert_eq((select h.name_zh from prescription_items i join herbs h on h.id = i.herb_id
  join prescriptions p on p.id = i.prescription_id where p.title = '张三 · 处方' and i.sort_order = 3), '延胡索', '处方里的延胡索还是那一味');
select assert_eq((select b.name_zh from herbs h join herbs b on b.id = h.base_herb_id where h.name_zh = '醋延胡索'), '延胡索', '新炮制品挂在用户加的延胡索上');
select assert_eq((select name_zh from herbs where id = match_herb('元胡')), '延胡索', '新别名「元胡」指向用户加的延胡索');

-- 用户加过的「云苓」（药名）：别名「云苓」不建，输入「云苓」还是找到用户那味
select assert_eq((select count(*) from herb_aliases where alias = '云苓'), 0::bigint, '和已有药名同名的别名不建');
select assert_eq(match_herb('云苓'), (select id from herbs where name_zh = '云苓'), '云苓还是找到用户加的那味');
select assert_eq((select count(*) from prescription_items i join herbs h on h.id = i.herb_id where h.name_zh in ('云苓', '红参')), 2::bigint, '写了云苓、红参的处方不变');
-- 用户加过的「红参」：不改成炮制品
select assert_eq((select base_herb_id from herbs where name_zh = '红参'), null::uuid, '用户加的红参不动（不挂到人参下）');

-- 2. 管理员加过的别名
select assert_eq((select count(*) from herbs where name_zh = '龙齿'), 0::bigint, '名字已经是别名的新药不建');
select assert_eq((select name_zh from herbs where id = match_herb('龙齿')), '黄芪', '「龙齿」找到的药不变');
select assert_eq((select name_zh from herbs where id = match_herb('川军')), '甘草', '已有的别名不改指向');

-- 3. 目录
select assert_eq((select count(*) >= 400 from herbs where base_herb_id is null and pinyin is not null), true, '目录里的原药材 >= 400');
select assert_eq((select name_zh from herbs where id = match_herb('龟板')), '龟甲', '新别名能用');
select assert_eq((select b.name_zh from herbs h join herbs b on b.id = h.base_herb_id where h.name_zh = '制附子'), '附子', '新炮制品指回原药材');
select assert_eq((select count(*) from herb_aliases a join herbs h on h.name_zh = a.alias), 0::bigint, '没有和药名重名的别名');

-- 4. 可以重复执行：再跑一遍，什么都不变
create temp table before_rerun as
  select (select count(*) from herbs) h, (select count(*) from herb_aliases) a, (select count(*) from herb_monographs) m,
         (select md5(string_agg(id::text || name_zh || coalesce(base_herb_id::text, ''), ',' order by name_zh)) from herbs) k;
\ir ../../migrations/20261113000025_herb_catalog_expand.sql
select assert_eq((select row(h, a, m, k)::text from before_rerun),
  (select row((select count(*) from herbs), (select count(*) from herb_aliases), (select count(*) from herb_monographs),
    (select md5(string_agg(id::text || name_zh || coalesce(base_herb_id::text, ''), ',' order by name_zh)) from herbs))::text),
  '再执行一遍什么都不变');
