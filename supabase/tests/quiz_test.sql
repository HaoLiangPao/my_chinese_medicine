-- 学堂题库和作答记录（docs/design/0020 §5）
\ir _helpers.sql
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to anon;

-- 测试用的两道题（真实题库由 migration 导入，这里只用它来检查数量）
insert into quiz_questions (id, kind, stem, options, answer, explanation, source, topics, difficulty)
values ('test-001', 'single', '测试题：五行中木生什么？', array['火', '土', '金', '水'], 0, '木生火，火生土。', '测试', array['wuxing'], 1),
       ('test-002', 'judge', '测试题：背为阳，腹为阴。', array['对', '错'], 0, '背为阳，腹为阴。', '测试', array['yinyang'], 1);
select (now() at time zone 'America/Toronto')::date as today \gset

-- ---- 导入的题库 ----
select assert_eq((select count(*) >= 100 from quiz_questions where id not like 'test-%'), true, '导入了 100 道以上');
select assert_eq((select count(*) from quiz_questions where id not like 'test-%' and status <> 'draft'), 0::bigint, '导入的题都是 draft');
select assert_eq((select bool_and(n between 8 and 15) from (
  select t, count(*) n from quiz_questions, unnest(topics[1:1]) t where id not like 'test-%' group by t) x), true, '每个主题 8–15 题（按主主题）');
select assert_eq((select count(distinct topics[1]) from quiz_questions where id not like 'test-%'), 10::bigint, '10 个主题都有');

-- ---- 题库：谁都能读，谁都不能写 ----
set role anon; set request.jwt.claim.sub = '';
select assert_eq((select answer from quiz_questions where id = 'test-001'), 0::smallint, '没登录也能读题');
select assert_raises($$update quiz_questions set answer = 1 where id = 'test-001'$$, 'permission denied', '没登录不能改题');
select assert_raises($$insert into quiz_questions (id, kind, stem, options, answer, explanation, source, topics, difficulty)
  values ('test-009', 'judge', '随便写的题目', array['对', '错'], 0, '随便写的', '无', array['wuxing'], 1)$$, 'permission denied', '没登录不能加题');
select assert_raises($$delete from quiz_questions where id = 'test-001'$$, 'permission denied', '没登录不能删题');
reset role;
:as_hao;
select assert_eq((select stem from quiz_questions where id = 'test-002'), '测试题：背为阳，腹为阴。', '登录用户能读题');
select assert_raises($$update quiz_questions set answer = 1 where id = 'test-001'$$, 'permission denied', '登录用户不能改题');
select assert_raises($$delete from quiz_questions where id = 'test-001'$$, 'permission denied', '登录用户不能删题');
select assert_raises($$insert into quiz_questions (id, kind, stem, options, answer, explanation, source, topics, difficulty)
  values ('test-009', 'judge', '随便写的题目', array['对', '错'], 0, '随便写的', '无', array['wuxing'], 1)$$, 'permission denied', '登录用户不能加题');
reset role;

-- ---- 作答：没登录不能读写 ----
set role anon; set request.jwt.claim.sub = '';
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode) values ('test-001', 0, 'practice')$$, 'permission denied', '没登录不能记作答');
select assert_raises($$select count(*) from quiz_attempts$$, 'permission denied', '没登录不能读作答');
reset role;

-- ---- 作答：对错由数据库算 ----
:as_hao;
insert into quiz_attempts (question_id, chosen, mode) values ('test-001', 0, 'practice'), ('test-001', 2, 'review');
select assert_eq((select array_agg(correct order by chosen) from quiz_attempts), array[true, false], '答案对 → true，错 → false');
select assert_eq((select count(*) from quiz_attempts where user_id = '00000000-0000-0000-0000-00000000000a'), 2::bigint, 'user_id 自动是自己');
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode, correct) values ('test-001', 3, 'practice', true)$$,
  'permission denied', '不能自己填 correct');
select assert_raises($$insert into quiz_attempts (user_id, question_id, chosen, mode) values ('00000000-0000-0000-0000-00000000000b', 'test-001', 0, 'practice')$$,
  'permission denied', '不能替别人记');
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode, answered_at) values ('test-001', 0, 'practice', '2020-01-01')$$,
  'permission denied', '不能改作答时间');
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode) values ('test-001', 4, 'practice')$$, '没有这个选项', '选项下标越界');
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode) values ('test-001', -1, 'practice')$$, '没有这个选项', '选项下标为负');
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode) values ('nope-001', 0, 'practice')$$, '没有这道题', '没有的题');
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode) values ('test-001', 0, 'exam')$$, 'check', '模式只能是三种');
select assert_raises(format('update quiz_attempts set correct = true'), 'permission denied', '不能改作答');
select assert_raises(format('delete from quiz_attempts'), 'permission denied', '不能删作答');

-- ---- 每日一题：每天一次、只能记今天 ----
insert into quiz_attempts (question_id, chosen, mode, daily_day) values ('test-002', 1, 'daily', :'today');
select assert_eq((select correct from quiz_attempts where mode = 'daily'), false, '每日一题答错也记下');
select assert_raises(format($q$insert into quiz_attempts (question_id, chosen, mode, daily_day) values ('test-002', 0, 'daily', %L)$q$, :'today'),
  'quiz_attempts_one_daily', '每日一题一天只能记一次');
select assert_raises(format($q$insert into quiz_attempts (question_id, chosen, mode, daily_day) values ('test-002', 0, 'daily', %L)$q$, (:'today'::date - 1)),
  'row-level security', '不能补昨天的打卡');
select assert_raises(format($q$insert into quiz_attempts (question_id, chosen, mode, daily_day) values ('test-002', 0, 'daily', %L)$q$, (:'today'::date + 1)),
  'row-level security', '不能提前打明天的卡');
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode) values ('test-002', 0, 'daily')$$, 'qa_daily', '每日一题要有日期');
select assert_raises(format($q$insert into quiz_attempts (question_id, chosen, mode, daily_day) values ('test-002', 0, 'practice', %L)$q$, :'today'),
  'qa_daily', '练习不能带日期');
reset role;

-- ---- 只能读自己的 ----
:as_other;
select assert_eq((select count(*) from quiz_attempts), 0::bigint, '别人读不到我的作答');
insert into quiz_attempts (question_id, chosen, mode, daily_day) values ('test-002', 0, 'daily', :'today');  -- 别人当天也能打卡
select assert_eq((select count(*) from quiz_attempts), 1::bigint, '只看到自己的');
reset role;
:as_hao;
select assert_eq((select count(*) from quiz_attempts), 3::bigint, '我只看到自己的 3 条');
reset role;

-- ---- 下架的题不能再答（以前的记录还在）----
update quiz_questions set status = 'retired' where id = 'test-001';
:as_hao;
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode) values ('test-001', 0, 'practice')$$, '没有这道题', '下架的题不能答');
select assert_eq((select count(*) from quiz_attempts where question_id = 'test-001'), 2::bigint, '下架以后旧记录还在');
reset role;

-- ---- 防刷：24 小时最多 500 次 ----
insert into quiz_attempts (user_id, question_id, chosen, mode)
select '00000000-0000-0000-0000-00000000000c', 'test-002', 0, 'practice' from generate_series(1, 500);
:as_tina;
select assert_raises($$insert into quiz_attempts (question_id, chosen, mode) values ('test-002', 0, 'practice')$$, '答题次数太多', '超过 500 次');
reset role;
update quiz_attempts set answered_at = now() - interval '25 hours' where user_id = '00000000-0000-0000-0000-00000000000c';
:as_tina;
insert into quiz_attempts (question_id, chosen, mode) values ('test-002', 0, 'practice');
select assert_eq((select count(*) from quiz_attempts), 501::bigint, '24 小时以前的不算');
reset role;

-- ---- 题库的约束 ----
create function pg_temp.try_q(p_kind text, p_options text[], p_answer int, p_topics text[], p_status text default 'draft', p_by text default null)
returns void language sql as $$
  insert into quiz_questions (id, kind, stem, options, answer, explanation, source, topics, difficulty, status, reviewed_by, reviewed_at)
  values ('test-100', p_kind, '测试题目题干', p_options, p_answer, '解析解析', '出处', p_topics, 1, p_status, p_by,
          case when p_by is null then null else date '2026-11-14' end);
$$;
select assert_raises($$select pg_temp.try_q('single', array['甲', '乙'], 2, array['wuxing'])$$, 'qq_answer', '答案要在选项里');
select assert_raises($$select pg_temp.try_q('single', array['甲'], 0, array['wuxing'])$$, 'qq_options', '至少两个选项');
select assert_raises($$select pg_temp.try_q('single', array['甲', ''], 0, array['wuxing'])$$, 'qq_options', '选项不能是空的');
select assert_raises($$select pg_temp.try_q('judge', array['是', '否'], 0, array['wuxing'])$$, 'qq_judge', '判断题的选项是对 / 错');
select assert_raises($$select pg_temp.try_q('single', array['甲', '乙'], 0, array['zhenjiu'])$$, 'qq_topics', '主题要在列表里');
select assert_raises($$select pg_temp.try_q('single', array['甲', '乙'], 0, array[]::text[])$$, 'qq_topics', '至少一个主题');
select assert_raises($$select pg_temp.try_q('single', array['甲', '乙'], 0, array['wuxing'], 'reviewed')$$, 'qq_reviewed', '审核过的要有审核人');
select assert_raises($$select pg_temp.try_q('single', array['甲', '乙'], 0, array['wuxing'], 'published')$$, 'qq_status', '状态只能是三种');
select pg_temp.try_q('single', array['甲', '乙'], 1, array['wuxing', 'zangfu'], 'reviewed', '李医生');
select assert_eq((select reviewed_by from quiz_questions where id = 'test-100'), '李医生', '合法的题能放');

-- ---- 删账号时作答一起删 ----
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select assert_eq((select count(*) from quiz_attempts where user_id = '00000000-0000-0000-0000-00000000000a'), 0::bigint, '删账号，作答一起删');
