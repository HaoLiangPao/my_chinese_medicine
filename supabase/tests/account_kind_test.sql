-- 账号类型（docs/design/0008-account-types.md）
\ir _helpers.sql

-- ---- 还没选类型：current_context 不建药柜 ----
:as_hao;
select assert_eq((select account_kind from current_context()), null::text, '没选类型');
select assert_eq((select workspace_id from current_context()), null::uuid, '没选类型时没有药柜');
reset role;
select assert_eq((select count(*) from workspace_members where user_id = '00000000-0000-0000-0000-00000000000a'), 0::bigint, '没选类型时什么都不建');

-- ---- 选家庭 ----
:as_hao;
select assert_raises($$select choose_account_kind('shop')$$, '账号类型不对', '只有两种类型');
select choose_account_kind('household') as home \gset
select assert_eq((select account_kind || ':' || workspace_name || ':' || workspace_kind from current_context()), 'household:我们家:household', '家庭账号自动建「我们家」');
select assert_eq(choose_account_kind('household'), :'home'::uuid, '再选同一种：什么都不变');
select assert_raises($$select choose_account_kind('clinic', '偷偷开个诊所')$$, '已经选过了', '不能改成诊所');
select assert_raises($$select create_clinic('偷偷开个诊所')$$, '家庭账号不能开诊所', '家庭账号不能用旧函数开诊所');
reset role;
select assert_eq((select count(*) from workspaces where kind = 'clinic'), 0::bigint, '没有建出诊所');

-- ---- 选诊所 ----
:as_tina;
select assert_raises($$select choose_account_kind('clinic', '  ')$$, '请填写诊所名称', '诊所要名字');
select assert_raises(format('select choose_account_kind(%L, %L)', 'clinic', repeat('诊', 41)), '诊所名称太长', '名字太长');
select choose_account_kind('clinic', ' 李医生诊所 ') as clinic \gset
select assert_eq((select account_kind || ':' || workspace_name || ':' || workspace_kind from current_context()), 'clinic:李医生诊所:clinic', '诊所账号');
select assert_eq((select string_agg(kind, ',') from my_workspaces()), 'clinic', '诊所账号没有家庭药柜');
select assert_raises($$select create_clinic('第二个诊所')$$, '一个账号只有一个诊所', '医生账号不能用旧函数再开诊所');
reset role;
select assert_eq((select count(*) from workspace_members where user_id = '00000000-0000-0000-0000-00000000000c'), 1::bigint, '诊所账号只有一个药柜');

-- ---- 邀请只认同类型 ----
:as_hao;
select invite_member(:'home', 'tina@example.com');
:as_tina;
select assert_eq((select count(*) from my_invitations()), 0::bigint, '诊所账号看不到家庭药柜的邀请');
reset role;
select id as inv from invitations where email = 'tina@example.com' \gset
:as_tina;
select assert_raises(format('select accept_invitation(%L)', :'inv'), '不能加入另一种类型的药柜', '诊所账号不能加入家庭药柜');
select assert_eq((select count(*) from prescriptions), 0::bigint, '没加入就看不到');

-- 同类型可以：stranger 选家庭，接受 Hao 的邀请
:as_hao;
select invite_member(:'home', 'stranger@example.com');
:as_other;
select choose_account_kind('household') as other_home \gset
select accept_invitation((select id from my_invitations()));
select assert_eq((select workspace_id from current_context()), :'home'::uuid, '家庭账号可以加入别人的家庭药柜');
select assert_eq((select count(*) from workspaces where id = :'other_home'), 0::bigint, '自己空的药柜被清掉');

-- ---- 一个账号只有一个药柜：接受邀请 = 搬进对方的，自己原来的（有数据）隐藏；退出后回来 ----
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000f', 'mover@example.com');
\set as_mover 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-00000000000f'''
:as_mover;
select choose_account_kind('household') as mhome \gset
insert into prescriptions (workspace_id, title) values (:'mhome', '搬家前自己的方') returning id as mrx \gset
:as_hao;
select invite_member(:'home', 'mover@example.com');
:as_mover;
select accept_invitation((select id from my_invitations()));
select assert_eq((select workspace_id from current_context()), :'home'::uuid, '搬进了 Hao 的药柜');
select assert_eq((select count(*) from my_workspaces()), 1::bigint, '只列出一个药柜');
select assert_eq(is_member(:'mhome'), false, '自己原来的药柜隐藏了');
select assert_eq((select count(*) from prescriptions where id = :'mrx'), 0::bigint, '读不到自己原来的药方');
select assert_raises(format('select set_active_workspace(%L)', :'mhome'), '不能切换', '没有切换');
select set_active_workspace(:'home'); -- 设成当前的那个：什么都不变
select leave_workspace(:'home');
select assert_eq((select workspace_id from current_context()), :'mhome'::uuid, '退出以后回到自己原来的药柜');
select assert_eq((select title from prescriptions where id = :'mrx'), '搬家前自己的方', '原来的数据都在');
select assert_eq(is_member(:'home'), false, '退出后看不到 Hao 的药柜');

-- ---- 旧账号（null）：函数和原来一样；选了以后另一种隐藏、数据还在 ----
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000d', 'legacy@example.com');
\set as_legacy 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-00000000000d'''
:as_legacy;
select ensure_default_workspace() as lhome \gset
insert into prescriptions (workspace_id, title) values (:'lhome', '旧账号家里的方');
select create_clinic('旧诊所') as lclinic \gset
insert into prescriptions (workspace_id, title) values (:'lclinic', '旧诊所的处方') returning id as lrx \gset
select assert_eq((select count(*) from my_workspaces()), 2::bigint, '旧账号两种都看得到');
select assert_eq(ensure_default_workspace(), :'lclinic'::uuid, '旧账号 ensure 还是返回当前的诊所');
select set_active_workspace(:'lhome');
select set_active_workspace(:'lclinic');
select assert_eq((select account_kind from current_context()), null::text, '旧账号要去选类型');

select choose_account_kind('household') as chosen \gset
select assert_eq(:'chosen'::uuid, :'lhome'::uuid, '选家庭：用原来的家庭药柜（当前药柜从诊所换过来）');
select assert_eq((select string_agg(kind, ',') from my_workspaces()), 'household', '诊所隐藏了');
select assert_raises(format('select set_active_workspace(%L)', :'lclinic'), '不能切换到另一种类型', '切不回诊所');
-- 隐藏的药柜真的进不去：读不到、改不了、删不掉，也不能往里写
select assert_eq(is_member(:'lclinic'), false, '隐藏的诊所不算成员');
select assert_eq(is_member(:'lhome'), true, '自己类型的药柜还是成员');
select assert_eq((select count(*) from prescriptions where id = :'lrx'), 0::bigint, '读不到隐藏诊所的处方');
delete from prescriptions where id = :'lrx';
update prescriptions set title = '改了' where id = :'lrx';
select assert_raises(format('insert into prescriptions (workspace_id, title) values (%L, %L)', :'lclinic', 'x'), 'row-level security', '不能往隐藏的诊所写');
reset role;
select assert_eq((select count(*) from workspaces where id = :'lclinic'), 1::bigint, '诊所的数据没删');
select assert_eq((select title from prescriptions where id = :'lrx'), '旧诊所的处方', '隐藏诊所的处方没被删也没被改');
select assert_eq((select count(*) from prescriptions where workspace_id = :'lhome'), 1::bigint, '家里的药方还在');

-- 旧账号选诊所：已有诊所就不用填名字
insert into auth.users values ('00000000-0000-0000-0000-00000000000e', 'legacy2@example.com');
\set as_legacy2 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-00000000000e'''
:as_legacy2;
select ensure_default_workspace() as l2home \gset
select create_clinic('旧诊所二') as l2clinic \gset
select set_active_workspace(:'l2home');
select assert_eq(choose_account_kind('clinic'), :'l2clinic'::uuid, '选诊所：用原来的诊所，不用填名字');
select assert_eq((select workspace_name from current_context()), '旧诊所二', '当前是诊所');

-- ---- 权限 ----
reset role;
select assert_eq(has_function_privilege('anon', 'public.current_context()', 'execute'), false, 'anon 不能 current_context');
select assert_eq(has_function_privilege('anon', 'public.choose_account_kind(text, text)', 'execute'), false, 'anon 不能 choose_account_kind');
select assert_eq(has_function_privilege('authenticated', 'public.choose_account_kind(text, text)', 'execute'), true, '登录用户能选类型');
select assert_eq(has_function_privilege('authenticated', 'public.my_account_kind()', 'execute'), false, 'my_account_kind 只给函数内部用');
-- 不能直接改 user_settings（只有 select policy）
:as_hao;
update user_settings set account_kind = 'clinic' where user_id = auth.uid();
reset role;
select assert_eq((select account_kind from user_settings where user_id = '00000000-0000-0000-0000-00000000000a'), 'household', '不能直接改自己的类型');
