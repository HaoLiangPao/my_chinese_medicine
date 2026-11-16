-- 信息纠错（docs/design/0021-content-corrections.md）：复用 bug_reports，kind = content，指向一味药或一道题
\ir _helpers.sql

select id as mahuang from herbs where name_zh = '麻黄' \gset
select id as qid from quiz_questions order by id limit 1 \gset

:as_hao;
select ensure_default_workspace() as ws \gset

-- ---- 老的插入方式照常（线上旧代码不写新列）：默认是程序问题，新列都是空的 ----
insert into bug_reports (workspace_id, page_path, description, user_agent, viewport, recent_actions)
values (:'ws', '/prescriptions/new', '老代码的反馈', 'Mozilla/5.0', '390x844', '[{"t":"2026-11-15T01:00:00.000Z","kind":"nav","label":"/"}]')
returning id as old_bug \gset
select assert_eq((select row(kind, subject_type, subject_herb_id, subject_question_id, field, evidence)::text from bug_reports where id = :'old_bug'),
  '(bug,,,,,)', '老代码插入：kind 默认 bug，纠错的列都是空的');

-- ---- 药材纠错 ----
insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, evidence)
values ('content', 'herb', :'mahuang', 'properties', '/herbs/' || :'mahuang', '应该是辛、微苦，温', '《中国药典》2020 年版一部')
returning id as c1 \gset
select assert_eq((select row(reporter_id, status, workspace_id, recent_actions, recent_errors)::text from bug_reports where id = :'c1'),
  '(00000000-0000-0000-0000-00000000000a,new,,[],[])', '纠错：提交人是自己、状态新、不带药柜和诊断信息');
-- 题目纠错，依据可以不写
insert into bug_reports (kind, subject_type, subject_question_id, field, page_path, description)
values ('content', 'quiz_question', :'qid', 'answer', '/learn/quiz/practice', '答案应该是 B') returning id as c2 \gset

-- 对象和「哪一项」对得上
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
  values ('content', 'herb', %L, 'answer', '/', 'x')$$, :'mahuang'), 'bug_reports_kind_shape', '药材没有「答案」这一项');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_question_id, field, page_path, description)
  values ('content', 'quiz_question', %L, 'photo', '/', 'x')$$, :'qid'), 'bug_reports_kind_shape', '题目没有「照片」这一项');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, page_path, description)
  values ('content', 'herb', %L, '/', 'x')$$, :'mahuang'), 'bug_reports_kind_shape', '纠错要选哪一项');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, subject_question_id, field, page_path, description)
  values ('content', 'herb', %L, %L, 'other', '/', 'x')$$, :'mahuang', :'qid'), 'bug_reports_kind_shape', '不能同时指向药和题');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
  values ('content', 'formula', %L, 'other', '/', 'x')$$, :'mahuang'), 'row-level security', '对象类型只有药材和题目（策略先挡住）');
select assert_raises($$insert into bug_reports (kind, page_path, description) values ('typo', '/', 'x')$$, 'row-level security', '类型只有两种（策略先挡住）');
-- 程序问题不能带纠错的列
select assert_raises(format($$insert into bug_reports (subject_type, subject_herb_id, field, page_path, description)
  values ('herb', %L, 'name', '/', 'x')$$, :'mahuang'), 'bug_reports_kind_shape', '程序问题不能带对象');
select assert_raises($$insert into bug_reports (page_path, description, evidence) values ('/', 'x', '某书')$$, 'bug_reports_kind_shape', '程序问题不能带依据');
-- 纠错不带诊断信息（操作记录、前端错误、浏览器、药柜）：直接调 API 也塞不进去
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, recent_actions)
  values ('content', 'herb', %L, 'name', '/', 'x', '[{"t":"","kind":"nav","label":"/"}]')$$, :'mahuang'), 'bug_reports_kind_shape', '纠错不能带操作记录');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, recent_errors)
  values ('content', 'herb', %L, 'name', '/', 'x', '[{"message":"e"}]')$$, :'mahuang'), 'bug_reports_kind_shape', '纠错不能带前端错误');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, user_agent)
  values ('content', 'herb', %L, 'name', '/', 'x', 'Mozilla')$$, :'mahuang'), 'bug_reports_kind_shape', '纠错不能带浏览器');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, viewport)
  values ('content', 'herb', %L, 'name', '/', 'x', '390x844')$$, :'mahuang'), 'bug_reports_kind_shape', '纠错不能带屏幕大小');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, workspace_id)
  values ('content', 'herb', %L, 'name', '/', 'x', %L)$$, :'mahuang', :'ws'), 'bug_reports_kind_shape', '纠错不能带药柜');
-- 依据：可以不写；写了 1–200 字
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, evidence)
  values ('content', 'herb', %L, 'name', '/', 'x', '  ')$$, :'mahuang'), 'bug_reports_evidence', '依据不能只有空格');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, evidence)
  values ('content', 'herb', %L, 'name', '/', 'x', %L)$$, :'mahuang', repeat('书', 201)), 'bug_reports_evidence', '依据最多 200 字');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, evidence)
  values ('content', 'herb', %L, 'name', '/', 'x', %L)$$, :'mahuang', repeat(' ', 1000) || '书' || repeat(' ', 1000)),
  'bug_reports_evidence', '首尾补空格也不能超过 200 字');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, evidence)
  values ('content', 'herb', %L, 'name', '/', 'x', %L)$$, :'mahuang', E'\n\t '), 'bug_reports_evidence', '依据不能只有换行和制表符');
-- 描述（应该是什么）的约束照旧
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
  values ('content', 'herb', %L, 'name', '/', '  ')$$, :'mahuang'), 'bug_reports_description_check', '「应该是什么」不能是空的');

-- 只能给存在的药 / 题纠错；对象不能是空的
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
  values ('content', 'herb', %L, 'name', '/', 'x')$$, gen_random_uuid()), 'foreign key', '不存在的药');
select assert_raises($$insert into bug_reports (kind, subject_type, subject_question_id, field, page_path, description)
  values ('content', 'quiz_question', 'xx-999', 'stem', '/', 'x')$$, 'foreign key', '不存在的题');
select assert_raises($$insert into bug_reports (kind, subject_type, field, page_path, description)
  values ('content', 'herb', 'name', '/', 'x')$$, 'row-level security', '纠错必须指向一味药');
select assert_raises($$insert into bug_reports (kind, subject_type, field, page_path, description)
  values ('content', 'quiz_question', 'stem', '/', 'x')$$, 'row-level security', '纠错必须指向一道题');

-- 保留列照旧不能自己指定；提交后不能改（包括纠错的列）、不能删
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, status)
  values ('content', 'herb', %L, 'name', '/', 'x', 'fixed')$$, :'mahuang'), 'permission denied', '纠错也不能指定状态');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, reporter_id)
  values ('content', 'herb', %L, 'name', '/', 'x', '00000000-0000-0000-0000-00000000000c')$$, :'mahuang'), 'permission denied', '不能替别人纠错');
select assert_raises($$update bug_reports set field = 'name'$$, 'permission denied', '提交后不能改哪一项');
select assert_raises($$update bug_reports set kind = 'bug'$$, 'permission denied', '提交后不能改类型');
select assert_raises($$delete from bug_reports$$, 'permission denied', '不能删');
select assert_eq((select count(*) from bug_reports), 3::bigint, '被拒绝的都没存进去：老代码 1 条 + 纠错 2 条');
reset role;
select assert_eq((select count from bug_report_usage where user_id = '00000000-0000-0000-0000-00000000000a'), 3, '纠错和程序问题一起计数，被拒绝的不计');

-- ---- 只能读自己的 ----
:as_tina;
select assert_eq((select count(*) from bug_reports), 0::bigint, '读不到别人的纠错');
insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
values ('content', 'herb', :'mahuang', 'name', '/herbs/' || :'mahuang', 'tina 也觉得有问题');
select assert_eq((select count(*) from bug_reports), 1::bigint, '只看到自己这一条');
reset role;

-- ---- 每天 20 条：纠错和程序问题共用 ----
:as_hao;
insert into bug_reports (page_path, description) select '/', '第 ' || g || ' 条' from generate_series(4, 20) g;
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
  values ('content', 'herb', %L, 'name', '/', '第 21 条')$$, :'mahuang'), '今天的反馈次数已用完', '第 21 条纠错被拒绝');
reset role;

-- 不经过 RLS（管理员在 SQL Editor 里写，没有登录身份）时，check 约束也挡得住
set request.jwt.claim.sub = '';
select assert_raises($$insert into bug_reports (kind, page_path, description) values ('typo', '/', 'x')$$, 'bug_reports_kind', '约束：类型只有两种');
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
  values ('content', 'formula', %L, 'other', '/', 'x')$$, :'mahuang'), 'bug_reports_kind_shape', '约束：对象类型只有药材和题目');
select assert_raises($$insert into bug_reports (kind, subject_type, field, page_path, description) values ('content', null, 'other', '/', 'x')$$,
  'bug_reports_kind_shape', '约束：纠错要有对象类型');

-- ---- anon：照旧没有任何权限（包括新列）----
select assert_eq(has_any_column_privilege('anon', 'public.bug_reports', 'select, insert, update'), false, 'anon 没有任何列的权限');
select assert_eq(has_column_privilege('authenticated', 'public.bug_reports', 'kind', 'update'), false, '登录用户不能改类型');
select assert_eq(has_column_privilege('authenticated', 'public.bug_reports', 'status', 'insert'), false, '登录用户仍然不能写状态');
set role anon; set request.jwt.claim.sub = '';
select assert_raises(format($$insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
  values ('content', 'herb', %L, 'name', '/', 'x')$$, :'mahuang'), 'permission denied', '没登录不能纠错');
reset role;

-- ---- 管理员函数 ----
:as_hao;
select assert_raises('select * from admin_feedback_reports()', '没有权限', '非管理员调不了');
reset role;
set role anon; set request.jwt.claim.sub = '';
select assert_raises('select * from admin_feedback_reports()', 'permission denied', '没登录调不了');
reset role;
insert into platform_admins (user_id) values ('00000000-0000-0000-0000-00000000000c');
:as_tina;
select assert_eq(
  (select row(kind, subject_type, subject_id, subject_label, field, evidence, description)::text from admin_feedback_reports() where id = :'c1'),
  format('(content,herb,%s,麻黄,properties,"《中国药典》2020 年版一部",应该是辛、微苦，温)', :'mahuang'), '管理员看到药材纠错：药名、哪一项、依据、建议');
select assert_eq(
  (select row(kind, subject_type, subject_id, field, evidence)::text from admin_feedback_reports() where id = :'c2'),
  format('(content,quiz_question,%s,answer,)', :'qid'), '管理员看到题目纠错');
select assert_eq((select subject_label from admin_feedback_reports() where id = :'c2'), (select stem from quiz_questions where id = :'qid'), '题目显示题干');
select assert_eq((select row(kind, subject_type, subject_id, field)::text from admin_feedback_reports() where id = :'old_bug'), '(bug,,,)', '程序问题的新列是空的');
select assert_eq((select count(*) from admin_feedback_reports(null, 500)), 21::bigint, 'hao 20 条（老代码 1 + 纠错 2 + 17）+ tina 1 条');
select assert_eq((select count(*) from admin_feedback_reports() where kind = 'content'), 3::bigint, '纠错 3 条');
-- 改状态照旧；按状态筛选
select admin_set_bug_status(:'c1', 'fixed');
select assert_eq((select string_agg(id::text, ',') from admin_feedback_reports('fixed')), :'c1', '纠错改成「已改」（fixed），按状态筛选');
-- 旧的 admin_bug_reports（线上旧代码用）照常，也能看到纠错
select assert_eq((select count(*) from admin_bug_reports(null, 500)), 21::bigint, '旧函数照常');
reset role;

-- ---- 药材删了（比如合并重复的药）：纠错留着，外键变空，类型和哪一项还在 ----
insert into herbs (name_zh) values ('测试删掉的药') returning id as tmp_herb \gset
:as_tina;
insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description)
values ('content', 'herb', :'tmp_herb', 'pinyin', '/', '拼音不对') returning id as c3 \gset
reset role;
delete from herbs where id = :'tmp_herb';
select assert_eq((select row(kind, subject_type, subject_herb_id, field)::text from bug_reports where id = :'c3'), '(content,herb,,pinyin)',
  '药材删了，纠错还在，外键变空');
:as_tina;
select assert_eq((select row(subject_id, subject_label)::text from admin_feedback_reports() where id = :'c3'), '(,)', '看板上对象是空的（页面显示「已删除」）');
reset role;
