-- MVP1 基础流程：药方、采购、库存、统计、隔离
-- （最初的版本用 \if ... \quit 报失败，psql 的 \quit 退出码是 0，失败也会被当成通过。已改用 assert_eq。）
\ir _helpers.sql
:as_hao;
select ensure_default_workspace() as ws \gset
select assert_eq(ensure_default_workspace(), :'ws'::uuid, '再调一次返回同一个 workspace');
select assert_eq((select count(*) from workspaces), 1::bigint, '只有一个 workspace');

-- 药方：黄芪（用别名北芪录入）15g、麦冬 10g，3 副；第二张黄芪 30g，7 副
insert into prescriptions (workspace_id, title, dose_count, issued_on) values (:'ws', '测试方一', 3, '2026-10-01') returning id as rx1 \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose, raw_name) values
  (:'rx1', match_herb('北芪'), 15, '北芪'), (:'rx1', match_herb('麦冬'), 10, '麦冬');
insert into prescriptions (workspace_id, title, dose_count, issued_on) values (:'ws', '测试方二', 7, '2026-10-20') returning id as rx2 \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose) values (:'rx2', match_herb('黄芪'), 30);

-- 采购：黄芪 500g $12.50，麦冬 250g $9
insert into stores (workspace_id, name) values (:'ws', 'T&T') returning id as st \gset
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'st', '2026-09-15') returning id as pu \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values
  (:'pu', match_herb('黄芪'), 500, 12.50), (:'pu', match_herb('麦冬'), 250, 9.00);

-- 配测试方一 3 副：黄芪 -45，麦冬 -30
select assert_eq(consume_prescription(:'rx1'), 2, 'consume 写了 2 条流水');
select assert_eq(stock('黄芪'), 455::numeric, '黄芪库存');
select assert_eq(stock('麦冬'), 220::numeric, '麦冬库存');
select assert_eq((select prescription_count from v_herb_usage where name_zh = '黄芪'), 2::bigint, '黄芪出现在 2 张药方');
select assert_eq((select total_grams from v_herb_usage where name_zh = '黄芪'), 255::numeric, '黄芪累计 15×3 + 30×7');
select assert_eq((select min_grams_per_dose from v_herb_usage where name_zh = '黄芪'), 15::numeric, '最小剂量');
select assert_eq((select max_grams_per_dose from v_herb_usage where name_zh = '黄芪'), 30::numeric, '最大剂量');
select assert_eq((select price_per_gram from v_purchase_prices where name_zh = '黄芪'), 0.025, '单价');

-- 改采购克数 → 库存跟着变
update purchase_items set grams = 600 where herb_id = match_herb('黄芪');
select assert_eq(stock('黄芪'), 555::numeric, '采购修改同步库存');

-- 陌生人：看不到，也写不进
:as_other;
select assert_eq((select count(*) from prescriptions), 0::bigint, 'RLS：药方');
select assert_eq((select count(*) from v_inventory), 0::bigint, 'RLS：库存');
select assert_eq((select count(*) > 100 from herbs), true, '药材目录大家都能读');
select assert_raises(format('insert into prescriptions (workspace_id) values (%L)', :'ws'), 'row-level security', '陌生人写别人的 workspace');
reset role;
select assert_eq((select count(*) from prescriptions), 2::bigint, '陌生人没写进去');

\echo 'mvp1_test: PASSED'
