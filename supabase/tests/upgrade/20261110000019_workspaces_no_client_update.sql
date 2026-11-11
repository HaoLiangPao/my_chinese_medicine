-- migration 20261110000019_workspaces_no_client_update 在「有数据的库」上的行为（docs/design/0016）
-- 已有的药柜一行不改（compare.sql 检查行数和成员关系）；这里检查：成员改不了，旧代码用到的读和函数照常
\ir ../_helpers.sql

select id as w1 from workspaces w
 where exists (select 1 from workspace_members m where m.workspace_id = w.id and m.user_id = '00000000-0000-0000-0000-0000000000a1' and m.role = 'owner')
   and exists (select 1 from workspace_members m where m.workspace_id = w.id and m.user_id = '00000000-0000-0000-0000-0000000000a2') \gset
select name || ':' || kind as w1_before from workspaces where id = :'w1' \gset

-- u2 是 u1 药柜的普通成员（接受邀请加入的）
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select assert_eq((select role from workspace_members where workspace_id = :'w1' and user_id = auth.uid()), 'member', 'u2 是普通成员');
select assert_raises(format('update workspaces set kind = %L where id = %L', 'clinic', :'w1'), 'permission denied', '成员不能改 kind');
select assert_raises(format('update workspaces set name = %L where id = %L', '被成员改名', :'w1'), 'permission denied', '成员不能改 name');
-- 旧代码照常：读药柜名、列出药柜、读药方
select assert_eq((select name || ':' || kind from workspaces where id = :'w1'), :'w1_before', '药柜没变，成员读得到');
select assert_eq((select count(*) > 0 from my_workspaces()), true, 'my_workspaces 照常');
select assert_eq((select count(*) > 0 from prescriptions where workspace_id = :'w1'), true, '成员读得到药方');
reset role;

-- 医生：诊所名（微信消息用）读得到，改不了
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select assert_eq((select count(*) from workspaces where name = '李医生诊所' and kind = 'clinic'), 1::bigint, '医生读得到诊所');
select assert_raises($$update workspaces set kind = 'household' where name = '李医生诊所'$$, 'permission denied', '医生不能改诊所的 kind');
reset role;
