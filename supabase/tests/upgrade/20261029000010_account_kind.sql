-- migration 20261029000010_account_kind 在「有数据的库」上的行为（scripts/test-upgrade.sh 只在它是新增的时候跑）。
-- 账号类型（docs/design/0008-account-types.md）。
-- 1. 部署期间旧代码还在跑：所有账号 account_kind = null，函数和原来一样
-- 2. 新代码上线后每个旧账号第一次登录选类型：选完只剩一个药柜，其他的隐藏，数据一条不删
\ir ../_helpers.sql

\set as_u1 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a1'''
\set as_u2 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a2'''
\set as_u3 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a3'''
\set as_u4 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a4'''
\set as_u5 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a5'''

select assert_eq((select count(*) from user_settings where account_kind is not null), 0::bigint, '升级后所有旧账号都还没选类型');

select w.id as w1 from workspaces w join workspace_members m on m.workspace_id = w.id
  where m.user_id = '00000000-0000-0000-0000-0000000000a1' and m.role = 'owner' \gset
select w.id as w2 from workspaces w join workspace_members m on m.workspace_id = w.id
  where m.user_id = '00000000-0000-0000-0000-0000000000a2' and m.role = 'owner' \gset
select w.id as w3 from workspaces w join workspace_members m on m.workspace_id = w.id
  where m.user_id = '00000000-0000-0000-0000-0000000000a3' and w.kind = 'clinic' \gset
select w.id as w3home from workspaces w join workspace_members m on m.workspace_id = w.id
  where m.user_id = '00000000-0000-0000-0000-0000000000a3' and w.kind = 'household' \gset
select w.id as w4 from workspaces w join workspace_members m on m.workspace_id = w.id
  where m.user_id = '00000000-0000-0000-0000-0000000000a4' and w.kind = 'clinic' \gset
select w.id as w4home from workspaces w join workspace_members m on m.workspace_id = w.id
  where m.user_id = '00000000-0000-0000-0000-0000000000a4' and w.kind = 'household' \gset

-- ---- 1. 旧代码：和升级前一样 ----
:as_u2;
select assert_eq((select count(*) from my_workspaces()), 2::bigint, '旧代码：家人还是在两个药柜里');
select assert_eq(ensure_default_workspace(), :'w1'::uuid, '旧代码：当前药柜没变');
select assert_eq((select count(*) from prescriptions), 4::bigint, '旧代码：两个药柜的药方都看得到');
select set_active_workspace(:'w2');
select set_active_workspace(:'w1');
:as_u3;
select assert_eq((select count(*) from my_workspaces()), 2::bigint, '旧代码：医生的「我们家」和诊所都在');
select assert_eq(ensure_default_workspace(), :'w3'::uuid, '旧代码：医生当前在诊所');
select assert_eq((select count(*) from patients), 2::bigint, '旧代码：医生看得到病人');
select assert_eq((select account_kind from current_context()), null::text, '新代码会让旧账号先去选类型');

-- ---- 2. 新代码：每个旧账号第一次登录选类型 ----
-- 医生（像李医生）：选医生 → 用原来的诊所，不用填名字；病人、处方、库存都在；空的「我们家」隐藏
select assert_eq(choose_account_kind('clinic'), :'w3'::uuid, '医生选「医生」：还是原来的诊所');
select assert_eq((select workspace_name from current_context()), '李医生诊所', '诊所名字没变');
select assert_eq((select count(*) from patients), 2::bigint, '病人都在');
select assert_eq((select count(*) from prescriptions), 2::bigint, '处方都在');
select assert_eq((select count(*) from decoctions), 1::bigint, '配药记录都在');
select assert_eq((select on_hand_grams from v_inventory where name_zh = '黄芪'), 860::numeric, '黄芪 1000 − 20×7 = 860');
select assert_eq((select count(*) from my_workspaces()), 1::bigint, '医生只有一个药柜');
select assert_eq(is_member(:'w3home'), false, '空的「我们家」隐藏了');

-- 家庭：选病人 → 还是自己的药柜，家人和邀请都在
:as_u1;
select assert_eq(choose_account_kind('household'), :'w1'::uuid, '家庭选「病人」：还是自己的药柜');
select assert_eq((select count(*) from list_members(:'w1')), 2::bigint, '家人还在');
select assert_eq((select count(*) from prescriptions), 3::bigint, '药方都在（包括家人录的）');
select assert_eq((select on_hand_grams from v_inventory where name_zh = '黄芪'), 605::numeric, '黄芪 200 + 500 − 30×2 − 35 = 605');

-- 家人：选病人 → 留在当前（u1 的）药柜，自己家的隐藏；退出 u1 的药柜后回到自己家，数据都在
:as_u2;
select assert_eq(choose_account_kind('household'), :'w1'::uuid, '家人选「病人」：留在当前的家庭药柜');
select assert_eq((select count(*) from my_workspaces()), 1::bigint, '家人只有一个药柜');
select assert_eq(is_member(:'w2'), false, '自己家的药柜隐藏了');
select assert_raises(format('select set_active_workspace(%L)', :'w2'), '不能切换', '不能切回自己家');
select leave_workspace(:'w1');
select assert_eq((select workspace_id from current_context()), :'w2'::uuid, '退出后回到自己家');
select assert_eq((select title from prescriptions), '自己家的方', '自己家的药方还在');
select assert_eq((select on_hand_grams from v_inventory where name_zh = '党参'), 60::numeric, '自己家的库存还在');

-- 两种都有数据：选病人 → 家庭药柜；诊所隐藏但不删
:as_u4;
select assert_eq(choose_account_kind('household'), :'w4home'::uuid, '两种都有：选「病人」用原来的家庭药柜');
select assert_eq((select title from prescriptions), '两种都有：家里的', '只看到家里的药方');
select assert_eq((select count(*) from patients), 0::bigint, '看不到诊所的病人');
select assert_eq(is_member(:'w4'), false, '诊所隐藏了');

-- 只登录过一次：选医生 → 要填诊所名称，新建诊所
:as_u5;
select assert_raises($$select choose_account_kind('clinic')$$, '请填写诊所名称', '没有诊所时要填名字');
select choose_account_kind('clinic', '新诊所');
select assert_eq((select workspace_name || ':' || workspace_kind from current_context()), '新诊所:clinic', '建了新诊所');

-- ---- 3. 都选完了：数据还是一条不少（只有当前药柜会变） ----
reset role;
do $$
declare r record; n bigint;
begin
  for r in select * from upgrade_check.row_counts where tbl not in ('workspaces', 'workspace_members', 'user_settings') loop
    execute format('select count(*) from public.%I', r.tbl) into n;
    if n <> r.n then raise exception 'FAIL: 选完类型后 % 从 % 行变成 % 行', r.tbl, r.n, n; end if;
  end loop;
end $$;
-- 成员关系：只少了 u2 主动退出 u1 药柜的那一条；u5 多了一个新诊所
select assert_eq((select count(*) from (select * from upgrade_check.members except select workspace_id, user_id, role from workspace_members) d),
  1::bigint, '只少了家人退出的那一条成员关系');
select assert_eq((select count(*) from upgrade_check.stock s
  where s.grams is distinct from (select sum(delta_grams) from inventory_txns t where t.workspace_id = s.workspace_id and t.herb_id = s.herb_id)),
  0::bigint, '库存一点没变');
