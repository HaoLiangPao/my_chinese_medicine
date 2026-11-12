-- =============================================================================
-- 平台管理员看板（IDEA-4 第一版）。设计见 docs/design/0015-admin-dashboard.md
--
-- platform_admins：管理员名单。只能用 SQL 加人（这里不写任何账号），客户端读写都不行。
-- admin_*：看板用的函数。都是 security definer，第一步先检查调用人是管理员，否则报错。
--   只返回汇总数字和账号级别的数字；不返回病人姓名、电话、备注、处方原文；
--   药材和组合不到 5 位病人的合并成「其他」。唯一的写操作是改 Bug 反馈的状态。
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

-- ---------------------------------------------------------------------------
-- 内部函数（谁都不能直接调用，只在下面的函数里用）
-- ---------------------------------------------------------------------------

-- 每个对外函数的第一步：不是管理员就报错
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

-- 小样本门槛：一味药 / 一对药至少出现在这么多位不同病人的处方里才单独显示（0015 §5.2）
create or replace function public.admin_min_subjects()
returns integer
language sql immutable set search_path = public, pg_temp
as $$ select 5 $$;

-- 时间段：起止日期都包含在内，按多伦多时间；null = 不限。1990 年以前、2100 年以后、infinity 都不接受
create or replace function public.admin_window(p_from date, p_to date, out from_ts timestamptz, out to_ts timestamptz)
language plpgsql stable set search_path = public, pg_temp
as $$
begin
  if (p_from is not null and (not isfinite(p_from) or p_from < date '1990-01-01' or p_from > date '2100-01-01'))
     or (p_to is not null and (not isfinite(p_to) or p_to < date '1990-01-01' or p_to > date '2100-01-01')) then
    raise exception '日期超出范围' using errcode = '22023';
  end if;
  if p_from > p_to then
    raise exception '开始日期不能晚于结束日期' using errcode = '22023';
  end if;
  from_ts := coalesce(p_from::timestamp at time zone 'America/Toronto', '-infinity');
  to_ts := coalesce((p_to + 1)::timestamp at time zone 'America/Toronto', 'infinity');
end;
$$;

-- 账号编号：按第一次加入药柜的时间排（新账号一般排在后面；有人退出药柜等情况下别人的编号可能会变）
create or replace function public.admin_user_numbers()
returns table (user_id uuid, user_no integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, row_number() over (order by min(m.created_at) nulls last, u.id)::int
  from auth.users u left join public.workspace_members m on m.user_id = u.id
  group by u.id
$$;

-- 账号「自己的」药柜：和账号类型相同的那几个（没选类型的旧账号：全部）
create or replace function public.admin_account_workspaces(p_user uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select m.workspace_id
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  left join public.user_settings s on s.user_id = m.user_id
  where m.user_id = p_user and (s.account_kind is null or w.kind = s.account_kind)
$$;

-- 每味药：几张处方、累计多少克（每副克数 × 剂数）、几位病人。
-- 病人数 = 「诊所里的病人」和「没挂病人的药柜（家庭）」两组里较大的那个，不相加：
-- 同一个人可能既是诊所的病人、又在自己家里录了同一张方（0015 §5.1）
create or replace function public.admin_herb_counts(p_from date, p_to date)
returns table (herb_id uuid, n_rx integer, grams numeric, n_subj integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.herb_id, count(distinct p.id)::int, sum(i.grams_per_dose * p.dose_count),
         greatest(count(distinct p.patient_id), count(distinct case when p.patient_id is null then p.workspace_id end))::int
  from public.prescriptions p
  join public.prescription_items i on i.prescription_id = p.id
  cross join public.admin_window(p_from, p_to) w
  where p.created_at >= w.from_ts and p.created_at < w.to_ts
  group by i.herb_id
$$;

-- 同一张处方里的两味药（按药名排成 a < b，每对只算一次）
create or replace function public.admin_pair_counts(p_from date, p_to date)
returns table (herb_a text, herb_b text, n_rx integer, n_subj integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select ha.name_zh, hb.name_zh, count(distinct p.id)::int,
         greatest(count(distinct p.patient_id), count(distinct case when p.patient_id is null then p.workspace_id end))::int
  from public.prescriptions p
  join public.prescription_items ia on ia.prescription_id = p.id
  join public.prescription_items ib on ib.prescription_id = p.id
  join public.herbs ha on ha.id = ia.herb_id
  join public.herbs hb on hb.id = ib.herb_id
  cross join public.admin_window(p_from, p_to) w
  where p.created_at >= w.from_ts and p.created_at < w.to_ts
    and ha.name_zh < hb.name_zh
  group by ha.name_zh, hb.name_zh
$$;

-- ---------------------------------------------------------------------------
-- 总览
-- ---------------------------------------------------------------------------

-- 概况：账号、药柜、病人档案是当前总数；处方和活跃账号按时间段
create or replace function public.admin_overview(p_from date default null, p_to date default null)
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
  w := public.admin_window(p_from, p_to);
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

-- 处方趋势：每天 / 每周（周一开始）/ 每月几张，没有处方的也有一行 0。
-- 不限开始日期时从第一张处方开始，不限结束日期时到今天。最多 400 个点。
-- p_bucket = 'auto'：62 天以内按天，两年以内按周，再长按月；返回的 bucket 列说明用的是哪种
-- p_user：只数这个账号自己的药柜（医生、病人账号的详情页用）
create or replace function public.admin_prescription_trend(p_bucket text, p_from date default null, p_to date default null, p_user uuid default null)
returns table (bucket_start date, prescriptions integer, bucket text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  w record;
  today date := (now() at time zone 'America/Toronto')::date;
  lo date;
  hi date;
  b text := p_bucket;
  step interval;
begin
  perform public.admin_require();
  w := public.admin_window(p_from, p_to);
  if b is null or b not in ('day', 'week', 'month', 'auto') then
    raise exception 'p_bucket 只能是 day、week、month 或 auto' using errcode = '22023';
  end if;
  lo := coalesce(p_from, (select min((created_at at time zone 'America/Toronto')::date) from public.prescriptions), today);
  hi := greatest(coalesce(p_to, today), lo);
  if b = 'auto' then
    b := case when hi - lo <= 62 then 'day' when hi - lo <= 730 then 'week' else 'month' end;
  end if;
  step := ('1 ' || b)::interval;
  lo := date_trunc(b, lo)::date;
  hi := date_trunc(b, hi)::date;
  if (select count(*) from generate_series(lo, hi, step)) > 400 then
    raise exception '时间段太长，换一个更大的粒度' using errcode = '22023';
  end if;
  return query
  with bk as (select g::date as s from generate_series(lo, hi, step) g),
  rx as (
    select (p.created_at at time zone 'America/Toronto')::date as d
    from public.prescriptions p
    where p.created_at >= w.from_ts and p.created_at < w.to_ts
      and (p_user is null or p.workspace_id in (select public.admin_account_workspaces(p_user)))
  )
  select bk.s, (select count(*)::int from rx where rx.d >= bk.s and rx.d < (bk.s + step)::date), b
  from bk order by bk.s;
end;
$$;

-- 每个账号：这段时间建过处方的账号一行（按 created_by）。邮箱只给医生账号；病人账号只有编号
create or replace function public.admin_user_activity(p_from date default null, p_to date default null)
returns table (
  user_id uuid, user_no integer, email text, account_kind text, prescriptions integer, herbs integer, last_on date, is_me boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare w record;
begin
  perform public.admin_require();
  w := public.admin_window(p_from, p_to);
  return query
  with rx as (
    select p.id, p.created_by, p.created_at
    from public.prescriptions p
    where p.created_at >= w.from_ts and p.created_at < w.to_ts and p.created_by is not null
  )
  select rx.created_by,
         n.user_no,
         case when s.account_kind = 'clinic' then u.email::text end,  -- Supabase 里 email 是 varchar
         s.account_kind,
         count(distinct rx.id)::int,
         count(distinct i.herb_id)::int,
         max((rx.created_at at time zone 'America/Toronto')::date),
         rx.created_by = auth.uid()
  from rx
  join auth.users u on u.id = rx.created_by
  join public.admin_user_numbers() n on n.user_id = rx.created_by
  left join public.user_settings s on s.user_id = rx.created_by
  left join public.prescription_items i on i.prescription_id = rx.id
  group by rx.created_by, n.user_no, u.email, s.account_kind
  order by 5 desc, 2;
end;
$$;

-- 常用药材：按累计克数（p_order = 'grams'）或处方张数（'rx'）排，最多 p_limit 行（1–50）。
-- 不到门槛的不单独列出，合成最后一行「其他」：名字、张数、克数为 null，other_herbs = 合进去了几味
create or replace function public.admin_top_herbs(p_from date default null, p_to date default null, p_limit integer default 10, p_order text default 'grams')
returns table (herb_name text, prescriptions integer, total_grams numeric, other_herbs integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  k integer := public.admin_min_subjects();
  lim integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  perform public.admin_require();
  if p_order is null or p_order not in ('grams', 'rx') then
    raise exception 'p_order 只能是 grams 或 rx' using errcode = '22023';
  end if;
  return query
  select h.name_zh, c.n_rx, c.grams, null::int
  from public.admin_herb_counts(p_from, p_to) c join public.herbs h on h.id = c.herb_id
  where c.n_subj >= k
  order by case when p_order = 'rx' then c.n_rx else c.grams end desc, c.n_rx desc, h.name_zh
  limit lim;
  return query
  select null::text, null::int, null::numeric, count(*)::int
  from public.admin_herb_counts(p_from, p_to) c where c.n_subj < k having count(*) > 0;
end;
$$;

-- 常见组合：同样的门槛和「其他」行
create or replace function public.admin_top_pairs(p_from date default null, p_to date default null, p_limit integer default 10)
returns table (herb_a text, herb_b text, prescriptions integer, other_pairs integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  k integer := public.admin_min_subjects();
  lim integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  perform public.admin_require();
  return query
  select c.herb_a, c.herb_b, c.n_rx, null::int
  from public.admin_pair_counts(p_from, p_to) c
  where c.n_subj >= k
  order by c.n_rx desc, c.herb_a, c.herb_b
  limit lim;
  return query
  select null::text, null::text, null::int, count(*)::int
  from public.admin_pair_counts(p_from, p_to) c where c.n_subj < k having count(*) > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 医生（诊所账号）。p_user 给了就只返回这一个（详情页）
-- 病人档案只有数量：总数、这段时间新建的、这段时间开过处方的
-- ---------------------------------------------------------------------------
create or replace function public.admin_doctors(p_from date default null, p_to date default null, p_user uuid default null)
returns table (
  user_id uuid, user_no integer, email text, patients_total integer, patients_new integer, patients_seen integer,
  prescriptions integer, prescriptions_total integer, decoctions integer, consumed_grams numeric, last_on date
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare w record;
begin
  perform public.admin_require();
  w := public.admin_window(p_from, p_to);
  return query
  with doc as (
    select s.user_id as uid from public.user_settings s
    where s.account_kind = 'clinic' and (p_user is null or s.user_id = p_user)
  ),
  ws as (select d.uid, x.ws from doc d cross join lateral public.admin_account_workspaces(d.uid) as x(ws))
  select d.uid, n.user_no, u.email::text,
    (select count(*)::int from public.patients pt where pt.workspace_id in (select ws.ws from ws where ws.uid = d.uid)),
    (select count(*)::int from public.patients pt where pt.workspace_id in (select ws.ws from ws where ws.uid = d.uid)
       and pt.created_at >= w.from_ts and pt.created_at < w.to_ts),
    (select count(distinct p.patient_id)::int from public.prescriptions p where p.workspace_id in (select ws.ws from ws where ws.uid = d.uid)
       and p.created_at >= w.from_ts and p.created_at < w.to_ts),
    (select count(*)::int from public.prescriptions p where p.workspace_id in (select ws.ws from ws where ws.uid = d.uid)
       and p.created_at >= w.from_ts and p.created_at < w.to_ts),
    (select count(*)::int from public.prescriptions p where p.workspace_id in (select ws.ws from ws where ws.uid = d.uid)),
    (select count(*)::int from public.decoctions dc where dc.workspace_id in (select ws.ws from ws where ws.uid = d.uid)
       and dc.decocted_at >= w.from_ts and dc.decocted_at < w.to_ts),
    (select coalesce(-sum(t.delta_grams), 0) from public.inventory_txns t where t.kind = 'consume'
       and t.workspace_id in (select ws.ws from ws where ws.uid = d.uid)
       and t.occurred_at >= w.from_ts and t.occurred_at < w.to_ts),
    (select max((p.created_at at time zone 'America/Toronto')::date) from public.prescriptions p
       where p.workspace_id in (select ws.ws from ws where ws.uid = d.uid))
  from doc d
  join auth.users u on u.id = d.uid
  join public.admin_user_numbers() n on n.user_id = d.uid
  order by 7 desc, 2;
end;
$$;

-- 一个医生的库存消耗（配药扣掉的克数），逐味；同样的 5 位病人门槛（病人从配药对应的处方来）
create or replace function public.admin_doctor_consumption(p_user uuid, p_from date default null, p_to date default null, p_limit integer default 10)
returns table (herb_name text, consumed_grams numeric, other_herbs integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  w record;
  k integer := public.admin_min_subjects();
  lim integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  perform public.admin_require();
  w := public.admin_window(p_from, p_to);
  return query
  with c as (
    select t.herb_id, -sum(t.delta_grams) as g,
           greatest(count(distinct p.patient_id),
                    count(distinct case when p.patient_id is null then t.workspace_id end))::int as n_subj
    from public.inventory_txns t
    left join public.decoctions dc on dc.id = t.decoction_id
    left join public.prescriptions p on p.id = coalesce(t.prescription_id, dc.prescription_id)
    where t.kind = 'consume'
      and t.workspace_id in (select public.admin_account_workspaces(p_user))
      and (select s.account_kind from public.user_settings s where s.user_id = p_user) = 'clinic'
      and t.occurred_at >= w.from_ts and t.occurred_at < w.to_ts
    group by t.herb_id
  ),
  shown as (
    select h.name_zh, c.g from c join public.herbs h on h.id = c.herb_id
    where c.n_subj >= k order by c.g desc, h.name_zh limit lim
  )
  select shown.name_zh, shown.g, null::int from shown
  union all
  select null::text, null::numeric, count(*)::int from c where c.n_subj < k having count(*) > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 病人账号（家庭账号）：只有数字，没有用了哪些药（0015 §4.3）。p_user 给了就只返回这一个
-- ---------------------------------------------------------------------------
create or replace function public.admin_patient_accounts(p_from date default null, p_to date default null, p_user uuid default null)
returns table (
  user_id uuid, user_no integer, members integer, prescriptions integer, prescriptions_total integer,
  herbs integer, decoctions integer, active_days integer, last_on date, is_me boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare w record;
begin
  perform public.admin_require();
  w := public.admin_window(p_from, p_to);
  return query
  with acc as (
    select s.user_id as uid from public.user_settings s
    where s.account_kind = 'household' and (p_user is null or s.user_id = p_user)
  ),
  ws as (select a.uid, x.ws from acc a cross join lateral public.admin_account_workspaces(a.uid) as x(ws)),
  rx as (select ws.uid, p.id, p.created_at from ws join public.prescriptions p on p.workspace_id = ws.ws)
  select a.uid, n.user_no,
    (select count(distinct m.user_id)::int from public.workspace_members m where m.workspace_id in (select ws.ws from ws where ws.uid = a.uid)),
    (select count(*)::int from rx where rx.uid = a.uid and rx.created_at >= w.from_ts and rx.created_at < w.to_ts),
    (select count(*)::int from rx where rx.uid = a.uid),
    (select count(distinct i.herb_id)::int from rx join public.prescription_items i on i.prescription_id = rx.id
       where rx.uid = a.uid and rx.created_at >= w.from_ts and rx.created_at < w.to_ts),
    (select count(*)::int from public.decoctions dc where dc.workspace_id in (select ws.ws from ws where ws.uid = a.uid)
       and dc.decocted_at >= w.from_ts and dc.decocted_at < w.to_ts),
    (select count(distinct (rx.created_at at time zone 'America/Toronto')::date)::int from rx
       where rx.uid = a.uid and rx.created_at >= w.from_ts and rx.created_at < w.to_ts),
    (select max((rx.created_at at time zone 'America/Toronto')::date) from rx where rx.uid = a.uid),
    a.uid = auth.uid()
  from acc a
  join public.admin_user_numbers() n on n.user_id = a.uid
  order by 4 desc, 2;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bug 反馈（IDEA-5，docs/design/0014）：列表和改状态。
-- 描述是用户自己写的，可能提到病人；管理员处理反馈本来就要读描述（0014）。提交人只显示编号（医生加邮箱）
-- ---------------------------------------------------------------------------
create or replace function public.admin_bug_reports(p_status text default null, p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, status text, reporter_id uuid, reporter_no integer, reporter_kind text, reporter_email text,
  page_path text, description text, user_agent text, viewport text, app_version text, recent_actions jsonb, recent_errors jsonb
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.admin_require();
  if p_status is not null and p_status not in ('new', 'in_progress', 'fixed', 'wontfix') then
    raise exception '状态不对' using errcode = '22023';
  end if;
  return query
  select b.id, b.created_at, b.status, b.reporter_id, n.user_no, s.account_kind,
         case when s.account_kind = 'clinic' then u.email::text end,
         b.page_path, b.description, b.user_agent, b.viewport, b.app_version, b.recent_actions, b.recent_errors
  from public.bug_reports b
  left join auth.users u on u.id = b.reporter_id
  left join public.user_settings s on s.user_id = b.reporter_id
  left join public.admin_user_numbers() n on n.user_id = b.reporter_id
  where p_status is null or b.status = p_status
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.admin_set_bug_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.admin_require();
  if p_status is null or p_status not in ('new', 'in_progress', 'fixed', 'wontfix') then
    raise exception '状态不对' using errcode = '22023';
  end if;
  update public.bug_reports set status = p_status where id = p_id;
  if not found then raise exception '找不到这条反馈' using errcode = 'P0002'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 权限：对外函数只给登录用户（函数里再检查是不是管理员）；内部函数谁都不能直接调用
-- ---------------------------------------------------------------------------
do $$
declare
  rpc text[] := array['is_platform_admin', 'admin_overview', 'admin_prescription_trend', 'admin_user_activity',
                      'admin_top_herbs', 'admin_top_pairs', 'admin_doctors', 'admin_doctor_consumption',
                      'admin_patient_accounts', 'admin_bug_reports', 'admin_set_bug_status'];
  internal text[] := array['admin_require', 'admin_window', 'admin_min_subjects', 'admin_user_numbers',
                           'admin_account_workspaces', 'admin_herb_counts', 'admin_pair_counts'];
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
