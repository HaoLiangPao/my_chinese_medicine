-- Bug 反馈（docs/design/0014-bug-reports.md）：只能插自己的、读自己的；不能改、不能删；每天 20 条
\ir _helpers.sql
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to anon;

:as_hao;
select ensure_default_workspace() as ws \gset
insert into bug_reports (workspace_id, page_path, description, user_agent, viewport, app_version, recent_actions, recent_errors)
values (:'ws', '/prescriptions/new', '保存按钮点了没反应', 'Mozilla/5.0', '390x844', 'abc123',
        '[{"t":"2026-11-10T01:00:00.000Z","kind":"nav","label":"/prescriptions/new"}]', '[]')
returning id as r1 \gset
select assert_eq((select reporter_id from bug_reports where id = :'r1'), '00000000-0000-0000-0000-00000000000a'::uuid, '提交人是自己');
select assert_eq((select status from bug_reports where id = :'r1'), 'new', '状态默认是新');
select assert_eq((select created_at > now() - interval '1 minute' from bug_reports where id = :'r1'), true, '时间是数据库填的');
-- 不带药柜也可以（还没选账号类型的用户）
insert into bug_reports (page_path, description) values ('/welcome', '选不了账号类型');

-- 状态、提交人、时间、id 不能自己指定
select assert_raises($$insert into bug_reports (page_path, description, status) values ('/', 'x', 'fixed')$$, 'permission denied', '不能指定状态');
select assert_raises($$insert into bug_reports (page_path, description, reporter_id) values ('/', 'x', '00000000-0000-0000-0000-00000000000c')$$, 'permission denied', '不能替别人提交');
select assert_raises($$insert into bug_reports (page_path, description, created_at) values ('/', 'x', '2020-01-01')$$, 'permission denied', '不能指定时间');
select assert_raises($$insert into bug_reports (id, page_path, description) values (gen_random_uuid(), '/', 'x')$$, 'permission denied', '不能指定 id');
-- 提交以后不能改（包括状态）、不能删
select assert_raises($$update bug_reports set status = 'fixed'$$, 'permission denied', '提交人不能改状态');
select assert_raises($$update bug_reports set description = '改一下'$$, 'permission denied', '提交以后不能改');
select assert_raises($$delete from bug_reports$$, 'permission denied', '不能删');
select assert_raises($$select count(*) from bug_report_usage$$, 'permission denied', '计数表不能直接读');
select assert_raises($$update bug_report_usage set count = 0$$, 'permission denied', '计数表不能直接改');
select assert_raises($$select bug_report_quota()$$, 'permission denied', '触发器函数不能直接调用');

-- 长度和条数
select assert_raises($$insert into bug_reports (page_path, description) values ('/', '   ')$$, 'bug_reports_description_check', '描述不能是空的');
select assert_raises(format('insert into bug_reports (page_path, description) values (%L, %L)', '/', repeat('字', 2001)), 'bug_reports_description_check', '描述最多 2000 字');
select assert_raises(format('insert into bug_reports (page_path, description) values (%L, %L)', '/' || repeat('a', 300), 'x'), 'bug_reports_page_path_check', '路径最多 300 字');
select assert_raises(format('insert into bug_reports (page_path, description, user_agent) values (%L, %L, %L)', '/', 'x', repeat('a', 301)), 'bug_reports_user_agent_check', 'UA 最多 300 字');
select assert_raises($$insert into bug_reports (page_path, description, viewport) values ('/', 'x', '很宽')$$, 'bug_reports_viewport_check', '视口是「宽x高」');
select assert_raises($$insert into bug_reports (page_path, description, recent_actions) values ('/', 'x', '{"a":1}')$$, 'bug_reports_actions_shape', '操作记录要是数组');
select assert_raises(format('insert into bug_reports (page_path, description, recent_actions) values (%L, %L, %L)', '/', 'x',
  (select jsonb_agg(jsonb_build_object('label', 'x')) from generate_series(1, 21))), 'bug_reports_actions_shape', '操作记录最多 20 条');
select assert_raises(format('insert into bug_reports (page_path, description, recent_actions) values (%L, %L, %L)', '/', 'x',
  jsonb_build_array(jsonb_build_object('label', repeat('x', 8000)))), 'bug_reports_actions_shape', '操作记录总长度有上限');
select assert_raises(format('insert into bug_reports (page_path, description, recent_errors) values (%L, %L, %L)', '/', 'x',
  (select jsonb_agg(jsonb_build_object('message', 'x')) from generate_series(1, 6))), 'bug_reports_errors_shape', '错误最多 5 条');
select assert_eq((select count(*) from bug_reports), 2::bigint, '被拒绝的都没存进去');
reset role;
select assert_eq((select count from bug_report_usage where user_id = '00000000-0000-0000-0000-00000000000a'), 2, '被拒绝的不计数');

-- 别人：读不到；不能往别人的药柜填。同一个药柜的成员也读不到
:as_tina;
select ensure_default_workspace() as ws2 \gset
select assert_eq((select count(*) from bug_reports), 0::bigint, '读不到别人的反馈');
select assert_raises(format('insert into bug_reports (workspace_id, page_path, description) values (%L, %L, %L)', :'ws', '/', 'x'), 'row-level security', '不能填别人的药柜');
reset role;
insert into workspace_members (workspace_id, user_id, role) values (:'ws', '00000000-0000-0000-0000-00000000000c', 'member');
:as_tina;
select assert_eq(is_member(:'ws'), true, 'tina 现在是 hao 药柜的成员');
select assert_eq((select count(*) from bug_reports), 0::bigint, '同一个药柜的成员也读不到别人的反馈');
insert into bug_reports (workspace_id, page_path, description) values (:'ws', '/', '成员可以带上这个药柜');
select assert_eq((select count(*) from bug_reports), 1::bigint, '只看到自己这一条');
reset role;

-- 每天 20 条：第 21 条被拒绝、不计数；每人单独算；第二天重新算
:as_hao;
insert into bug_reports (page_path, description) select '/', '第 ' || g || ' 条' from generate_series(3, 20) g;
select assert_raises($$insert into bug_reports (page_path, description) values ('/', '第 21 条')$$, '今天的反馈次数已用完', '第 21 条被拒绝');
select assert_raises($$insert into bug_reports (page_path, description) values ('/', '再试一次')$$, '今天的反馈次数已用完', '超限后仍然拒绝');
select assert_eq((select count(*) from bug_reports), 20::bigint, 'hao 一共 20 条');
:as_tina;
insert into bug_reports (page_path, description) values ('/', 'tina 不受 hao 的次数影响');
reset role;
select assert_eq((select count from bug_report_usage where user_id = '00000000-0000-0000-0000-00000000000a'), 20, '超限的那几次不计数');
update bug_report_usage set day = day - 1 where user_id = '00000000-0000-0000-0000-00000000000a';
:as_hao;
insert into bug_reports (page_path, description) values ('/', '第二天又可以了');
reset role;

-- 管理员（没有登录身份）可以改状态；状态只有四种
update bug_reports set status = 'in_progress' where id = :'r1';
select assert_raises(format('update bug_reports set status = %L where id = %L', 'done', :'r1'), 'bug_reports_status_check', '状态只有四种');
:as_hao;
select assert_eq((select status from bug_reports where id = :'r1'), 'in_progress', '提交人能看到状态变了');
reset role;

-- 账号、药柜删掉以后报告还在（提交人、药柜变空）
select count(*) as before_del from bug_reports \gset
delete from workspaces where id = :'ws2';
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
select assert_eq((select count(*) from bug_reports), :'before_del'::bigint, '删账号不删报告');
select assert_eq((select count(*) from bug_reports where reporter_id is null), 2::bigint, 'tina 的两条提交人变空');

-- anon 没有任何权限
select assert_eq(has_table_privilege('anon', 'public.bug_reports', 'select, insert, update, delete, truncate'), false, 'anon 对 bug_reports 没有任何权限');
select assert_eq(has_table_privilege('anon', 'public.bug_report_usage', 'select, insert, update, delete, truncate'), false, 'anon 对计数表没有任何权限');
select assert_eq(has_any_column_privilege('anon', 'public.bug_reports', 'select, insert, update'), false, 'anon 没有任何列的权限');
select assert_eq(has_table_privilege('authenticated', 'public.bug_reports', 'update, delete, truncate'), false, 'authenticated 不能改、不能删');
select assert_eq(has_any_column_privilege('authenticated', 'public.bug_reports', 'update'), false, 'authenticated 没有任何列的 update');
select assert_eq(has_function_privilege('anon', 'public.bug_report_quota()', 'execute'), false, 'anon 不能调触发器函数');
set role anon; set request.jwt.claim.sub = '';
select assert_raises($$select count(*) from bug_reports$$, 'permission denied', 'anon 读不到');
select assert_raises($$insert into bug_reports (page_path, description) values ('/', 'x')$$, 'permission denied', 'anon 不能提交');
reset role;
