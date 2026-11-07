-- =============================================================================
-- 批次：采购明细（一次进货里的一味药）加产地、批号、供应商批号、分装日期。
-- 设计见 docs/design/0010-herb-labels.md §3.3
--
-- - 都是可以为空的新列，旧代码不受影响（先扩展、后收缩）
-- - 批号：<拼音首字母>-<购入年月 YYMM>-<序号>，如 MD-2611-01。序号按「药柜 + 前缀 + 年月」递增，
--   黄芪、黄芩都是 HQ，序号一起排，不会撞。插入时由触发器生成；已有的采购按购入日期回填
-- - 批号生成以后不变（购入日期以后改了也不变：它只是个编号）
-- =============================================================================

alter table public.purchase_items
  add column origin       text check (char_length(origin) <= 40),
  add column lot_no       text,
  add column supplier_lot text check (char_length(supplier_lot) <= 40),
  add column packed_on    date;

-- 拼音每个字的首字母，大写；没有拼音（用户自己加的药）→ X。和 src/lib/batches.ts 的 lotPrefix 一致
create or replace function public.lot_prefix(pinyin text)
returns text
language sql immutable set search_path = public, pg_temp
as $$
  select case when p ~ '^[A-Z]+$' then p else 'X' end
  from (
    select upper(coalesce(string_agg(left(s, 1), '' order by ord), '')) as p
    from regexp_split_to_table(btrim(lower(coalesce(pinyin, ''))), '\s+') with ordinality as t(s, ord)
    where s <> ''
  ) x;
$$;

-- 下一个批号。同一个药柜的进货排队（按药柜加锁，不按前缀：一张单子有几味药时，按前缀加锁的顺序不同会互相等待），
-- 并发插入不会拿到同一个序号。序号至少两位，超过 99 照常变长（MD-2611-100），不截断
create or replace function public.next_lot_no(ws uuid, herb uuid, bought date)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare pre text; seq int;
begin
  select public.lot_prefix(h.pinyin) || '-' || to_char(bought, 'YYMM') into pre from public.herbs h where h.id = herb;
  perform pg_advisory_xact_lock(hashtextextended('lot_no:' || ws::text, 0));
  select coalesce(max(substring(pi.lot_no from '-(\d+)$')::int), 0) + 1 into seq
  from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
  where pu.workspace_id = ws and pi.lot_no ~ ('^' || pre || '-\d+$');
  return pre || '-' || case when seq < 10 then '0' || seq else seq::text end;
end;
$$;

create or replace function public.assign_lot_no()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ws uuid; bought date;
begin
  select workspace_id, purchased_on into ws, bought from public.purchases where id = new.purchase_id;
  new.lot_no := public.next_lot_no(ws, new.herb_id, bought);   -- 总是由系统生成
  return new;
end;
$$;

create trigger purchase_items_lot_no before insert on public.purchase_items
for each row execute function public.assign_lot_no();

-- 回填已有的采购：按购入日期、记录时间排，早的序号小。可以重复执行（只补空的）
do $$
declare r record;
begin
  for r in
    select pi.id, pu.workspace_id, pi.herb_id, pu.purchased_on
    from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
    where pi.lot_no is null
    order by pu.purchased_on, pu.created_at, pi.id
  loop
    update public.purchase_items set lot_no = public.next_lot_no(r.workspace_id, r.herb_id, r.purchased_on) where id = r.id;
  end loop;
end $$;

-- 批号生成以后不变：改不了（以前没有批号的行，回填时可以写一次）。放在回填之后建
create or replace function public.keep_lot_no()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if old.lot_no is not null then new.lot_no := old.lot_no; end if;
  return new;
end;
$$;

create trigger purchase_items_keep_lot_no before update on public.purchase_items
for each row execute function public.keep_lot_no();

-- 函数权限：触发器函数谁都不能直接调用；next_lot_no 只给触发器和回填用
do $$
declare
  f regprocedure;
  r text;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('assign_lot_no', 'next_lot_no', 'keep_lot_no') loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke execute on function %s from %I', f, r); end if;
    end loop;
  end loop;
end $$;
