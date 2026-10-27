-- MVP1 schema 测试：运行 scripts/test-db.sh
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'hao@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'stranger@example.com');

-- ---- 以 Hao 身份 ----
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

select public.ensure_default_workspace() as ws \gset
-- 再调一次应返回同一个，且只有一个 workspace
select public.ensure_default_workspace() = :'ws'::uuid
   and (select count(*) from public.workspaces) = 1 as assert_eq \gset
\if :assert_eq \else \echo 'FAIL: workspace count' \quit \endif

-- 药方：黄芪 15g、麦冬 10g、北芪(别名) 不重复；3 副
insert into public.prescriptions (workspace_id, title, dose_count, issued_on)
values (:'ws', '测试方一', 3, '2026-10-01') returning id as rx1 \gset
insert into public.prescription_items (prescription_id, herb_id, grams_per_dose, raw_name)
values (:'rx1', public.match_herb('北芪'), 15, '北芪'),
       (:'rx1', public.match_herb('麦冬'), 10, '麦冬');

insert into public.prescriptions (workspace_id, title, dose_count, issued_on)
values (:'ws', '测试方二', 7, '2026-10-20') returning id as rx2 \gset
insert into public.prescription_items (prescription_id, herb_id, grams_per_dose)
values (:'rx2', public.match_herb('黄芪'), 30);

-- 采购：T&T 买黄芪 500g $12.50，麦冬 250g $9
insert into public.stores (workspace_id, name) values (:'ws', 'T&T') returning id as st \gset
insert into public.purchases (workspace_id, store_id, purchased_on) values (:'ws', :'st', '2026-09-15') returning id as pu \gset
insert into public.purchase_items (purchase_id, herb_id, grams, price) values
  (:'pu', public.match_herb('黄芪'), 500, 12.50),
  (:'pu', public.match_herb('麦冬'), 250, 9.00);

-- 用库存配测试方一的 3 副 → 黄芪 -45，麦冬 -30
select public.consume_prescription(:'rx1') as consumed \gset

select
  (select on_hand_grams from public.v_inventory where name_zh = '黄芪') = 455 as ok_hq,
  (select on_hand_grams from public.v_inventory where name_zh = '麦冬') = 220 as ok_md,
  (select prescription_count from public.v_herb_usage where name_zh = '黄芪') = 2 as ok_cnt,
  (select total_grams from public.v_herb_usage where name_zh = '黄芪') = 255 as ok_total,   -- 15*3 + 30*7
  (select price_per_gram from public.v_purchase_prices where name_zh = '黄芪') = 0.025 as ok_ppg,
  :consumed = 2 as ok_consumed
\gset
\if :ok_hq \else \echo 'FAIL: 黄芪库存' \quit \endif
\if :ok_md \else \echo 'FAIL: 麦冬库存' \quit \endif
\if :ok_cnt \else \echo 'FAIL: 药方计数' \quit \endif
\if :ok_total \else \echo 'FAIL: 总克数' \quit \endif
\if :ok_ppg \else \echo 'FAIL: 单价' \quit \endif
\if :ok_consumed \else \echo 'FAIL: consume 行数' \quit \endif

-- 改采购克数 → 库存跟着变
update public.purchase_items set grams = 600 where herb_id = public.match_herb('黄芪');
select (select on_hand_grams from public.v_inventory where name_zh = '黄芪') = 555 as ok_upd \gset
\if :ok_upd \else \echo 'FAIL: 采购修改未同步库存' \quit \endif

-- ---- 以陌生人身份：什么都看不到 ----
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select
  (select count(*) from public.prescriptions) = 0 as iso_rx,
  (select count(*) from public.v_inventory) = 0 as iso_inv,
  (select count(*) from public.herbs) > 100 as herbs_visible
\gset
\if :iso_rx \else \echo 'FAIL: RLS 药方泄露' \quit \endif
\if :iso_inv \else \echo 'FAIL: RLS 库存泄露' \quit \endif
\if :herbs_visible \else \echo 'FAIL: 药材目录不可读' \quit \endif

-- 陌生人直接写入别人的 workspace_id 应被 RLS 拒绝（下面这条预期报错）
\echo '(预期会看到一条 row-level security 报错：)'
\set ON_ERROR_STOP off
insert into public.prescriptions (workspace_id) values (:'ws');
\set ON_ERROR_STOP on

reset role;
select (select count(*) from public.prescriptions) = 2 as ok_nowrite \gset
\if :ok_nowrite \else \echo 'FAIL: 陌生人写入成功了' \quit \endif

-- ---- 家人加入：Tina 先注册（自动有个空 workspace），Hao 把她拉进来 ----
insert into auth.users values ('00000000-0000-0000-0000-00000000000c', 'tina@example.com');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select public.ensure_default_workspace() as tina_ws \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.add_member_by_email(:'ws', 'TINA@example.com');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select
  public.ensure_default_workspace() = :'ws'::uuid as tina_joined,
  (select count(*) from public.prescriptions) = 2 as tina_sees
\gset
\if :tina_joined \else \echo 'FAIL: 家人没有切到共享 workspace' \quit \endif
\if :tina_sees \else \echo 'FAIL: 家人看不到共享药方' \quit \endif
reset role;
select not exists (select 1 from public.workspaces where id = :'tina_ws') as empty_ws_gone \gset
\if :empty_ws_gone \else \echo 'FAIL: 空 workspace 没清理' \quit \endif

\echo 'ALL TESTS PASSED'
