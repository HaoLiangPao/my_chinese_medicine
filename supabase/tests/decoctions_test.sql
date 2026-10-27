-- 煎药（record_decoction）及相关边界情况
\ir _helpers.sql
:as_hao;
select public.ensure_default_workspace() as ws \gset

-- 补中益气汤（部分）：黄芪 18、炙甘草 9、陈皮 6，处方 7 副
insert into prescriptions (workspace_id, title, dose_count) values (:'ws', '补中益气汤', 7) returning id as rx \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose) values
  (:'rx', match_herb('黄芪'), 18), (:'rx', match_herb('炙甘草'), 9), (:'rx', match_herb('陈皮'), 6);

-- 库存：黄芪 500、炙甘草 100、陈皮 50、生姜 0（没买过）
insert into purchases (workspace_id) values (:'ws') returning id as pu \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values
  (:'pu', match_herb('黄芪'), 500, 12), (:'pu', match_herb('炙甘草'), 100, 4), (:'pu', match_herb('陈皮'), 50, 3);

-- 1) 按处方煎 3 副：黄芪 -54，炙甘草 -27，陈皮 -18
select record_decoction(:'rx', 3) as d1 \gset
select assert_eq(stock('黄芪'), 446::numeric, '按处方：黄芪');
select assert_eq(stock('炙甘草'), 73::numeric, '按处方：炙甘草');
select assert_eq(stock('陈皮'), 32::numeric, '按处方：陈皮');
select assert_eq((select count(*) from v_decoction_variance where decoction_id = :'d1' and status = 'exact'), 3::bigint, '按处方：三味都是 exact');

-- 2) 多用：黄芪多抓了 5 g（3 副应 54，实际 59）
select record_decoction(:'rx', 3, jsonb_build_array(jsonb_build_object('herb_id', match_herb('黄芪'), 'grams', 59))) as d2 \gset
select assert_eq(stock('黄芪'), 387::numeric, '多用 5g：黄芪 446-59');
select assert_eq(stock('炙甘草'), 46::numeric, '多用：其他药仍按处方');
select assert_eq((select diff_grams from v_decoction_variance where decoction_id = :'d2' and name_zh = '黄芪'), 5::numeric, '多用：差额 +5');
select assert_eq((select status from v_decoction_variance where decoction_id = :'d2' and name_zh = '黄芪'), 'over', '多用：status over');

-- 3) 没放（0g）+ 少用 + 处方外加药，且同一味药在 p_actual 里写了两次（应求和）
select record_decoction(:'rx', 1, jsonb_build_array(
  jsonb_build_object('herb_id', match_herb('陈皮'), 'grams', 0),
  jsonb_build_object('herb_id', match_herb('炙甘草'), 'grams', 5),
  jsonb_build_object('herb_id', match_herb('生姜'), 'grams', 6),
  jsonb_build_object('herb_id', match_herb('生姜'), 'grams', 3)
), '加了姜') as d3 \gset
select assert_eq(stock('陈皮'), 14::numeric, '没放：陈皮不扣（32-18(第2次)=14）');
select assert_eq(stock('炙甘草'), 41::numeric, '少用：炙甘草 46-5');
select assert_eq(stock('生姜'), -9::numeric, '处方外加药：生姜 6+3，没库存 → -9');
select assert_eq((select status from v_decoction_variance where decoction_id = :'d3' and name_zh = '陈皮'), 'omitted', 'status omitted');
select assert_eq((select status from v_decoction_variance where decoction_id = :'d3' and name_zh = '炙甘草'), 'under', 'status under');
select assert_eq((select status from v_decoction_variance where decoction_id = :'d3' and name_zh = '生姜'), 'extra', 'status extra');
select assert_eq((select count(*) from inventory_txns where decoction_id = :'d3'), 3::bigint, '没放的药不写流水（黄芪/炙甘草/生姜 3 条）');
select assert_eq((select note from decoctions where id = :'d3'), '加了姜', '备注保存');

-- 4) 库存可以变负数（提醒补货）：煎 30 副，黄芪 18*30=540 > 387
select record_decoction(:'rx', 30) as d4 \gset
select assert_eq(stock('黄芪'), -171::numeric, '库存变负：369 - 540');
select assert_eq((select is_low from v_inventory where name_zh = '黄芪'), false, '没设提醒线时 is_low = false');

insert into pantry_settings (workspace_id, herb_id, low_stock_grams) values (:'ws', match_herb('黄芪'), 100);
select assert_eq((select is_low from v_inventory where name_zh = '黄芪'), true, '设了提醒线且低于 → is_low');

-- 5) 撤销一次煎药 = 删除 decoction，流水级联删除，库存恢复
delete from decoctions where id = :'d4';
select assert_eq(stock('黄芪'), 369::numeric, '撤销煎药后库存恢复');

-- 6) 非法输入
select assert_raises(format('select record_decoction(%L, 0)', :'rx'), 'doses must be positive', '0 副');
select assert_raises(format('select record_decoction(%L, -2)', :'rx'), 'doses must be positive', '负数副');
select assert_raises('select record_decoction(gen_random_uuid(), 1)', 'prescription not found', '不存在的药方');
select assert_raises(format('select record_decoction(%L, 1, %L::jsonb)', :'rx', '{"a":1}'), 'must be a JSON array', 'p_actual 不是数组');
select assert_raises(format('select record_decoction(%L, 1, %L::jsonb)', :'rx',
  jsonb_build_array(jsonb_build_object('herb_id', match_herb('黄芪'), 'grams', -1))), 'grams >= 0', '负克数');
select assert_raises(format('select record_decoction(%L, 1, %L::jsonb)', :'rx', '[{"grams": 5}]'), 'needs herb_id', '缺 herb_id');
select assert_raises(format('select record_decoction(%L, 1, %L::jsonb)', :'rx',
  jsonb_build_array(jsonb_build_object('herb_id', gen_random_uuid(), 'grams', 5))), 'foreign key', '不存在的药材');
select assert_eq((select count(*) from decoctions), 3::bigint, '失败的调用不留下半条记录');

-- 7) 旧接口 consume_prescription 仍可用，返回写入的流水条数
select assert_eq(consume_prescription(:'rx', 1), 3, 'consume_prescription 包装 record_decoction');
select assert_eq(stock('黄芪'), 351::numeric, 'consume_prescription 扣库存');

-- 8) 陌生人不能给别人的药方记煎药，也看不到煎药记录
:as_other;
select ensure_default_workspace() is not null as _ \gset
select assert_raises(format('select record_decoction(%L, 1)', :'rx'), 'prescription not found', '陌生人煎别人的药');
select assert_eq((select count(*) from decoctions), 0::bigint, '陌生人看不到 decoctions');
select assert_eq((select count(*) from v_decoction_variance), 0::bigint, '陌生人看不到 variance');
select assert_eq((select count(*) from decoction_items), 0::bigint, '陌生人看不到 decoction_items');

-- 9) 删除药方：煎药记录保留（prescription_id 置空），已扣的库存不回滚
:as_hao;
delete from prescriptions where id = :'rx';
select assert_eq((select count(*) from decoctions where prescription_id is null), 4::bigint, '删药方后煎药记录还在');
select assert_eq(stock('黄芪'), 351::numeric, '删药方不影响库存');

-- 10) 采购日期修改 → 流水时间同步
update purchases set purchased_on = '2026-01-15' where id = :'pu';
select assert_eq((select min(occurred_at)::date from inventory_txns where kind = 'purchase'), '2026-01-15'::date, '采购改日期同步流水');

-- 11) 删除采购明细 → 对应入库流水一起删
delete from purchase_items where purchase_id = :'pu' and herb_id = match_herb('陈皮');
select assert_eq(stock('陈皮'), -42::numeric, '删采购明细后库存减回去（0 - 18 - 18 - 6）');

\echo 'decoctions_test: PASSED'
