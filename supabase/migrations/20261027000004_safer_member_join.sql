-- 修正：add_member_by_email 之前只看「有没有药方/采购」来判断对方的 workspace 是否为空，
-- 只有店铺、盘点流水、罐子设置、煎药记录的 workspace 也会被误删。改成检查所有业务表。

create or replace function public.workspace_is_empty(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (select 1 from public.prescriptions   where workspace_id = ws)
     and not exists (select 1 from public.purchases       where workspace_id = ws)
     and not exists (select 1 from public.stores          where workspace_id = ws)
     and not exists (select 1 from public.inventory_txns  where workspace_id = ws)
     and not exists (select 1 from public.pantry_settings where workspace_id = ws)
     and not exists (select 1 from public.decoctions      where workspace_id = ws);
$$;
revoke execute on function public.workspace_is_empty(uuid) from public;

create or replace function public.add_member_by_email(ws uuid, member_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid;
begin
  if not exists (select 1 from public.workspace_members
                 where workspace_id = ws and user_id = auth.uid() and role = 'owner') then
    raise exception '只有 owner 可以添加成员';
  end if;
  select id into uid from auth.users where lower(email) = lower(btrim(member_email));
  if uid is null then raise exception '这个邮箱还没注册'; end if;

  -- 只清掉对方自动生成、完全没有数据、也没有其他成员的 workspace
  delete from public.workspaces w
  using public.workspace_members m
  where m.workspace_id = w.id and m.user_id = uid and w.id <> ws
    and public.workspace_is_empty(w.id)
    and not exists (select 1 from public.workspace_members o where o.workspace_id = w.id and o.user_id <> uid);

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, uid, 'member') on conflict do nothing;
end;
$$;
