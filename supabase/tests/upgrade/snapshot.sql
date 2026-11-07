-- 升级前拍一张快照：每张表的行数、每个药柜每味药的库存（流水合计）、成员关系、当前药柜。
-- compare.sql 在执行新 migration 以后和它比。放在 upgrade_check schema 里，不影响业务表。
create schema upgrade_check;

create table upgrade_check.row_counts (tbl text primary key, n bigint);
do $$
declare t text; n bigint;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('select count(*) from public.%I', t) into n;
    insert into upgrade_check.row_counts values (t, n);
  end loop;
end $$;

create table upgrade_check.stock as
  select workspace_id, herb_id, sum(delta_grams) grams from public.inventory_txns group by 1, 2;
create table upgrade_check.members as
  select workspace_id, user_id, role from public.workspace_members;
create table upgrade_check.active as
  select user_id, active_workspace_id from public.user_settings;
