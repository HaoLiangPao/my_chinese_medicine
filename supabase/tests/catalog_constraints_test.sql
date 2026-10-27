-- 药材目录、别名匹配、数据约束、各表 RLS
\ir _helpers.sql

-- ---- 种子数据 ----
select assert_eq((select count(*) >= 100 from herbs), true, '种子药材 >= 100');
select assert_eq((select b.name_zh from herbs h join herbs b on b.id = h.base_herb_id where h.name_zh = '炙黄芪'), '黄芪', '炮制品指回原药材');
select assert_eq((select count(*) from herbs where base_herb_id is not null), 13::bigint, '13 个炮制品');
select assert_eq((select count(*) from herb_aliases a join herbs h on h.name_zh = a.alias), 0::bigint, '别名不能和标准名重名');

-- ---- match_herb ----
select assert_eq((select name_zh from herbs where id = match_herb('北芪')), '黄芪', '别名 北芪');
select assert_eq((select name_zh from herbs where id = match_herb('  麦冬 ')), '麦冬', '去首尾空格');
select assert_eq((select name_zh from herbs where id = match_herb('山萸肉')), '山茱萸', '别名 山萸肉');
select assert_eq((select name_zh from herbs where id = match_herb('炒枣仁')), '炒酸枣仁', '炮制品的别名');
select assert_eq(match_herb('不存在的药'), null::uuid, '查不到 → null');
select assert_eq(match_herb(''), null::uuid, '空串 → null');

:as_hao;
select ensure_default_workspace() as ws \gset

-- ---- 约束 ----
insert into prescriptions (workspace_id, dose_count) values (:'ws', 3) returning id as rx \gset
select assert_raises(format('insert into prescriptions (workspace_id, dose_count) values (%L, 0)', :'ws'), 'check', '剂数必须 > 0');
select assert_raises(format('insert into prescription_items (prescription_id, herb_id, grams_per_dose) values (%L, %L, 0)', :'rx', match_herb('黄芪')), 'check', '克数必须 > 0');
select assert_raises(format('insert into prescription_items (prescription_id, herb_id, grams_per_dose, special_prep) values (%L, %L, 3, %L)', :'rx', match_herb('薄荷'), '乱写'), 'check', '脚注只能是固定几种');
insert into prescription_items (prescription_id, herb_id, grams_per_dose, special_prep) values (:'rx', match_herb('薄荷'), 3, '后下');
select assert_raises(format('insert into prescription_items (prescription_id, herb_id, grams_per_dose) values (%L, %L, 5)', :'rx', match_herb('薄荷')), 'duplicate key', '同一方子同一味药只能一行');

insert into stores (workspace_id, name) values (:'ws', '百草园') returning id as st \gset
select assert_raises(format('insert into stores (workspace_id, name) values (%L, %L)', :'ws', '百草园'), 'duplicate key', '店名在 workspace 内唯一');
insert into purchases (workspace_id, store_id) values (:'ws', :'st') returning id as pu \gset
select assert_raises(format('insert into purchase_items (purchase_id, herb_id, grams, price) values (%L, %L, 100, -1)', :'pu', match_herb('黄芪')), 'check', '价格不能为负');
select assert_raises(format('insert into purchase_items (purchase_id, herb_id, grams, price) values (%L, %L, 0, 1)', :'pu', match_herb('黄芪')), 'check', '采购克数必须 > 0');
-- 免费赠送（价格 0）是允许的
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'pu', match_herb('大枣'), 100, 0);
select assert_eq((select price_per_gram from v_purchase_prices where name_zh = '大枣'), 0::numeric, '赠品单价 0');
select assert_raises(format('insert into inventory_txns (workspace_id, herb_id, delta_grams, kind) values (%L, %L, 0, %L)', :'ws', match_herb('黄芪'), 'adjust'), 'check', '流水不能是 0');
select assert_raises(format('insert into inventory_txns (workspace_id, herb_id, delta_grams, kind) values (%L, %L, 5, %L)', :'ws', match_herb('黄芪'), 'gift'), 'check', '流水类型只能是固定几种');

-- 店铺删除后，采购记录保留（店铺置空）
delete from stores where id = :'st';
select assert_eq((select store_id from purchases where id = :'pu'), null::uuid, '删店铺后采购保留');

-- 登录用户可以新增药材（目录共享）
insert into herbs (name_zh) values ('茯神');
select assert_eq(match_herb('茯神') is not null, true, '新增药材');
select assert_raises($$insert into herbs (name_zh) values ('黄芪')$$, 'duplicate key', '药名唯一');

-- ---- RLS：陌生人 ----
insert into pantry_settings (workspace_id, herb_id, jar_label) values (:'ws', match_herb('大枣'), 'A1');
:as_other;
select ensure_default_workspace() as ws_other \gset
select assert_eq((select count(*) from stores), 0::bigint, '陌生人看不到店铺');
select assert_eq((select count(*) from purchases), 0::bigint, '陌生人看不到采购');
select assert_eq((select count(*) from purchase_items), 0::bigint, '陌生人看不到采购明细');
select assert_eq((select count(*) from prescription_items), 0::bigint, '陌生人看不到药方明细');
select assert_eq((select count(*) from pantry_settings), 0::bigint, '陌生人看不到罐子设置');
select assert_eq((select count(*) from v_purchase_prices), 0::bigint, '陌生人看不到单价');
select assert_eq((select count(*) from v_herb_usage), 0::bigint, '陌生人看不到用量统计');
select assert_eq((select count(*) from workspaces), 1::bigint, '陌生人只看到自己的 workspace');
select assert_eq((select count(*) from workspace_members), 1::bigint, '陌生人只看到自己的成员');
-- 写不进别人的 workspace
select assert_raises(format('insert into stores (workspace_id, name) values (%L, %L)', :'ws', 'x'), 'row-level security', '陌生人写店铺');
select assert_raises(format('insert into inventory_txns (workspace_id, herb_id, delta_grams, kind) values (%L, %L, 100, %L)', :'ws', match_herb('黄芪'), 'adjust'), 'row-level security', '陌生人写流水');
select assert_raises(format('insert into prescription_items (prescription_id, herb_id, grams_per_dose) values (%L, %L, 5)', :'rx', match_herb('黄芪')), 'row-level security', '陌生人往别人药方加药');
-- 更新/删除别人的数据：影响 0 行
update prescriptions set title = 'hacked' where id = :'rx';
delete from purchases where id = :'pu';
-- 不是 owner 不能拉人
select assert_raises(format('select add_member_by_email(%L, %L)', :'ws', 'stranger@example.com'), '只有 owner', '非 owner 拉人');

:as_hao;
select assert_eq((select title from prescriptions where id = :'rx'), null::text, '陌生人的 update 没生效');
select assert_eq((select count(*) from purchases where id = :'pu'), 1::bigint, '陌生人的 delete 没生效');
select assert_raises(format('select add_member_by_email(%L, %L)', :'ws', 'nobody@example.com'), '还没注册', '邮箱没注册');

-- ---- 家人加入后能读写 ----
select add_member_by_email(:'ws', 'tina@example.com');
:as_tina;
select assert_eq(ensure_default_workspace(), :'ws'::uuid, 'Tina 加入后默认 workspace 就是共享的');
insert into stores (workspace_id, name) values (:'ws', 'Tina 常去的店');
select assert_eq((select count(*) from pantry_settings), 1::bigint, 'Tina 看得到罐子设置');
-- member 不能再拉人（只有 owner）
select assert_raises(format('select add_member_by_email(%L, %L)', :'ws', 'stranger@example.com'), '只有 owner', 'member 拉人');

-- 有数据的 workspace 不会在加入别家时被删
:as_other;
insert into stores (workspace_id, name) values (:'ws_other', '我自己的店');
:as_hao;
select add_member_by_email(:'ws', 'stranger@example.com');
reset role;
select assert_eq((select count(*) from workspaces where id = :'ws_other'), 1::bigint, '有数据的 workspace 保留');

\echo 'catalog_constraints_test: PASSED'

-- ---- 加固（migration 0006）----
:as_other;
update herbs set name_zh = '被改掉的黄芪' where name_zh = '黄芪';
reset role;
select assert_eq((select count(*) from herbs where name_zh = '黄芪'), 1::bigint, '普通用户不能修改共享药材目录');
:as_other;
select assert_raises(format('select workspace_is_empty(%L)', :'ws'), 'permission denied', '不能直接调用内部函数 workspace_is_empty');
reset role;
\echo 'hardening: PASSED'
