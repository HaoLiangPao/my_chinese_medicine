-- 在纯 Postgres 上模拟 Supabase 的 auth schema 和角色，仅供本地测试用。
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- 和 Supabase 一样：对象「创建时」默认授权给 authenticated（之后 migration 里的 revoke 才有意义）
grant usage on schema public to authenticated;
alter default privileges for role postgres in schema public grant all on tables to authenticated;
alter default privileges for role postgres in schema public grant all on sequences to authenticated;
alter default privileges for role postgres in schema public grant execute on functions to authenticated;
