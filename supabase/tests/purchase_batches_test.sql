-- 批次：批号自动生成、批次字段（docs/design/0010 §3.3）
\ir _helpers.sql

select assert_eq(lot_prefix('mai dong'), 'MD', '前缀 MD');
select assert_eq(lot_prefix('nv zhen zi'), 'NZZ', '三个字');
select assert_eq(lot_prefix(null), 'X', '没有拼音 → X');
select assert_eq(lot_prefix('  Bai  Zhu '), 'BZ', '大小写、空格');

:as_hao;
select ensure_default_workspace() as ws \gset
insert into stores (workspace_id, name) values (:'ws', '孔大吉') returning id as store \gset

-- 2026 年 11 月：麦冬（带批次信息）、黄芪、黄芩（同为 HQ）
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'store', '2026-11-05') returning id as p1 \gset
insert into purchase_items (purchase_id, herb_id, grams, price, origin, supplier_lot, packed_on)
select :'p1', id, 227, 23.99, '中国 · 浙江', 'ZJ20261001', '2026-11-06' from herbs where name_zh = '麦冬';
insert into purchase_items (purchase_id, herb_id, grams, price) select :'p1', id, 500, 30 from herbs where name_zh = '黄芪';
insert into purchase_items (purchase_id, herb_id, grams, price) select :'p1', id, 250, 20 from herbs where name_zh = '黄芩';

select assert_eq((select lot_no from purchase_items i join herbs h on h.id = i.herb_id where i.purchase_id = :'p1' and h.name_zh = '麦冬'), 'MD-2611-01', '麦冬 11 月第一批');
select assert_eq((select lot_no from purchase_items i join herbs h on h.id = i.herb_id where i.purchase_id = :'p1' and h.name_zh = '黄芪'), 'HQ-2611-01', '黄芪 HQ-01');
select assert_eq((select lot_no from purchase_items i join herbs h on h.id = i.herb_id where i.purchase_id = :'p1' and h.name_zh = '黄芩'), 'HQ-2611-02', '黄芩也是 HQ，序号接着排，不撞');
select assert_eq((select origin || '|' || supplier_lot || '|' || packed_on from purchase_items i join herbs h on h.id = i.herb_id where h.name_zh = '麦冬'),
  '中国 · 浙江|ZJ20261001|2026-11-06', '批次信息存下了');

-- 同月第二次进麦冬 → 02；下个月 → 重新从 01 开始
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'store', '2026-11-20') returning id as p2 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) select :'p2', id, 100, 10 from herbs where name_zh = '麦冬';
select assert_eq((select lot_no from purchase_items where purchase_id = :'p2'), 'MD-2611-02', '同月第二批');
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'store', '2026-12-01') returning id as p3 \gset
insert into purchase_items (purchase_id, herb_id, grams, price, lot_no) select :'p3', id, 100, 10, '我自己编的' from herbs where name_zh = '麦冬';
select assert_eq((select lot_no from purchase_items where purchase_id = :'p3'), 'MD-2612-01', '下个月从 01 开始；批号总是系统生成');

-- 用户自己加的药（没有拼音）→ X
insert into herbs (name_zh) values ('测试新药') returning id as newherb \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p3', :'newherb', 50, 5);
select assert_eq((select lot_no from purchase_items where herb_id = :'newherb'), 'X-2612-01', '没有拼音的药 → X');

-- 批号改不了
update purchase_items set lot_no = 'HQ-2611-99999999999', origin = '改过的产地' where purchase_id = :'p1' and herb_id = (select id from herbs where name_zh = '黄芪');
select assert_eq((select lot_no || '|' || origin from purchase_items where purchase_id = :'p1' and herb_id = (select id from herbs where name_zh = '黄芪')),
  'HQ-2611-01|改过的产地', '批号改不了，别的字段照常能改');

-- 序号超过 99：照常变长，不截断、不重复
insert into purchases (workspace_id, purchased_on) select :'ws', '2027-01-15' from generate_series(1, 101);
insert into purchase_items (purchase_id, herb_id, grams, price)
select pu.id, h.id, 10, 1 from purchases pu, herbs h where pu.workspace_id = :'ws' and pu.purchased_on = '2027-01-15' and h.name_zh = '党参';
select assert_eq((select count(distinct lot_no) from purchase_items where lot_no like 'DS-2701-%'), 101::bigint, '101 个批号都不一样');
select assert_eq((select count(*) from purchase_items where lot_no in ('DS-2701-01', 'DS-2701-99', 'DS-2701-100', 'DS-2701-101')), 4::bigint, '01 … 99、100、101');

-- 字段长度
select assert_raises(format('insert into purchase_items (purchase_id, herb_id, grams, price, origin) select %L, id, 1, 1, %L from herbs where name_zh = %L', :'p3', repeat('产', 41), '黄芪'), 'check', '产地太长');
reset role;

-- 另一个药柜的序号独立
:as_tina;
select ensure_default_workspace() as ws2 \gset
insert into purchases (workspace_id, purchased_on) values (:'ws2', '2026-11-05') returning id as q1 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) select :'q1', id, 100, 10 from herbs where name_zh = '麦冬';
select assert_eq((select lot_no from purchase_items where purchase_id = :'q1'), 'MD-2611-01', '别的药柜从 01 开始');
-- 看不到别人的批次
select assert_eq((select count(*) from purchase_items where purchase_id = :'p1'), 0::bigint, '看不到 Hao 的批次');
reset role;

-- 函数权限
select assert_eq(has_function_privilege('authenticated', 'public.next_lot_no(uuid, uuid, date)', 'execute'), false, '不能直接调 next_lot_no');
select assert_eq(has_function_privilege('authenticated', 'public.assign_lot_no()', 'execute'), false, '不能直接调触发器函数');
select assert_eq(has_function_privilege('authenticated', 'public.keep_lot_no()', 'execute'), false, '不能直接调触发器函数 keep_lot_no');
