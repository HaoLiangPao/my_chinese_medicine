-- =============================================================================
-- 平台管理员数据看板（IDEA-4 第一版）。设计见 docs/design/0015-admin-dashboard.md
--
-- platform_admins：管理员名单。只能用 SQL 加人（这里不写任何账号），客户端读写都不行。
-- admin_*：只返回汇总数字的统计函数。先检查调用人是管理员，否则报错。
-- 不改任何已有的表、policy、函数：RLS 不给管理员开后门，旧代码不受影响。
-- =============================================================================

create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text check (char_length(note) <= 100),
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;  -- 没有 policy：只有下面的 security definer 函数能读

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.platform_admins from %I', r);
    end if;
  end loop;
end $$;

-- 当前用户是不是管理员（页面用；只能知道自己是不是，列不出有谁）
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;

-- 统计函数的第一行：不是管理员就报错
create or replace function public.admin_require()
returns void
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    raise exception '没有权限' using errcode = '42501';
  end if;
end;
$$;

-- 小样本门槛：一味药 / 一对药至少出现在这么多个不同病人的处方里才单独显示（0015 §5.2）
create or replace function public.admin_min_subjects()
returns integer
language sql immutable
as $$ select 5 $$;

-- 统计的时间段：null = 全部；否则只能是某个月的 1 号（不接受任意起止时间，0015 §5.3）。按多伦多时间
create or replace function public.admin_window(p_month date, out from_ts timestamptz, out to_ts timestamptz)
language plpgsql stable set search_path = public, pg_temp
as $$
begin
  if p_month is null then
    from_ts := '-infinity'; to_ts := 'infinity';
    return;
  end if;
  if p_month <> date_trunc('month', p_month)::date then
    raise exception '月份要写成这个月的 1 号' using errcode = '22023';
  end if;
  from_ts := p_month::timestamp at time zone 'America/Toronto';
  to_ts := (p_month + interval '1 month')::timestamp at time zone 'America/Toronto';
end;
$$;

-- ---------------------------------------------------------------------------
-- 概况：账号、药柜、病人档案是当前总数；处方和活跃账号按时间段
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview(p_month date default null)
returns table (
  users_total integer, users_household integer, users_clinic integer, users_unset integer,
  workspaces_household integer, workspaces_clinic integer, patients_total integer,
  prescriptions_total integer, prescriptions_in_window integer, active_users_in_window integer
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare w record;
begin
  perform public.admin_require();
  w := public.admin_window(p_month);
  return query
  select
    (select count(*)::int from auth.users),
    (select count(*)::int from auth.users u join public.user_settings s on s.user_id = u.id where s.account_kind = 'household'),
    (select count(*)::int from auth.users u join public.user_settings s on s.user_id = u.id where s.account_kind = 'clinic'),
    (select count(*)::int from auth.users u left join public.user_settings s on s.user_id = u.id where s.account_kind is null),
    (select count(*)::int from public.workspaces where kind = 'household'),
    (select count(*)::int from public.workspaces where kind = 'clinic'),
    (select count(*)::int from public.patients),
    (select count(*)::int from public.prescriptions),
    (select count(*)::int from public.prescriptions where created_at >= w.from_ts and created_at < w.to_ts),
    (select count(distinct created_by)::int from public.prescriptions where created_at >= w.from_ts and created_at < w.to_ts);
end;
$$;

-- ---------------------------------------------------------------------------
-- 处方趋势：每天 / 每周（周一开始）几张。没有处方的日子也有一行 0
-- 没给月份：最近 30 天 / 最近 12 周；给了月份：这个月的每一天 / 和这个月重叠的每一周（只数这个月里的）
-- ---------------------------------------------------------------------------
create or replace function public.admin_prescription_trend(p_bucket text, p_month date default null)
returns table (bucket_start date, prescriptions integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  w record;
  today date := (now() at time zone 'America/Toronto')::date;
  first_bucket date;
  last_bucket date;
  step interval;
begin
  perform public.admin_require();
  w := public.admin_window(p_month);
  if p_bucket = 'day' then
    step := interval '1 day';
    first_bucket := coalesce(p_month, today - 29);
    last_bucket := coalesce((p_month + interval '1 month' - interval '1 day')::date, today);
  elsif p_bucket = 'week' then
    step := interval '1 week';
    first_bucket := date_trunc('week', coalesce(p_month, today - 77))::date;
    last_bucket := date_trunc('week', coalesce((p_month + interval '1 month' - interval '1 day')::date, today))::date;
  else
    raise exception 'p_bucket 只能是 day 或 week' using errcode = '22023';
  end if;
  return query
  with b as (select g::date as s from generate_series(first_bucket, last_bucket, step) g),
  rx as (
    select (p.created_at at time zone 'America/Toronto')::date as d
    from public.prescriptions p
    where p.created_at >= w.from_ts and p.created_at < w.to_ts
  )
  select b.s, (select count(*)::int from rx where rx.d >= b.s and rx.d < (b.s + step)::date)
  from b order by b.s;
end;
$$;

-- ---------------------------------------------------------------------------
-- 每个账号：这段时间建过处方的账号一行。邮箱只给医生账号；病人账号只有编号
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_activity(p_month date default null)
returns table (
  user_no integer, email text, account_kind text, prescriptions integer, herbs integer, last_on date, is_me boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare w record;
begin
  perform public.admin_require();
  w := public.admin_window(p_month);
  return query
  with numbered as (  -- 账号编号：按第一次加入药柜的时间排（新账号排在后面，老账号的编号不变）
    select u.id, row_number() over (order by min(m.created_at) nulls last, u.id)::int as n
    from auth.users u left join public.workspace_members m on m.user_id = u.id
    group by u.id
  ),
  rx as (
    select p.id, p.created_by, p.created_at
    from public.prescriptions p
    where p.created_at >= w.from_ts and p.created_at < w.to_ts and p.created_by is not null
  )
  select n.n,
         case when s.account_kind = 'clinic' then u.email::text end,  -- Supabase 里 email 是 varchar
         s.account_kind,
         count(distinct rx.id)::int,
         count(distinct i.herb_id)::int,
         max((rx.created_at at time zone 'America/Toronto')::date),
         rx.created_by = auth.uid()
  from rx
  join auth.users u on u.id = rx.created_by
  join numbered n on n.id = rx.created_by
  left join public.user_settings s on s.user_id = rx.created_by
  left join public.prescription_items i on i.prescription_id = rx.id
  group by n.n, u.email, s.account_kind, rx.created_by
  order by 4 desc, 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 常用药材 / 常见组合。病人单位 = 诊所处方的病人，没有病人的按药柜算（0015 §5.1）。
-- 不到门槛的不单独列出，合成最后一行「其他」：名字和处方数为 null，other_* = 合进去了几个
-- ---------------------------------------------------------------------------
create or replace function public.admin_herb_counts(p_month date)
returns table (herb_id uuid, n_rx integer, n_subj integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.herb_id, count(distinct p.id)::int, count(distinct coalesce(p.patient_id, p.workspace_id))::int
  from public.prescriptions p
  join public.prescription_items i on i.prescription_id = p.id
  cross join public.admin_window(p_month) w
  where p.created_at >= w.from_ts and p.created_at < w.to_ts
  group by i.herb_id
$$;

create or replace function public.admin_top_herbs(p_month date default null, p_limit integer default 20)
returns table (herb_name text, prescriptions integer, other_herbs integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  k integer := public.admin_min_subjects();
  lim integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  perform public.admin_require();
  return query
  select h.name_zh, c.n_rx, null::int
  from public.admin_herb_counts(p_month) c join public.herbs h on h.id = c.herb_id
  where c.n_subj >= k
  order by c.n_rx desc, h.name_zh
  limit lim;
  return query
  select null::text, null::int, count(*)::int from public.admin_herb_counts(p_month) c where c.n_subj < k having count(*) > 0;
end;
$$;

-- 同一张处方里的两味药（按药名排成 a < b，每对只算一次）
create or replace function public.admin_pair_counts(p_month date)
returns table (herb_a text, herb_b text, n_rx integer, n_subj integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select ha.name_zh, hb.name_zh, count(distinct p.id)::int, count(distinct coalesce(p.patient_id, p.workspace_id))::int
  from public.prescriptions p
  join public.prescription_items ia on ia.prescription_id = p.id
  join public.prescription_items ib on ib.prescription_id = p.id
  join public.herbs ha on ha.id = ia.herb_id
  join public.herbs hb on hb.id = ib.herb_id
  cross join public.admin_window(p_month) w
  where p.created_at >= w.from_ts and p.created_at < w.to_ts
    and ha.name_zh < hb.name_zh
  group by ha.name_zh, hb.name_zh
$$;

create or replace function public.admin_top_pairs(p_month date default null, p_limit integer default 20)
returns table (herb_a text, herb_b text, prescriptions integer, other_pairs integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  k integer := public.admin_min_subjects();
  lim integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  perform public.admin_require();
  return query
  select c.herb_a, c.herb_b, c.n_rx, null::int
  from public.admin_pair_counts(p_month) c
  where c.n_subj >= k
  order by c.n_rx desc, c.herb_a, c.herb_b
  limit lim;
  return query
  select null::text, null::text, null::int, count(*)::int from public.admin_pair_counts(p_month) c where c.n_subj < k having count(*) > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 权限：统计函数只给登录用户（函数里再检查是不是管理员）；内部函数谁都不能直接调用
-- ---------------------------------------------------------------------------
do $$
declare
  rpc text[] := array['is_platform_admin', 'admin_overview', 'admin_prescription_trend', 'admin_user_activity',
                      'admin_top_herbs', 'admin_top_pairs'];
  internal text[] := array['admin_require', 'admin_window', 'admin_min_subjects', 'admin_herb_counts', 'admin_pair_counts'];
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = any (rpc || internal) loop
    execute format('revoke execute on function %s from public', f);
    if has_anon then execute format('revoke execute on function %s from anon', f); end if;
    if has_auth then execute format('revoke execute on function %s from authenticated', f); end if;
  end loop;
  if has_auth then
    for f in select p.oid::regprocedure from pg_proc p
             where p.pronamespace = 'public'::regnamespace and p.proname = any (rpc) loop
      execute format('grant execute on function %s to authenticated', f);
    end loop;
  end if;
end $$;
