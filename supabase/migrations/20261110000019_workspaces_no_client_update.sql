-- =============================================================================
-- 药柜（workspaces）不能由客户端直接修改。设计见 docs/design/0016-workspaces-read-only.md
--
-- init 里的 ws_update 策略是 `for update using (is_member(id))`：任何成员（包括被邀请的家人）
-- 用自己的 token 直接调 REST `PATCH /workspaces` 就能改 name 和 kind。migration 000010（账号类型）之后 is_member 要求
-- 药柜的 kind 和账号类型一致，kind 被改掉以后，这个药柜的药方、病人、照片所有成员都读不到。
--
-- App 没有任何地方直接 update workspaces（建药柜、清理空药柜都在 security definer 函数里，
-- 以函数所有者的权限执行，不受这里影响），所以直接删掉策略，再收回表级的 UPDATE 权限（两层）。
-- 以后要做「改名」：加一个只改 name、只给 owner 的 security definer 函数，不要把策略加回来。
-- =============================================================================

drop policy if exists ws_update on public.workspaces;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke update on public.workspaces from %I', r);
    end if;
  end loop;
end $$;
