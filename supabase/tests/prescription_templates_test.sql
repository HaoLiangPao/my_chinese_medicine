-- 预设药方 + 处方复用（docs/design/0013）
\ir _helpers.sql

-- Tina 是诊所，Hao 是家庭
:as_tina;
select choose_account_kind('clinic', '测试诊所') as clinic \gset
select id as huangqi from herbs where name_zh = '黄芪' \gset
select id as baizhu from herbs where name_zh = '白术' \gset
insert into prescription_templates (workspace_id, name, dose_count) values (:'clinic', '四君子汤加减', 7) returning id as tpl \gset
insert into prescription_template_items (template_id, herb_id, grams_per_dose, sort_order) values (:'tpl', :'huangqi', 30, 0), (:'tpl', :'baizhu', 12, 1);
select assert_raises(format('insert into prescription_templates (workspace_id, name) values (%L, %L)', :'clinic', '四君子汤加减'), 'duplicate key', '名字不重复');
select assert_raises(format('insert into prescription_templates (workspace_id, name) values (%L, %L)', :'clinic', '  '), 'check', '名字不能空');

-- 新建 / 使用 / 更新预设的函数：一个事务，失败时整个不变
select create_prescription_template(:'clinic', ' 玉屏风散 ', 7, '水煎服', '', jsonb_build_array(
  jsonb_build_object('herb_id', :'huangqi', 'grams', 18), jsonb_build_object('herb_id', :'baizhu', 'grams', 9, 'prep', '先煎'))) as tpl2 \gset
select assert_eq((select name || ':' || use_count || ':' || coalesce(notes, '空') from prescription_templates where id = :'tpl2'), '玉屏风散:0:空', '新建预设：名字去空格、医嘱空字符串存成空');
select assert_raises(format('select create_prescription_template(%L, %L, 7, null, null, %L)', :'clinic', '玉屏风散', jsonb_build_array(jsonb_build_object('herb_id', :'huangqi', 'grams', 1))), '已经有叫「玉屏风散」', '重名');
select assert_eq(use_prescription_template(:'tpl2', false, 5, 'x', 'y', '[]'), true, '只用不改');
select assert_eq((select use_count || ':' || dose_count from prescription_templates where id = :'tpl2'), '1:7', '用过次数加一，内容不变');
select assert_eq(use_prescription_template(:'tpl2', true, 5, '饭后', '忌生冷', jsonb_build_array(jsonb_build_object('herb_id', :'baizhu', 'grams', 10))), true, '用并更新');
select assert_eq((select use_count || ':' || dose_count || ':' || instructions || ':' || notes from prescription_templates where id = :'tpl2'), '2:5:饭后:忌生冷', '更新了剂数、煎服法、医嘱');
select assert_eq((select string_agg(grams_per_dose::text, ',') from prescription_template_items where template_id = :'tpl2'), '10.00', '明细换成这次的');
-- 中途失败（第二味药不存在）：整个回滚，明细不会只剩一半，用过次数也不加
select assert_raises(format('select use_prescription_template(%L, true, 5, null, null, %L)', :'tpl2',
  jsonb_build_array(jsonb_build_object('herb_id', :'huangqi', 'grams', 20), jsonb_build_object('herb_id', gen_random_uuid(), 'grams', 1))), 'foreign key', '有一味药不对');
select assert_eq((select use_count from prescription_templates where id = :'tpl2'), 2, '失败时用过次数没变');
select assert_eq((select string_agg(grams_per_dose::text, ',') from prescription_template_items where template_id = :'tpl2'), '10.00', '失败时明细没变');
select assert_raises(format('select use_prescription_template(%L, true, 5, null, null, %L)', :'tpl2', '[]'), '至少要有一味药', '更新成空的不行');
select assert_eq(use_prescription_template(gen_random_uuid(), true, 5, null, null, '[]'), false, '预设已经不在了：返回 false');

-- 处方记来源
insert into prescriptions (workspace_id, title, source_template_id) values (:'clinic', '照着预设开的', :'tpl') returning id as rx1 \gset
insert into prescriptions (workspace_id, title, source_prescription_id) values (:'clinic', '照着处方开的', :'rx1') returning id as rx2 \gset
select assert_eq((select source_template_id from prescriptions where id = :'rx1'), :'tpl'::uuid, '记了预设来源');
reset role;

-- 家庭药柜不能建预设；别的药柜看不到、引用不了
:as_hao;
select choose_account_kind('household') as home \gset
select assert_raises(format('insert into prescription_templates (workspace_id, name) values (%L, %L)', :'home', '家里的方'), '只有诊所', '家庭药柜不能建预设');
select assert_eq((select count(*) from prescription_templates), 0::bigint, '看不到别人的预设');
select assert_eq((select count(*) from prescription_template_items), 0::bigint, '看不到别人的预设明细');
select assert_raises(format('insert into prescriptions (workspace_id, title, source_template_id) values (%L, %L, %L)', :'home', 'x', :'tpl'), 'prescriptions_source_template_fk', '来源预设必须在同一个药柜');
select assert_raises(format('insert into prescriptions (workspace_id, title, source_prescription_id) values (%L, %L, %L)', :'home', 'x', :'rx1'), 'prescriptions_source_prescription_fk', '来源处方必须在同一个药柜');
select assert_eq(use_prescription_template(:'tpl', false, 1, null, null, '[]'), false, '别人的预设：看不到，等于不在');
select assert_raises(format('select create_prescription_template(%L, %L, 7, null, null, %L)', :'home', '家里的', jsonb_build_array(jsonb_build_object('herb_id', :'huangqi', 'grams', 1))), '只有诊所', '家庭药柜不能用函数建预设');
delete from prescription_templates;
reset role;
select assert_eq((select count(*) from prescription_templates), 2::bigint, '别人删不掉');

-- 删预设 / 原处方：新处方还在，来源变空
:as_tina;
delete from prescription_templates where id = :'tpl';
select assert_eq((select count(*) from prescription_template_items where template_id = :'tpl'), 0::bigint, '明细跟着删');
select assert_eq((select source_template_id is null and workspace_id = :'clinic'::uuid from prescriptions where id = :'rx1'), true, '删了预设：处方还在，来源变空，药柜不变');
delete from prescriptions where id = :'rx1';
select assert_eq((select source_prescription_id is null from prescriptions where id = :'rx2'), true, '删了原处方：新处方的来源变空');
reset role;

set role anon; set request.jwt.claim.sub = '';
select assert_raises($$select count(*) from prescription_templates$$, 'permission denied', 'anon 读不到');
reset role;
