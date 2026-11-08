-- 把 backup-prod.sh 的 .sql 备份恢复到一个普通 Postgres（不是 Supabase）之前先跑这个：
-- 补上 Supabase 自带、备份里没有的角色、schema、扩展和 publication，否则授权和 RLS 语句会报错。
-- 用法见 docs/design/0009 §4。只在本地临时库里用，不要在线上跑。
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'supabase_admin', 'supabase_auth_admin',
                           'supabase_storage_admin', 'dashboard_user', 'authenticator'] loop
    if not exists (select from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

do $$
begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
