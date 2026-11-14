-- migration 20261114000027_learn_quiz 在「有数据的库」上的行为（docs/design/0020）
-- 只加两张新表 + 题库数据：已有的数据由 compare.sql 检查不变；这里检查新表和题库导进去了，旧账号能马上用
-- 不 \ir _helpers.sql：同一个库里别的升级测试可能已经插过它的测试用户。只建断言函数（和 _helpers.sql 里的一样）
\set ON_ERROR_STOP on
create or replace function public.assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % — expected %, got %', label, expected, actual;
  end if;
end $$;
grant execute on function public.assert_eq(anyelement, anyelement, text) to authenticated, anon;

-- 1. 题库导进去了（数量和每个主题的题数，详细的格式由单元测试 quiz-bank.test.ts 对 JSON 检查）
select assert_eq((select count(*) >= 100 from quiz_questions), true, '题库 >= 100 题');
select assert_eq((select count(distinct topics[1]) from quiz_questions), 10::bigint, '10 个主题都有');
select assert_eq((select count(*) from quiz_questions where status <> 'draft'), 0::bigint, '都是 draft');
select assert_eq((select count(*) from quiz_attempts), 0::bigint, '作答记录是空的');

-- 2. 已有的账号能马上答题，只看到自己的；没登录能读题
select u.id as old_user from auth.users u join workspace_members m on m.user_id = u.id order by m.created_at limit 1 \gset
select id as qid from quiz_questions order by id limit 1 \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'old_user', false);
insert into quiz_attempts (question_id, chosen, mode, daily_day)
values (:'qid', (select answer from quiz_questions where id = :'qid'), 'daily', (now() at time zone 'America/Toronto')::date);
select assert_eq((select correct from quiz_attempts where question_id = :'qid'), true, '老账号答题，对错由数据库算');
reset role;
set role anon; set request.jwt.claim.sub = '';
select assert_eq((select count(*) >= 100 from quiz_questions), true, '没登录也能读题');
reset role;
select assert_eq((select count(*) from quiz_attempts where user_id = :'old_user'), 1::bigint, '记在老账号名下');
