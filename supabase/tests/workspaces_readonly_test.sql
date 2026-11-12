-- 药柜（workspaces）不能由客户端直接修改（docs/design/0016-workspaces-read-only.md）
\ir _helpers.sql
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to anon;

-- Hao（owner）的家庭药柜里有一张药方；stranger 接受邀请成为成员；Tina 是另一个诊所的医生（不是成员）
:as_hao;
select choose_account_kind('household') as home \gset
insert into prescriptions (workspace_id, title) values (:'home', '补气方');
select invite_member(:'home', 'stranger@example.com');
:as_other;
select choose_account_kind('household');
select accept_invitation((select id from my_invitations()));
select assert_eq((select role from workspace_members where workspace_id = :'home' and user_id = auth.uid()), 'member', 'stranger 是普通成员');
:as_tina;
select choose_account_kind('clinic', '李医生诊所') as clinic \gset

-- ---- 两层保护都在：没有 UPDATE 策略，也没有 UPDATE 权限（表级、列级都没有）----
reset role;
select assert_eq((select count(*) from pg_policies where schemaname = 'public' and tablename = 'workspaces' and cmd in ('UPDATE', 'ALL')),
  0::bigint, 'workspaces 上没有 UPDATE 策略');
select assert_eq(has_table_privilege(r, 'public.workspaces', 'update'), false, r || ' 没有 workspaces 的 UPDATE 权限')
from unnest(array['anon', 'authenticated']) r;
select assert_eq(has_column_privilege(r, 'public.workspaces', c, 'update'), false, r || ' 不能改 workspaces.' || c)
from unnest(array['anon', 'authenticated']) r, unnest(array['id', 'name', 'kind', 'created_at']) c;
select assert_eq(has_table_privilege('authenticated', 'public.workspaces', 'select'), true, '读的权限还在');

-- ---- 普通成员：改 kind、改 name 都被拒 ----
:as_other;
select assert_raises(format('update workspaces set kind = %L where id = %L', 'clinic', :'home'), 'permission denied', '成员不能改 kind');
select assert_raises(format('update workspaces set name = %L where id = %L', '被成员改名', :'home'), 'permission denied', '成员（非 owner）不能改 name');
select assert_raises(format('update workspaces set name = %L, kind = %L where id = %L', '被成员改名', 'clinic', :'home'), 'permission denied', '成员不能同时改 name 和 kind');

-- ---- owner 也不能直接改（App 没有改名功能；以后要做就加函数）----
:as_hao;
select assert_raises(format('update workspaces set kind = %L where id = %L', 'clinic', :'home'), 'permission denied', 'owner 不能改 kind');
select assert_raises(format('update workspaces set name = %L where id = %L', '新名字', :'home'), 'permission denied', 'owner 不能直接改 name');

-- ---- 不是成员、没登录：一样被拒 ----
:as_tina;
select assert_raises(format('update workspaces set name = %L where id = %L', '被外人改名', :'home'), 'permission denied', '别的药柜的人不能改');
select assert_raises(format('update workspaces set kind = %L where id = %L', 'household', :'clinic'), 'permission denied', '医生不能把自己的诊所改成家庭');
set role anon; set request.jwt.claim.sub = '';
select assert_raises(format('update workspaces set name = %L where id = %L', '匿名改名', :'home'), 'permission denied', 'anon 不能改');

-- ---- 数据没变，大家照常读得到 ----
reset role;
select assert_eq((select name || ':' || kind from workspaces where id = :'home'), '我们家:household', '家庭药柜的名字和类型没变');
select assert_eq((select name || ':' || kind from workspaces where id = :'clinic'), '李医生诊所:clinic', '诊所的名字和类型没变');
:as_hao;
select assert_eq(is_member(:'home'), true, 'owner 还是成员');
select assert_eq((select count(*) from prescriptions), 1::bigint, 'owner 读得到药方');
select assert_eq((select name from workspaces where id = :'home'), '我们家', 'owner 读得到药柜名（微信消息里的诊所名同一条查询）');
:as_other;
select assert_eq((select count(*) from prescriptions), 1::bigint, '成员读得到药方');

-- ---- 函数里的写入不受影响：建药柜、清理空药柜 ----
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000e', 'new@example.com');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select choose_account_kind('household') as new_home \gset
select assert_eq((select name || ':' || kind from workspaces where id = :'new_home'), '我们家:household', '新账号照常建药柜');
:as_hao;
select invite_member(:'home', 'new@example.com');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select accept_invitation((select id from my_invitations()));
reset role;
select assert_eq((select count(*) from workspaces where id = :'new_home'), 0::bigint, '接受邀请后空药柜照常被清掉');
