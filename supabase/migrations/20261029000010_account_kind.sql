-- =============================================================================
-- 账号类型：注册时选「病人」（household）或「医生」（clinic），之后只用这一种。
-- 选了类型以后，一个账号只有一个药柜：user_settings.active_workspace_id。没有切换；
-- 接受家人邀请 = 搬进对方的药柜，自己原来的隐藏（数据不删）。
-- 设计说明见 docs/design/0008-account-types.md
--
-- 先扩展、后收缩：account_kind 为 null（旧账号、旧代码）时所有函数和原来一样。
-- create_clinic、ensure_default_workspace 旧代码还在用，先保留。
-- =============================================================================

alter table public.user_settings
  add column account_kind text check (account_kind in ('household', 'clinic'));

-- 当前用户的账号类型（null = 还没选）。只给下面的函数用。
create or replace function public.my_account_kind()
returns text
language sql stable security definer set search_path = public
as $$ select account_kind from public.user_settings where user_id = auth.uid() $$;

-- 选了类型以后，只有当前药柜（同类型）算成员；其他药柜（另一种类型、搬走前自己的）
-- 页面、写操作、照片、直接调 API 都进不去（RLS 都走这里）。没选类型（null）和原来一样。
create or replace function public.is_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    left join public.user_settings s on s.user_id = m.user_id
    where m.workspace_id = ws and m.user_id = auth.uid()
      and (s.account_kind is null or (w.kind = s.account_kind and s.active_workspace_id = ws))
  );
$$;

-- ---------------------------------------------------------------------------
-- 当前药柜：选了类型时只认同类型的
-- ---------------------------------------------------------------------------
create or replace function public.ensure_default_workspace(ws_name text default '我们家')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare ws uuid; k text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  k := public.my_account_kind();

  select s.active_workspace_id into ws
  from public.user_settings s
  join public.workspace_members m on m.workspace_id = s.active_workspace_id and m.user_id = s.user_id
  join public.workspaces w on w.id = s.active_workspace_id
  where s.user_id = auth.uid() and (k is null or w.kind = k);

  if ws is null then
    select m.workspace_id into ws
    from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.user_id = auth.uid() and (k is null or w.kind = k)
    order by m.created_at limit 1;
  end if;
  if ws is null then
    insert into public.workspaces (name, kind)
    values (case when k = 'clinic' then '我的诊所' else ws_name end, coalesce(k, 'household'))
    returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  end if;

  insert into public.user_settings (user_id, active_workspace_id) values (auth.uid(), ws)
  on conflict (user_id) do update set active_workspace_id = excluded.active_workspace_id
  where user_settings.active_workspace_id is distinct from excluded.active_workspace_id;
  return ws;
end;
$$;

-- 新代码用：一次拿到账号类型和当前药柜。还没选类型时不建药柜，只返回 account_kind = null。
create or replace function public.current_context()
returns table (account_kind text, workspace_id uuid, workspace_name text, workspace_kind text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare k text; ws uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  k := public.my_account_kind();
  if k is null then
    return query select null::text, null::uuid, null::text, null::text;
    return;
  end if;
  ws := public.ensure_default_workspace();
  return query select k, w.id, w.name, w.kind from public.workspaces w where w.id = ws;
end;
$$;

-- 选账号类型：只能选一次（再选同一种什么都不做）。返回当前药柜。
create or replace function public.choose_account_kind(p_kind text, clinic_name text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare k text; ws uuid; n text := nullif(btrim(clinic_name), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_kind is null or p_kind not in ('household', 'clinic') then raise exception '账号类型不对'; end if;

  -- 同一个人同时提交两次时排队，不会建出两个诊所（第一次选时 user_settings 可能还没有这一行，锁不了行）
  perform pg_advisory_xact_lock(hashtextextended('choose_account_kind:' || auth.uid()::text, 0));
  k := public.my_account_kind();
  if k = p_kind then return public.ensure_default_workspace(); end if;
  if k is not null then raise exception '账号类型已经选过了，不能更改'; end if;

  if p_kind = 'clinic' and not exists (
    select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.user_id = auth.uid() and w.kind = 'clinic'
  ) then
    if n is null then raise exception '请填写诊所名称'; end if;
    if char_length(n) > 40 then raise exception '诊所名称太长'; end if;
    insert into public.workspaces (name, kind) values (n, 'clinic') returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  end if;

  insert into public.user_settings (user_id, active_workspace_id, account_kind) values (auth.uid(), ws, p_kind)
  on conflict (user_id) do update
    set account_kind = excluded.account_kind,
        active_workspace_id = coalesce(excluded.active_workspace_id, user_settings.active_workspace_id);
  return public.ensure_default_workspace();
end;
$$;

-- ---------------------------------------------------------------------------
-- 列表、切换、建诊所、邀请：选了类型以后只认当前药柜 / 同类型
-- ---------------------------------------------------------------------------
create or replace function public.my_workspaces()
returns table (workspace_id uuid, name text, role text, is_active boolean, kind text)
language sql stable security definer set search_path = public
as $$
  select w.id, w.name, m.role, w.id = s.active_workspace_id, w.kind
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  left join public.user_settings s on s.user_id = m.user_id
  where m.user_id = auth.uid() and (s.account_kind is null or w.id = s.active_workspace_id)
  order by m.created_at;
$$;

create or replace function public.set_active_workspace(ws uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare k text := public.my_account_kind();
begin
  -- 这里查成员表，不用 is_member：隐藏的药柜要报「另一种类型」，不是「不是成员」
  if k is not null and ws is distinct from (select active_workspace_id from public.user_settings where user_id = auth.uid())
     and (select kind from public.workspaces where id = ws) = k then
    raise exception '一个账号只有一个药柜，不能切换';
  end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()) then
    raise exception '不是这个药柜的成员';
  end if;
  if k is not null and (select kind from public.workspaces where id = ws) <> k then
    raise exception '不能切换到另一种类型的药柜';
  end if;
  insert into public.user_settings (user_id, active_workspace_id) values (auth.uid(), ws)
  on conflict (user_id) do update set active_workspace_id = ws;
end;
$$;

create or replace function public.create_clinic(clinic_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare ws uuid; n text := btrim(clinic_name);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- 只给旧代码（account_kind 还是 null）用；选了类型以后一个账号只有一个药柜
  if public.my_account_kind() = 'household' then raise exception '家庭账号不能开诊所'; end if;
  if public.my_account_kind() = 'clinic' then raise exception '一个账号只有一个诊所'; end if;
  if n is null or n = '' then raise exception '请填写诊所名称'; end if;
  if char_length(n) > 40 then raise exception '诊所名称太长'; end if;
  insert into public.workspaces (name, kind) values (n, 'clinic') returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  insert into public.user_settings (user_id, active_workspace_id) values (auth.uid(), ws)
  on conflict (user_id) do update set active_workspace_id = ws;
  return ws;
end;
$$;

create or replace function public.my_invitations()
returns table (id uuid, workspace_id uuid, workspace_name text, invited_by_email text, created_at timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select i.id, i.workspace_id, w.name, u.email, i.created_at
  from public.invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join auth.users u on u.id = i.invited_by
  where i.status = 'pending' and i.email = public.current_email()
    and (public.my_account_kind() is null or w.kind = public.my_account_kind())
  order by i.created_at;
$$;

create or replace function public.accept_invitation(inv uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare ws uuid; k text := public.my_account_kind();
begin
  select workspace_id into ws from public.invitations
  where id = inv and status = 'pending' and email = public.current_email()
  for update;
  if ws is null then raise exception '邀请不存在或已失效'; end if;
  if k is not null and (select kind from public.workspaces where id = ws) <> k then
    raise exception '不能加入另一种类型的药柜';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, auth.uid(), 'member') on conflict do nothing;
  update public.invitations set status = 'accepted', responded_at = now() where id = inv;
  -- 搬进对方的药柜：设成当前药柜以后，自己原来的就不算成员了（is_member），退出对方药柜时再回来
  insert into public.user_settings (user_id, active_workspace_id) values (auth.uid(), ws)
  on conflict (user_id) do update set active_workspace_id = ws;

  -- 只删「自己的、空的、没有别人」的旧 workspace
  delete from public.workspaces w
  where w.id in (select m.workspace_id from public.workspace_members m where m.user_id = auth.uid() and m.role = 'owner')
    and w.id <> ws
    and public.workspace_is_empty(w.id)
    and not exists (select 1 from public.workspace_members o where o.workspace_id = w.id and o.user_id <> auth.uid());
  return ws;
end;
$$;

-- ---------------------------------------------------------------------------
-- 权限（同 0009）：新的 RPC 只给登录用户；my_account_kind 只给函数内部用
-- ---------------------------------------------------------------------------
do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('current_context', 'choose_account_kind', 'my_account_kind') loop
    execute format('revoke execute on function %s from public', f);
    if has_anon then execute format('revoke execute on function %s from anon', f); end if;
    if has_auth then
      execute format('%s execute on function %s %s authenticated',
        case when f::text like 'my_account_kind%' then 'revoke' else 'grant' end, f,
        case when f::text like 'my_account_kind%' then 'from' else 'to' end);
    end if;
  end loop;
end $$;
