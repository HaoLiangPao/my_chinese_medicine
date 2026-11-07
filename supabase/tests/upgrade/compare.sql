-- 新 migration 执行以后：数据一条不少、库存不变、成员关系和当前药柜不变。
-- 新 migration 只能「加」，不能删数据（docs/design/0009 §3）；新加的表不在快照里，不比。
do $$
declare r record; n bigint; bad text := '';
begin
  for r in select * from upgrade_check.row_counts loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = r.tbl) then
      bad := bad || format(E'\n  表 %s 不见了', r.tbl);
      continue;
    end if;
    execute format('select count(*) from public.%I', r.tbl) into n;
    if n < r.n then bad := bad || format(E'\n  %s：升级前 %s 行，升级后 %s 行', r.tbl, r.n, n); end if;
  end loop;

  select count(*) into n from (
    (select * from upgrade_check.stock
     except select workspace_id, herb_id, sum(delta_grams) from public.inventory_txns group by 1, 2)
    union all
    (select workspace_id, herb_id, sum(delta_grams) from public.inventory_txns group by 1, 2
     except select * from upgrade_check.stock)
  ) d;
  if n > 0 then bad := bad || format(E'\n  库存变了：%s 个（药柜, 药材）的流水合计和升级前不一样', n); end if;

  select count(*) into n from (select * from upgrade_check.members except select workspace_id, user_id, role from public.workspace_members) d;
  if n > 0 then bad := bad || format(E'\n  少了 %s 条成员关系', n); end if;

  select count(*) into n from (select * from upgrade_check.active except select user_id, active_workspace_id from public.user_settings) d;
  if n > 0 then bad := bad || format(E'\n  %s 个账号的当前药柜变了', n); end if;

  if bad <> '' then raise exception 'FAIL: 升级后数据不对：%', bad; end if;
  raise notice '数据一致：% 张表、% 条库存合计、% 条成员关系',
    (select count(*) from upgrade_check.row_counts), (select count(*) from upgrade_check.stock), (select count(*) from upgrade_check.members);
end $$;
