-- 加固（来自线上 Supabase advisors 的警告）：
-- 1) Supabase 默认把 public schema 里函数的 EXECUTE 授予 anon。下面这些 SECURITY DEFINER 函数
--    本身都会检查 auth.uid()，未登录调用拿不到数据，但没必要对未登录用户开放 → 只留给 authenticated。
--    is_member() 不动：RLS policy 里用它，anon 查表时也会调用（返回 false）。
-- 2) 触发器函数不需要任何人直接调用（触发器执行时不检查 EXECUTE 权限）→ 全部收回。
-- 3) match_herb 固定 search_path。
-- 4) user_settings 的 policy 用 (select auth.uid())，每条查询只算一次。

do $$
declare
  rpc text[] := array[
    'accept_invitation', 'consume_parse_quota', 'create_clinic', 'decline_invitation',
    'ensure_default_workspace', 'invite_member', 'leave_workspace', 'list_members',
    'my_invitations', 'my_workspaces', 'remove_member', 'revoke_invitation', 'set_active_workspace'
  ];
  trg text[] := array['patients_only_in_clinic', 'sync_purchase_date_txn', 'sync_purchase_item_txn'];
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = any (rpc) loop
    execute format('revoke execute on function %s from public', f);
    if has_anon then execute format('revoke execute on function %s from anon', f); end if;
    if has_auth then execute format('grant execute on function %s to authenticated', f); end if;
  end loop;

  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = any (trg) loop
    execute format('revoke execute on function %s from public', f);
    if has_anon then execute format('revoke execute on function %s from anon', f); end if;
    if has_auth then execute format('revoke execute on function %s from authenticated', f); end if;
  end loop;
end $$;

alter function public.match_herb(text) set search_path = public, pg_temp;

drop policy if exists us_self on public.user_settings;
create policy us_self on public.user_settings for select using (user_id = (select auth.uid()));
