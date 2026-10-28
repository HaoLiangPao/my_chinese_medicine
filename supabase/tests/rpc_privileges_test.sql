-- 0009：未登录（anon）不能调用业务函数，也读不到任何业务数据；触发器函数谁都不能直接调用
\ir _helpers.sql
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to anon;

-- 先以 hao 的身份造一点数据
:as_hao;
select ensure_default_workspace() as ws \gset
insert into prescriptions (workspace_id, title) values (:'ws', '测试方');
reset role;

-- 业务函数：anon 没有 EXECUTE，authenticated 有
select assert_eq(has_function_privilege('anon', p.oid, 'execute'), false, 'anon 不能执行 ' || p.proname)
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
  'accept_invitation', 'consume_parse_quota', 'create_clinic', 'decline_invitation',
  'ensure_default_workspace', 'invite_member', 'leave_workspace', 'list_members',
  'my_invitations', 'my_workspaces', 'remove_member', 'revoke_invitation', 'set_active_workspace');
select assert_eq(has_function_privilege('authenticated', p.oid, 'execute'), true, 'authenticated 能执行 ' || p.proname)
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('ensure_default_workspace', 'consume_parse_quota', 'create_clinic', 'my_workspaces');
select assert_eq(count(*)::int, 13, '13 个业务函数都检查到了')
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
  'accept_invitation', 'consume_parse_quota', 'create_clinic', 'decline_invitation',
  'ensure_default_workspace', 'invite_member', 'leave_workspace', 'list_members',
  'my_invitations', 'my_workspaces', 'remove_member', 'revoke_invitation', 'set_active_workspace');

-- 触发器函数：anon / authenticated 都不能直接调用
select assert_eq(has_function_privilege(r, p.oid, 'execute'), false, r || ' 不能直接执行触发器函数 ' || p.proname)
from pg_proc p, unnest(array['anon', 'authenticated']) r
where p.pronamespace = 'public'::regnamespace and p.proname in ('patients_only_in_clinic', 'sync_purchase_date_txn', 'sync_purchase_item_txn');

-- 收回权限后，触发器照常工作（采购 → 自动记库存流水）
:as_hao;
insert into stores (workspace_id, name) values (:'ws', '测试药行') returning id as store \gset
insert into purchases (workspace_id, store_id, purchased_on) values (:'ws', :'store', current_date) returning id as pu \gset
insert into purchase_items (purchase_id, herb_id, grams, price)
  select :'pu', id, 100, 10 from herbs where name_zh = '黄芪';
select assert_eq(stock('黄芪'), 100::numeric, '采购触发器仍然记了库存');
reset role;

-- anon：is_member 仍可用（RLS 里要用），但读不到任何业务数据
set role anon; set request.jwt.claim.sub = '';
select assert_eq((select count(*)::int from prescriptions), 0, 'anon 看不到药方');
select assert_eq((select count(*)::int from inventory_txns), 0, 'anon 看不到库存流水');
select assert_eq((select count(*)::int from workspaces), 0, 'anon 看不到药柜');
select assert_raises($$select ensure_default_workspace()$$, 'permission denied', 'anon 调 ensure_default_workspace 被拒');
select assert_raises($$select consume_parse_quota(30)$$, 'permission denied', 'anon 调 consume_parse_quota 被拒');
reset role;

-- match_herb 的 search_path 固定了
select assert_eq((select proconfig::text from pg_proc where proname = 'match_herb'), '{"search_path=public, pg_temp"}', 'match_herb search_path');
