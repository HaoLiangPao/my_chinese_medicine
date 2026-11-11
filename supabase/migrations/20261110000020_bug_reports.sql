-- =============================================================================
-- 应用内 Bug 反馈（IDEA-5 第一阶段）。设计见 docs/design/0014-bug-reports.md
--
-- bug_reports：用户提交的反馈 + 脱敏后的诊断信息。只能插自己的、读自己的；不能改、不能删。
-- bug_report_usage：每人每天提交了几次（防刷，写法同 parse_usage / consume_parse_quota）。
-- 只加新表和新函数，旧代码不受影响。
-- =============================================================================

create table public.bug_reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references auth.users(id) on delete set null default auth.uid(),
  workspace_id   uuid references public.workspaces(id) on delete set null,
  page_path      text not null check (char_length(page_path) between 1 and 300),
  description    text not null check (char_length(btrim(description)) >= 1 and char_length(description) <= 2000),
  user_agent     text check (char_length(user_agent) <= 300),
  viewport       text check (viewport ~ '^\d{1,5}x\d{1,5}$'),
  app_version    text check (char_length(app_version) <= 64),
  recent_actions jsonb not null default '[]'::jsonb,
  recent_errors  jsonb not null default '[]'::jsonb,
  status         text not null default 'new' check (status in ('new', 'in_progress', 'fixed', 'wontfix')),
  created_at     timestamptz not null default now(),
  -- 条数和总大小的上限（App 里每条还有更细的长度限制，这里是最后一道）
  constraint bug_reports_actions_shape check (
    jsonb_typeof(recent_actions) = 'array' and jsonb_array_length(recent_actions) <= 20 and char_length(recent_actions::text) <= 8000),
  constraint bug_reports_errors_shape check (
    jsonb_typeof(recent_errors) = 'array' and jsonb_array_length(recent_errors) <= 5 and char_length(recent_errors::text) <= 16000)
);
create index on public.bug_reports (reporter_id, created_at desc);
create index on public.bug_reports (status, created_at desc);

create table public.bug_report_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);
alter table public.bug_report_usage enable row level security;  -- 没有 policy：只有下面的触发器（security definer）能读写

alter table public.bug_reports enable row level security;
create policy br_read on public.bug_reports for select to authenticated using (reporter_id = auth.uid());
create policy br_insert on public.bug_reports for insert to authenticated
  with check (reporter_id = auth.uid() and (workspace_id is null or public.is_member(workspace_id)));

-- 提交人只能写这几列：状态、提交人、时间、id 只能用默认值；没有 update / delete
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.bug_reports, public.bug_report_usage from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.bug_reports to authenticated;
    grant insert (workspace_id, page_path, description, user_agent, viewport, app_version, recent_actions, recent_errors)
      on public.bug_reports to authenticated;
  end if;
end $$;

-- 每人每天最多 20 条。上限写在数据库里、放在触发器里：这张表允许直接插入，绕过 App 也有上限。
-- 超过时报错，这一次不计数（整个语句回滚）
create or replace function public.bug_report_quota()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare c integer;
begin
  if new.reporter_id is null then return new; end if;  -- 管理员（没有登录身份）直接写的不计
  insert into public.bug_report_usage (user_id, day, count) values (new.reporter_id, (now() at time zone 'utc')::date, 1)  -- 按 UTC 算一天，不跟会话时区走
  on conflict (user_id, day) do update set count = bug_report_usage.count + 1
  where bug_report_usage.count < 20
  returning count into c;
  if c is null then raise exception '今天的反馈次数已用完（每天 20 条）'; end if;
  return new;
end;
$$;
create trigger bug_reports_quota before insert on public.bug_reports
for each row execute function public.bug_report_quota();

-- 触发器函数谁都不能直接调用
do $$
declare f regprocedure; r text;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'bug_report_quota' loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke execute on function %s from %I', f, r); end if;
    end loop;
  end loop;
end $$;
