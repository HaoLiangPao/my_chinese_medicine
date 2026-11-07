-- 带数据的升级测试（docs/design/0009 §3）：在「main 上的 migration」建好的库里，
-- 用和线上一样的方式（以用户身份调函数、受 RLS 约束）造一份像线上的数据。
-- 全是造出来的，不用线上的真实数据。只能用 main 上已有的函数和表。
--
-- 账号：
--   u1 家庭：药方、盘点、采购、煎药、待接受的邀请
--   u2 家人：自己家有数据，又接受了 u1 的邀请（同时在两个家庭药柜里）
--   u3 医生：和线上的医生一样，先自动建了空的「我们家」，再开诊所；病人、处方、进货、配药
--   u4 两种都有数据：家庭药柜和诊所都有药方 / 库存（像测试账号）
--   u5 只登录过一次：只有空的「我们家」

\set u1 '00000000-0000-0000-0000-0000000000a1'
\set u2 '00000000-0000-0000-0000-0000000000a2'
\set u3 '00000000-0000-0000-0000-0000000000a3'
\set u4 '00000000-0000-0000-0000-0000000000a4'
\set u5 '00000000-0000-0000-0000-0000000000a5'
insert into auth.users (id, email) values
  (:'u1', 'home@example.com'), (:'u2', 'family@example.com'), (:'u3', 'doctor@example.com'),
  (:'u4', 'both@example.com'), (:'u5', 'idle@example.com');

\set as_u1 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a1'''
\set as_u2 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a2'''
\set as_u3 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a3'''
\set as_u4 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a4'''
\set as_u5 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a5'''

-- 药材 id
select id as huangqi from herbs where name_zh = '黄芪' \gset
select id as gancao from herbs where name_zh = '甘草' \gset
select id as baizhu from herbs where name_zh = '白术' \gset
select id as dangshen from herbs where name_zh = '党参' \gset

-- ---- u1 家庭 ----
:as_u1;
select ensure_default_workspace() as w1 \gset
insert into inventory_txns (workspace_id, herb_id, delta_grams, kind, note)
values (:'w1', :'huangqi', 200, 'adjust', '第一次盘点'), (:'w1', :'gancao', 80, 'adjust', '第一次盘点');
insert into stores (workspace_id, name) values (:'w1', '同仁堂') returning id as s1 \gset
insert into purchases (workspace_id, store_id, purchased_on) values (:'w1', :'s1', '2026-10-20') returning id as p1 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p1', :'huangqi', 500, 0.06), (:'p1', :'baizhu', 300, 0.08);
-- 同月更晚又进了一次黄芪，但先记的是它（回填批号要按购入日期排，不按记录顺序）
insert into purchases (workspace_id, store_id, purchased_on, created_at) values (:'w1', :'s1', '2026-10-28', '2026-10-01') returning id as p1b \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p1b', :'huangqi', 100, 0.07);
insert into prescriptions (workspace_id, title, prescriber, dose_count, price_paid)
values (:'w1', '补气方', '李医生', 5, 120) returning id as rx1 \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose, sort_order)
values (:'rx1', :'huangqi', 30, 1), (:'rx1', :'baizhu', 12, 2), (:'rx1', :'gancao', 6, 3);
insert into prescriptions (workspace_id, title, dose_count) values (:'w1', '还没煎的方', 3) returning id as rx2 \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose, raw_name) values (:'rx2', :'dangshen', 15, '党参');
-- 目录里原来的「沙参」（2026-11-07 改名南沙参；main 上已经没有「沙参」时这条什么都不插）
insert into prescription_items (prescription_id, herb_id, grams_per_dose, raw_name)
select :'rx2', id, 10, '沙参' from herbs where name_zh = '沙参';
select record_decoction(:'rx1', 2);
select record_decoction(:'rx1', 1, jsonb_build_array(jsonb_build_object('herb_id', :'huangqi', 'grams', 35)));
insert into pantry_settings (workspace_id, herb_id, jar_label, low_stock_grams) values (:'w1', :'huangqi', 'A1', 100);
select invite_member(:'w1', 'family@example.com');
select invite_member(:'w1', 'nobody@example.com'); -- 一直没接受

-- ---- u2 家人：自己家有数据，再加入 u1 的 ----
:as_u2;
select ensure_default_workspace() as w2 \gset
insert into inventory_txns (workspace_id, herb_id, delta_grams, kind) values (:'w2', :'dangshen', 60, 'adjust');
insert into prescriptions (workspace_id, title, dose_count) values (:'w2', '自己家的方', 2) returning id as rx3 \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose) values (:'rx3', :'dangshen', 10);
select accept_invitation((select id from my_invitations()));
insert into prescriptions (workspace_id, title, dose_count) values (:'w1', '家人帮忙录的方', 1); -- 当前是 u1 的药柜

-- ---- u3 医生（和线上一样：先有空的「我们家」，再开诊所）----
:as_u3;
select ensure_default_workspace() as w3home \gset
select create_clinic('李医生诊所') as w3 \gset
insert into patients (workspace_id, name, phone) values (:'w3', '张三', '416-555-0101') returning id as pt1 \gset
insert into patients (workspace_id, phone) values (:'w3', '647 555 0202') returning id as pt2 \gset
insert into stores (workspace_id, name, kind) values (:'w3', '药材批发', 'shop') returning id as s3 \gset
insert into purchases (workspace_id, store_id, purchased_on) values (:'w3', :'s3', '2026-10-25') returning id as p3 \gset
insert into purchase_items (purchase_id, herb_id, grams, price) values (:'p3', :'huangqi', 1000, 0.05), (:'p3', :'gancao', 500, 0.04);
insert into prescriptions (workspace_id, title, dose_count, patient_id, source, instructions)
values (:'w3', '张三 · 处方', 7, :'pt1', 'clinic', '饭后服') returning id as rx4 \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose, sort_order, note)
values (:'rx4', :'huangqi', 20, 1, null), (:'rx4', :'gancao', 5, 2, '后下');
insert into prescriptions (workspace_id, title, dose_count, patient_id, source)
values (:'w3', '只有电话的病人', 3, :'pt2', 'clinic') returning id as rx5 \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose) values (:'rx5', :'gancao', 9);
select record_decoction(:'rx4', 7);
-- 医生自己在开方时新增过一味目录里还没有的药（以后目录也加了同名的）
insert into herbs (name_zh) values ('铁皮石斛') on conflict (name_zh) do nothing; -- main 上已经有了就跳过（fixture 总是跑在最新的 main 上）

-- ---- u4 两种都有数据 ----
:as_u4;
select ensure_default_workspace() as w4home \gset
insert into inventory_txns (workspace_id, herb_id, delta_grams, kind) values (:'w4home', :'baizhu', 40, 'adjust');
insert into prescriptions (workspace_id, title, dose_count) values (:'w4home', '两种都有：家里的', 1);
select create_clinic('测试诊所') as w4 \gset
insert into patients (workspace_id, name) values (:'w4', '王五') returning id as pt3 \gset
insert into prescriptions (workspace_id, title, dose_count, patient_id, source) values (:'w4', '两种都有：诊所的', 2, :'pt3', 'clinic');
insert into inventory_txns (workspace_id, herb_id, delta_grams, kind) values (:'w4', :'huangqi', 300, 'adjust');

-- ---- u5 只登录过一次 ----
:as_u5;
select ensure_default_workspace();

reset role;
insert into parse_usage (user_id, day, count) values (:'u1', '2026-10-30', 3);
