-- 安全审查修复：邀请必须对方接受、当前 workspace、退出/移除、识别次数、目录写权限
\ir _helpers.sql
insert into auth.users values ('00000000-0000-0000-0000-00000000000d', 'mallory@example.com');
\set as_mallory 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-00000000000d'''

:as_hao;    select ensure_default_workspace() as ws_hao \gset
:as_tina;   select ensure_default_workspace() as ws_tina \gset
:as_mallory; select ensure_default_workspace() as ws_mal \gset

-- ---- S1：陌生人「邀请」不会把人拉进去 ----
select invite_member(:'ws_mal', 'tina@example.com');
:as_tina;
select assert_eq(ensure_default_workspace(), :'ws_tina'::uuid, '被邀请但没接受：Tina 还在自己的药柜');
select assert_eq((select count(*) from my_invitations()), 1::bigint, 'Tina 看到一条邀请');
select assert_eq((select invited_by_email from my_invitations()), 'mallory@example.com', '能看到是谁邀请的');
insert into prescriptions (workspace_id, title) values (:'ws_tina', 'Tina 的私人药方');
:as_mallory;
select assert_eq((select count(*) from prescriptions), 0::bigint, 'Mallory 看不到 Tina 的药方');
:as_tina;
select decline_invitation((select id from my_invitations()));
select assert_eq((select count(*) from my_invitations()), 0::bigint, '拒绝后没有待处理邀请');
reset role;
select assert_eq((select status from invitations where workspace_id = :'ws_mal'), 'declined', '状态 declined');

-- 不泄露邮箱是否注册；格式/自己/重复
:as_hao;
select invite_member(:'ws_hao', 'nobody-registered@example.com');   -- 不报错
select assert_raises(format('select invite_member(%L, %L)', :'ws_hao', 'hao@example.com'), '不能邀请自己', '邀请自己');
select assert_raises(format('select invite_member(%L, %L)', :'ws_hao', 'not-an-email'), '邮箱格式不对', '邮箱格式');
select invite_member(:'ws_hao', 'TINA@Example.com ');
select invite_member(:'ws_hao', 'tina@example.com');
select assert_eq((select count(*) from invitations where workspace_id = :'ws_hao' and email = 'tina@example.com' and status = 'pending'), 1::bigint, '重复邀请只有一条，邮箱统一小写');
select assert_raises(format('select invite_member(%L, %L)', :'ws_tina', 'x@example.com'), '只有 owner', '不能用别人的药柜发邀请');

-- 别人不能接受不是发给自己的邀请
:as_mallory;
select assert_raises(format('select accept_invitation(%L)', (select id from invitations where email = 'tina@example.com' and status = 'pending')),
  '邀请不存在或已失效', 'Mallory 接受 Tina 的邀请');
select assert_eq((select count(*) from invitations), 1::bigint, 'Mallory 只看到自己药柜发出的邀请');

-- 直接写表绕过函数：不行
select assert_raises(format('insert into invitations (workspace_id, email) values (%L, %L)', :'ws_hao', 'mallory@example.com'), 'row-level security', '直接插入邀请');
select assert_raises(format('insert into workspace_members (workspace_id, user_id) values (%L, %L)', :'ws_hao', '00000000-0000-0000-0000-00000000000d'), 'row-level security', '直接把自己加进别人家');

-- ---- 接受：Tina 已经有数据，旧药柜保留；当前 workspace 切到 Hao 家 ----
:as_tina;
select accept_invitation((select id from my_invitations())) as joined \gset
select assert_eq(:'joined'::uuid, :'ws_hao'::uuid, 'accept 返回加入的药柜');
select assert_eq(ensure_default_workspace(), :'ws_hao'::uuid, '接受后当前 = Hao 家');
select assert_eq((select count(*) from my_workspaces()), 2::bigint, 'Tina 同时在两个药柜');
select assert_eq((select workspace_id from my_workspaces() where is_active), :'ws_hao'::uuid, 'is_active 标对了');
select assert_eq((select count(*) from workspaces where id = :'ws_tina'), 1::bigint, '有数据的旧药柜不删');
select assert_raises(format('select accept_invitation(%L)', (select id from invitations where workspace_id = :'ws_hao' and email = 'tina@example.com')),
  '邀请不存在或已失效', '同一个邀请不能接受两次');

-- C1：两个药柜都能读到（RLS 允许），App 必须按当前 workspace 过滤 —— 这里确认确实读到两份
select assert_eq((select count(distinct workspace_id) from prescriptions), 1::bigint, 'Hao 家还没有药方');
:as_hao;
insert into prescriptions (workspace_id, title) values (:'ws_hao', 'Hao 家的药方');
:as_tina;
select assert_eq((select count(distinct workspace_id) from prescriptions), 2::bigint, '多成员身份：RLS 返回两个药柜的数据');
select assert_eq((select count(*) from prescriptions where workspace_id = ensure_default_workspace()), 1::bigint, '按当前 workspace 过滤后只有 Hao 家的');

-- 切换当前 workspace
select set_active_workspace(:'ws_tina');
select assert_eq(ensure_default_workspace(), :'ws_tina'::uuid, '切回自己的药柜');
select assert_raises(format('select set_active_workspace(%L)', :'ws_mal'), '不是这个药柜的成员', '不能切到别人的药柜');
select set_active_workspace(:'ws_hao');
-- user_settings 不能直接改
update user_settings set active_workspace_id = :'ws_mal';
select assert_eq((select active_workspace_id from user_settings), :'ws_hao'::uuid, '直接 update user_settings 无效');

-- 成员列表：成员能看到邮箱，外人看不到
select assert_eq((select string_agg(email || ':' || role, ',' order by joined_at) from list_members(:'ws_hao')), 'hao@example.com:owner,tina@example.com:member', '成员列表');
:as_mallory;
select assert_eq((select count(*) from list_members(:'ws_hao')), 0::bigint, '外人看不到成员');

-- ---- 退出 / 移除 ----
:as_hao;
select assert_raises(format('select leave_workspace(%L)', :'ws_hao'), 'owner 不能退出', 'owner 不能退出');
select assert_raises(format('select remove_member(%L, %L)', :'ws_hao', '00000000-0000-0000-0000-00000000000a'), '不能移除自己', '移除自己');
:as_tina;
select assert_raises(format('select remove_member(%L, %L)', :'ws_hao', '00000000-0000-0000-0000-00000000000a'), '只有 owner', 'member 移除 owner');
select leave_workspace(:'ws_hao');
select assert_eq((select count(*) from prescriptions where workspace_id = :'ws_hao'), 0::bigint, '退出后看不到 Hao 家');
select assert_eq(ensure_default_workspace(), :'ws_tina'::uuid, '退出后回到自己的药柜');

-- 再邀请、接受、被 owner 移除
:as_hao;
select invite_member(:'ws_hao', 'tina@example.com');
:as_tina;
select accept_invitation((select id from my_invitations()));
:as_hao;
select remove_member(:'ws_hao', '00000000-0000-0000-0000-00000000000c');
:as_tina;
select assert_eq((select count(*) from prescriptions where workspace_id = :'ws_hao'), 0::bigint, '被移除后看不到');
select assert_eq(ensure_default_workspace(), :'ws_tina'::uuid, '被移除后回到自己的药柜');

-- 撤销邀请
:as_hao;
select invite_member(:'ws_hao', 'tina@example.com');
select revoke_invitation((select id from invitations where workspace_id = :'ws_hao' and status = 'pending' and email = 'tina@example.com'));
:as_tina;
select assert_eq((select count(*) from my_invitations()), 0::bigint, '撤销后对方看不到');

-- 空的旧药柜在接受时会被清掉（新用户场景）
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000e', 'newbie@example.com');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select ensure_default_workspace() as ws_new \gset
:as_hao;
select invite_member(:'ws_hao', 'newbie@example.com');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select accept_invitation((select id from my_invitations()));
reset role;
select assert_eq((select count(*) from workspaces where id = :'ws_new'), 0::bigint, '空的旧药柜被清掉');

-- ---- S3：识别次数 ----
:as_hao;
select assert_eq(consume_parse_quota(2), true, '第 1 次');
select assert_eq(consume_parse_quota(2), true, '第 2 次');
select assert_eq(consume_parse_quota(2), false, '第 3 次超限');
select assert_eq(consume_parse_quota(2), false, '超限后仍然拒绝');
select assert_eq((select count(*) from parse_usage), 0::bigint, 'parse_usage 不能直接读');
:as_tina;
select assert_eq(consume_parse_quota(2), true, '每人单独计数');
reset role;
select assert_eq((select count from parse_usage where user_id = '00000000-0000-0000-0000-00000000000a'), 2, '超限的那几次不计数');

-- ---- S2：共享目录的写权限 ----
:as_mallory;
select assert_raises($$insert into herb_aliases (alias, herb_id) values ('北芪2', (select id from herbs where name_zh = '附子'))$$, 'permission denied', '不能加别名');
select assert_raises($$insert into herbs (name_zh, category, notes) values ('假药', '补气药', 'x')$$, 'permission denied', '新药材只能写名字');
insert into herbs (name_zh) values ('鸡血藤');
select assert_eq(match_herb('鸡血藤') is not null, true, '只写名字可以');
select assert_raises($$delete from herbs where name_zh = '鸡血藤'$$, 'permission denied', '不能删药材');
select assert_raises('select current_email()', 'permission denied', '内部函数 current_email 不对外');

\echo 'invitations_test: PASSED'
