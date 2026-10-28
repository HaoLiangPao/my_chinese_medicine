-- 加固：
-- 1) 药材目录是全局共享的。之前任何登录用户都能「修改」任意药材（比如把黄芪改名），
--    会影响所有家庭。App 只需要新增，不需要修改 → 去掉 update 权限。
-- 2) workspace_is_empty 是内部函数。Supabase 会默认把函数的执行权限授予 anon/authenticated，
--    只 revoke public 不够，要显式收回。

drop policy if exists herbs_update on public.herbs;

revoke execute on function public.workspace_is_empty(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.workspace_is_empty(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.workspace_is_empty(uuid) from authenticated;
  end if;
end $$;
