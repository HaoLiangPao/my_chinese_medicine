-- =============================================================================
-- 安全修复（独立代码审查发现）：
--   S1 任何人都能把别人拉进自己的 workspace（对方不知情），之后对方记录的健康数据都落进来。
--      → 改成「邀请 + 对方接受」；成员可以退出；owner 可以移除成员；不再泄露邮箱是否注册。
--   C1 一个人属于多个 workspace 时，读到的是几个 workspace 的混合数据。
--      → 每个用户有一个「当前 workspace」（user_settings），App 所有查询按它过滤。
--   S2 任何人都能往全局药材目录加别名（别名是主键，加了别人就改不了），也能写药材的任意字段。
--      → 去掉别名的写权限；药材只允许写 name_zh。
--   S3 拍照识别没有用量限制 → 每人每天的次数上限。
-- 设计说明见 docs/design/0004-security-review.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 当前 workspace
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  active_workspace_id  uuid references public.workspaces(id) on delete set null
);
alter table public.user_settings enable row level security;
create policy us_self on public.user_settings for select using (user_id = auth.uid());
-- 只能通过下面的函数修改

create or replace function public.ensure_default_workspace(ws_name text default '我们家')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select s.active_workspace_id into ws
  from public.user_settings s
  join public.workspace_members m on m.workspace_id = s.active_workspace_id and m.user_id = s.user_id
  where s.user_id = auth.uid();

  if ws is null then
    select workspace_id into ws from public.workspace_members where user_id = auth.uid()
    order by created_at limit 1;
  end if;
  if ws is null then
    insert into public.workspaces (name) values (ws_name) returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  end if;

  insert into public.user_settings (user_id, active_workspace_id) values (auth.uid(), ws)
  on conflict (user_id) do update set active_workspace_id = excluded.active_workspace_id
  where user_settings.active_workspace_id is distinct from excluded.active_workspace_id;
  return ws;
end;
$$;

-- 切换当前 workspace（必须是成员）
create or replace function public.set_active_workspace(ws uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_member(ws) then raise exception '不是这个药柜的成员'; end if;
  insert into public.user_settings (user_id, active_workspace_id) values (auth.uid(), ws)
  on conflict (user_id) do update set active_workspace_id = ws;
end;
$$;

-- 我加入的所有 workspace
create or replace function public.my_workspaces()
returns table (workspace_id uuid, name text, role text, is_active boolean)
language sql stable security definer set search_path = public
as $$
  select w.id, w.name, m.role, w.id = s.active_workspace_id
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  left join public.user_settings s on s.user_id = m.user_id
  where m.user_id = auth.uid()
  order by m.created_at;
$$;

-- ---------------------------------------------------------------------------
-- 邀请
-- ---------------------------------------------------------------------------
drop function if exists public.add_member_by_email(uuid, text);

create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         text not null check (email = lower(btrim(email)) and email like '%@%'),
  invited_by    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked'))
);
create unique index invitations_one_pending on public.invitations (workspace_id, email) where status = 'pending';
alter table public.invitations enable row level security;
-- workspace 成员能看到自己家发出的邀请；写操作只能通过函数
create policy inv_members_read on public.invitations for select using (public.is_member(workspace_id));

create or replace function public.current_email()
returns text language sql stable security definer set search_path = public, auth
as $$ select lower(email) from auth.users where id = auth.uid() $$;

-- owner 邀请。不管邮箱有没有注册，结果都一样（不泄露）。
create or replace function public.invite_member(ws uuid, member_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare e text := lower(btrim(member_email));
begin
  if not exists (select 1 from public.workspace_members
                 where workspace_id = ws and user_id = auth.uid() and role = 'owner') then
    raise exception '只有 owner 可以邀请';
  end if;
  if e is null or e not like '%_@_%' then raise exception '邮箱格式不对'; end if;
  if e = public.current_email() then raise exception '不能邀请自己'; end if;
  insert into public.invitations (workspace_id, email) values (ws, e)
  on conflict (workspace_id, email) where status = 'pending' do nothing;
end;
$$;

create or replace function public.revoke_invitation(inv uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.invitations i set status = 'revoked', responded_at = now()
  where i.id = inv and i.status = 'pending'
    and exists (select 1 from public.workspace_members m
                where m.workspace_id = i.workspace_id and m.user_id = auth.uid() and m.role = 'owner');
end;
$$;

-- 发给我的待处理邀请
create or replace function public.my_invitations()
returns table (id uuid, workspace_id uuid, workspace_name text, invited_by_email text, created_at timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select i.id, i.workspace_id, w.name, u.email, i.created_at
  from public.invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join auth.users u on u.id = i.invited_by
  where i.status = 'pending' and i.email = public.current_email()
  order by i.created_at;
$$;

-- 接受：加入并切换过去；自己原来那个「完全空、只有自己」的 workspace 会被删掉
create or replace function public.accept_invitation(inv uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare ws uuid; old_ws uuid;
begin
  select workspace_id into ws from public.invitations
  where id = inv and status = 'pending' and email = public.current_email()
  for update;
  if ws is null then raise exception '邀请不存在或已失效'; end if;

  select active_workspace_id into old_ws from public.user_settings where user_id = auth.uid();

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, auth.uid(), 'member') on conflict do nothing;
  update public.invitations set status = 'accepted', responded_at = now() where id = inv;
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

create or replace function public.decline_invitation(inv uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.invitations set status = 'declined', responded_at = now()
  where id = inv and status = 'pending' and email = public.current_email();
end;
$$;

-- 成员列表（带邮箱），只有成员能看
create or replace function public.list_members(ws uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select m.user_id, u.email, m.role, m.created_at
  from public.workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = ws and public.is_member(ws)
  order by m.created_at;
$$;

-- 退出（owner 不能退出自己的药柜；可以移除别人）
create or replace function public.leave_workspace(ws uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'owner') then
    raise exception 'owner 不能退出自己的药柜';
  end if;
  delete from public.workspace_members where workspace_id = ws and user_id = auth.uid();
  update public.user_settings set active_workspace_id = null where user_id = auth.uid() and active_workspace_id = ws;
end;
$$;

create or replace function public.remove_member(ws uuid, member uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'owner') then
    raise exception '只有 owner 可以移除成员';
  end if;
  if member = auth.uid() then raise exception '不能移除自己'; end if;
  delete from public.workspace_members where workspace_id = ws and user_id = member;
  update public.user_settings set active_workspace_id = null where user_id = member and active_workspace_id = ws;
end;
$$;

-- ---------------------------------------------------------------------------
-- 药材目录：别名只读；药材只能写 name_zh
-- ---------------------------------------------------------------------------
drop policy if exists alias_insert on public.herb_aliases;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke insert, update, delete on public.herb_aliases from authenticated;
    revoke insert, update, delete on public.herbs from authenticated;
    grant insert (name_zh) on public.herbs to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke insert, update, delete on public.herb_aliases from anon;
    revoke insert, update, delete on public.herbs from anon;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 拍照识别每日次数（表没有任何 policy → 客户端读写不了，只能通过函数）
-- ---------------------------------------------------------------------------
create table public.parse_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null default current_date,
  count    integer not null default 0,
  primary key (user_id, day)
);
alter table public.parse_usage enable row level security;

-- 用掉一次；超过 p_limit 返回 false（并且不计数）
create or replace function public.consume_parse_quota(p_limit integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare c integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.parse_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = parse_usage.count + 1
  where parse_usage.count < p_limit
  returning count into c;
  return c is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- C4：只有赠品（从没花过钱）的药，平均成本为 null（「不能假装是 0 元」）
-- ---------------------------------------------------------------------------
create or replace view public.v_herb_price_summary with (security_invoker = true) as
with latest as (select * from public.v_store_latest_prices),
cheapest as (
  select distinct on (workspace_id, herb_id) workspace_id, herb_id, store_id, store_name, price_per_gram
  from latest order by workspace_id, herb_id, price_per_gram, last_purchased_on desc, store_name
),
agg as (
  select workspace_id, herb_id, count(*) as store_count,
         min(price_per_gram) as min_ppg, max(price_per_gram) as max_ppg
  from latest group by workspace_id, herb_id
),
paid as (
  select pu.workspace_id, pi.herb_id,
         case when sum(pi.price) > 0 then sum(pi.price) / sum(pi.grams) end as avg_cost_per_gram
  from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
  group by pu.workspace_id, pi.herb_id
)
select p.workspace_id, p.herb_id, h.name_zh, coalesce(a.store_count, 0) as store_count,
       c.store_id as cheapest_store_id, c.store_name as cheapest_store_name,
       a.min_ppg, a.max_ppg,
       case when a.min_ppg > 0 then round((a.max_ppg - a.min_ppg) / a.min_ppg * 100, 1) end as spread_pct,
       round(p.avg_cost_per_gram, 6) as avg_cost_per_gram
from paid p
join public.herbs h on h.id = p.herb_id
left join agg a on a.workspace_id = p.workspace_id and a.herb_id = p.herb_id
left join cheapest c on c.workspace_id = p.workspace_id and c.herb_id = p.herb_id;

-- 内部函数不对外
revoke execute on function public.current_email() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.current_email() from authenticated;
    grant select on public.user_settings to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.current_email() from anon;
  end if;
end $$;
