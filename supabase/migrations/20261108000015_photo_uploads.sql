-- =============================================================================
-- 清理没用上的药方照片（FIX-8）。设计见 docs/design/0012-photo-cleanup.md
--
-- photo_uploads：每次上传照片记一行；stale_photo_paths()：本药柜里超过 7 天、没被任何药方引用的照片。
-- App 在拍照识别、保存药方之后顺手用当前用户的权限删掉这些照片（Storage API）和登记。
-- 只加新表和新函数，旧代码不受影响（旧代码不登记，补登记见文件末尾）。
-- =============================================================================

create table public.photo_uploads (
  path         text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  uploaded_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint photo_uploads_path_in_workspace check (split_part(path, '/', 1) = workspace_id::text)
);
create index on public.photo_uploads (workspace_id, created_at);

alter table public.photo_uploads enable row level security;
create policy pu_read   on public.photo_uploads for select to authenticated using (public.is_member(workspace_id));
create policy pu_insert on public.photo_uploads for insert to authenticated with check (public.is_member(workspace_id));
create policy pu_delete on public.photo_uploads for delete to authenticated using (public.is_member(workspace_id));
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.photo_uploads from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke update, truncate on public.photo_uploads from authenticated;
  end if;
end $$;

-- 本药柜（RLS 决定看得到哪些）里超过 p_days 天、没有任何药方的 photo_path 指向的照片。一次最多 50 张
create or replace function public.stale_photo_paths(p_days integer default 7)
returns setof text
language sql stable security invoker set search_path = public, pg_temp
as $$
  select u.path
  from public.photo_uploads u
  where u.created_at < now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
    and not exists (select 1 from public.prescriptions p where p.photo_path = u.path)
  order by u.created_at
  limit 50;
$$;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'stale_photo_paths' loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', f); end if;
  end loop;
end $$;

-- 补登记线上已有的照片（本地纯 Postgres 测试时没有 storage schema，跳过）。用照片原来的上传时间。可以重复执行
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into public.photo_uploads (path, workspace_id, uploaded_by, created_at)
    select o.name, w.id, null, coalesce(o.created_at, now())
    from storage.objects o
    join public.workspaces w on w.id::text = split_part(o.name, '/', 1)
    where o.bucket_id = 'prescription-photos'
    on conflict (path) do nothing;
  end if;
end $$;
