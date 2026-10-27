-- MVP2：比价视图、每副成本、各店对比、药柜价值
\ir _helpers.sql
:as_hao;
select ensure_default_workspace() as ws \gset

insert into stores (workspace_id, name, kind) values (:'ws', 'A店', 'shop') returning id as sa \gset
insert into stores (workspace_id, name, kind) values (:'ws', 'B店', 'online') returning id as sb \gset
insert into stores (workspace_id, name, kind) values (:'ws', 'C诊所', 'clinic') returning id as sc \gset
insert into stores (workspace_id, name) values (:'ws', '没买过东西的店');

-- 黄芪：A 两次（后一次更贵）、A 同一天又买一次（按录入先后）、B 最便宜、C 最贵
insert into purchases (workspace_id, store_id, purchased_on, created_at) values (:'ws', :'sa', '2026-09-01', '2026-09-01 10:00') returning id as p1 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p1', match_herb('黄芪'), 500, 10),     -- 0.020
                                                                       (:'p1', match_herb('大枣'), 100, 0),      -- 赠品
                                                                       (:'p1', match_herb('甘草'), 100, 0);      -- 赠品
insert into purchases (workspace_id, store_id, purchased_on, created_at) values (:'ws', :'sa', '2026-10-01', '2026-10-01 09:00') returning id as p2 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p2', match_herb('黄芪'), 500, 12.5);  -- 0.025
insert into purchases (workspace_id, store_id, purchased_on, created_at) values (:'ws', :'sa', '2026-10-01', '2026-10-01 18:00') returning id as p3 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p3', match_herb('黄芪'), 500, 15);    -- 0.030（同一天后录入 → A 现价）
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'sb', '2026-09-15') returning id as p4 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p4', match_herb('黄芪'), 250, 4),      -- 0.016
                                                                       (:'p4', match_herb('大枣'), 200, 4);      -- 0.020
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'sc', '2026-10-05') returning id as p5 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p5', match_herb('黄芪'), 100, 3);      -- 0.030

-- ---- v_store_latest_prices ----
select assert_eq((select price_per_gram from v_store_latest_prices where name_zh = '黄芪' and store_name = 'A店'), 0.030000, 'A 店现价 = 同一天最后录入的');
select assert_eq((select purchase_count from v_store_latest_prices where name_zh = '黄芪' and store_name = 'A店'), 3::bigint, 'A 店买过 3 次');
select assert_eq((select count(*) from v_store_latest_prices where name_zh = '大枣'), 1::bigint, '赠品不参与比价（大枣只有 B 店）');
select assert_eq((select count(*) from v_store_latest_prices where name_zh = '甘草'), 0::bigint, '只有赠品 → 没有比价');
select assert_eq((select store_kind from v_store_latest_prices where store_name = 'C诊所' limit 1), 'clinic', '店铺类型');

-- ---- v_herb_price_summary ----
select assert_eq((select cheapest_store_name from v_herb_price_summary where name_zh = '黄芪'), 'B店', '黄芪最便宜 B 店');
select assert_eq((select min_ppg from v_herb_price_summary where name_zh = '黄芪'), 0.016000, 'min');
select assert_eq((select max_ppg from v_herb_price_summary where name_zh = '黄芪'), 0.030000, 'max');
select assert_eq((select spread_pct from v_herb_price_summary where name_zh = '黄芪'), 87.5, '价差 (0.03-0.016)/0.016');
select assert_eq((select store_count from v_herb_price_summary where name_zh = '黄芪'), 3::bigint, '3 家店有价');
select assert_eq((select avg_cost_per_gram from v_herb_price_summary where name_zh = '黄芪'), 0.024054, '加权平均成本 44.5/1850');
select assert_eq((select avg_cost_per_gram from v_herb_price_summary where name_zh = '大枣'), 0.013333, '平均成本含赠品 4/300');
select assert_eq((select store_count from v_herb_price_summary where name_zh = '甘草'), 0::bigint, '只有赠品：0 家店有价');
select assert_eq((select avg_cost_per_gram from v_herb_price_summary where name_zh = '甘草'), null::numeric, '只有赠品：平均成本为 null（不假装是 0 元）');
select assert_eq((select cheapest_store_name from v_herb_price_summary where name_zh = '甘草'), null::text, '只有赠品：没有最便宜的店');

-- 同价时：取最近买的那家；还同就按店名
insert into stores (workspace_id, name) values (:'ws', 'D店') returning id as sd \gset
insert into stores (workspace_id, name) values (:'ws', 'E店') returning id as se \gset
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'sd', '2026-08-01') returning id as p6 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p6', match_herb('当归'), 100, 5);
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'se', '2026-08-20') returning id as p7 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p7', match_herb('当归'), 100, 5);
select assert_eq((select cheapest_store_name from v_herb_price_summary where name_zh = '当归'), 'E店', '同价取最近买的');
update purchases set purchased_on = '2026-08-01' where id = :'p7';
select assert_eq((select cheapest_store_name from v_herb_price_summary where name_zh = '当归'), 'D店', '同价同日按店名');
delete from purchases where id in (:'p6', :'p7');
delete from stores where id in (:'sd', :'se');

-- ---- prescription_cost ----
insert into prescriptions (workspace_id, title, dose_count) values (:'ws', '测试方', 7) returning id as rx \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose, sort_order) values
  (:'rx', match_herb('黄芪'), 15, 0), (:'rx', match_herb('大枣'), 6, 1), (:'rx', match_herb('甘草'), 3, 2), (:'rx', match_herb('防风'), 6, 3);

select assert_eq((select cost_per_dose from prescription_cost(:'rx') where name_zh = '黄芪'), 0.2400, 'cheapest：黄芪 15×0.016');
select assert_eq((select store_name from prescription_cost(:'rx') where name_zh = '黄芪'), 'B店', 'cheapest：来自 B 店');
select assert_eq((select cost_per_dose from prescription_cost(:'rx') where name_zh = '大枣'), 0.1200, 'cheapest：大枣 6×0.02');
select assert_eq((select cost_per_dose from prescription_cost(:'rx') where name_zh = '甘草'), null::numeric, 'cheapest：只有赠品 → 无价');
select assert_eq((select cost_per_dose from prescription_cost(:'rx') where name_zh = '防风'), null::numeric, 'cheapest：没买过 → 无价');
select assert_eq((select count(*) from prescription_cost(:'rx')), 4::bigint, '每味药都返回一行（无价的也在）');
select assert_eq((select string_agg(name_zh, ',') from prescription_cost(:'rx')), '黄芪,大枣,甘草,防风', '按处方顺序');

select assert_eq((select cost_per_dose from prescription_cost(:'rx', 'average') where name_zh = '黄芪'), 0.3608, 'average：15×0.024054');
select assert_eq((select cost_per_dose from prescription_cost(:'rx', 'average') where name_zh = '甘草'), null::numeric, 'average：只有赠品 → 无价');
select assert_eq((select cost_per_dose from prescription_cost(:'rx', 'store', :'sa') where name_zh = '黄芪'), 0.4500, 'store A：15×0.03');
select assert_eq((select cost_per_dose from prescription_cost(:'rx', 'store', :'sa') where name_zh = '大枣'), null::numeric, 'store A：大枣只有赠品');

select assert_raises(format('select * from prescription_cost(%L, %L)', :'rx', 'bogus'), 'unknown strategy', '未知策略');
select assert_raises(format('select * from prescription_cost(%L, %L)', :'rx', 'store'), 'needs p_store_id', 'store 策略缺店');
select assert_raises('select * from prescription_cost(gen_random_uuid())', 'prescription not found', '不存在的药方');

-- ---- prescription_cost_by_store ----
select assert_eq((select string_agg(store_name || ':' || cost_per_dose || '/' || missing_items, ' ') from prescription_cost_by_store(:'rx')),
                 'B店:0.3600/2 A店:0.4500/3 C诊所:0.4500/3', '各店：缺得少的在前，再按价格、店名');
select assert_eq((select count(*) from prescription_cost_by_store(:'rx') where store_name = '没买过东西的店'), 0::bigint, '没有任何价格的店不列出');

-- ---- v_inventory_value ----
select assert_eq((select value from v_inventory_value where name_zh = '黄芪'), 44.50, '黄芪价值 1850 × 0.024054');
select assert_eq((select value from v_inventory_value where name_zh = '大枣'), 4.00, '大枣价值');
-- 煎 100 副：防风、甘草变负
select record_decoction(:'rx', 100) as d \gset
select assert_eq((select value from v_inventory_value where name_zh = '防风'), null::numeric, '没成本的药价值为 null');
select assert_eq((select value from v_inventory_value where name_zh = '大枣'), 0.00, '负库存按 0 计（大枣 300-600）');
select assert_eq((select value from v_inventory_value where name_zh = '甘草'), null::numeric, '只有赠品的药没有价值');

-- ---- RLS ----
:as_other;
select ensure_default_workspace() is not null as _ \gset
select assert_eq((select count(*) from v_store_latest_prices), 0::bigint, '陌生人看不到价格');
select assert_eq((select count(*) from v_herb_price_summary), 0::bigint, '陌生人看不到比价');
select assert_eq((select count(*) from v_inventory_value), 0::bigint, '陌生人看不到药柜价值');
select assert_raises(format('select * from prescription_cost(%L)', :'rx'), 'prescription not found', '陌生人算别人药方成本');
select assert_eq((select count(*) from prescription_cost_by_store(:'rx')), 0::bigint, '陌生人看不到各店对比');

\echo 'pricing_test: PASSED'
