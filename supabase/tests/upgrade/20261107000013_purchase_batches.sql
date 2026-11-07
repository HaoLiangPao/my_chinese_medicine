-- migration 20261107000013_purchase_batches 在「有数据的库」上的行为（docs/design/0010 §3.3）
-- 已有的采购都回填了批号：按购入日期排序号；每个药柜各自从 01 开始；新加的列都是空的
\ir ../_helpers.sql

select assert_eq((select count(*) from purchase_items where lot_no is null), 0::bigint, '已有的采购都有批号');
select assert_eq((select count(*) from purchase_items where origin is not null or supplier_lot is not null or packed_on is not null), 0::bigint, '旧数据的批次信息是空的');

select assert_eq(
  (select string_agg(pi.lot_no, ',' order by pu.purchased_on)
   from purchase_items pi join purchases pu on pu.id = pi.purchase_id join herbs h on h.id = pi.herb_id
   join workspace_members m on m.workspace_id = pu.workspace_id and m.role = 'owner'
   where m.user_id = '00000000-0000-0000-0000-0000000000a1' and h.name_zh = '黄芪'),
  'HQ-2610-01,HQ-2610-02', '同月两批黄芪：按购入日期排（10-20 是 01，10-28 是 02）');
select assert_eq(
  (select pi.lot_no from purchase_items pi join purchases pu on pu.id = pi.purchase_id join herbs h on h.id = pi.herb_id
   where pu.workspace_id = (select id from workspaces where name = '李医生诊所') and h.name_zh = '黄芪'),
  'HQ-2610-01', '诊所的黄芪从 01 开始（药柜之间不共用序号）');
select assert_eq(
  (select count(*) from (select pu.workspace_id, pi.lot_no from purchase_items pi join purchases pu on pu.id = pi.purchase_id
   group by 1, 2 having count(*) > 1) d), 0::bigint, '同一个药柜里批号不重复');

-- 旧代码照常记采购：不填新列也能存，批号自动生成
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into purchase_items (purchase_id, herb_id, grams, price)
select pu.id, h.id, 50, 5 from purchases pu, herbs h where pu.purchased_on = '2026-10-28' and h.name_zh = '党参';
select assert_eq((select pi.lot_no from purchase_items pi join herbs h on h.id = pi.herb_id where h.name_zh = '党参' and pi.grams = 50), 'DS-2610-01', '旧代码记采购也有批号');
reset role;
