-- migration 20261115000028_content_corrections 在「有数据的库」上的行为（docs/design/0021）
-- 只给 bug_reports 加列（带默认值）、约束、一条限制性策略、一个新函数。行数由 compare.sql 检查；这里检查：
-- 已有的反馈都变成 bug、内容一个字不变；线上旧代码的插入方式和旧看板函数照常；新的纠错能插、新函数能看到旧数据
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

-- 1. 已有的反馈（fixture.sql 造的两条）：都是程序问题，纠错的列是空的，原来的内容和状态不变
select assert_eq((select count(*) from bug_reports where description like '升级前的反馈%'), 2::bigint, 'fixture 的两条反馈都在');
select assert_eq((select count(*) from bug_reports where kind <> 'bug'), 0::bigint, '已有的反馈都是 bug');
select assert_eq(
  (select count(*) from bug_reports
   where subject_type is not null or subject_herb_id is not null or subject_question_id is not null or field is not null or evidence is not null),
  0::bigint, '已有的反馈纠错的列都是空的');
select assert_eq(
  (select row(page_path, user_agent, viewport, app_version, jsonb_array_length(recent_actions), jsonb_array_length(recent_errors), status)::text
   from bug_reports where description = '升级前的反馈：保存没反应'),
  '(/prescriptions/new,Mozilla/5.0,390x844,abc123,1,1,new)', '带操作记录的那条：内容一个字不变');
select assert_eq((select status from bug_reports where description = '升级前的反馈：麻黄的归经好像不对'), 'in_progress', '改过的状态不变');

-- 2. 线上旧代码（部署前）：插入时不写新列，照常；旧看板函数照常
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into bug_reports (workspace_id, page_path, description, user_agent, viewport, app_version, recent_actions, recent_errors)
select active_workspace_id, '/', '旧代码在升级后提交', 'Mozilla/5.0', '1280x800', null,
       '[{"t":"2026-11-15T01:00:00.000Z","kind":"click","label":"保存处方"}]', '[]'
from user_settings where user_id = '00000000-0000-0000-0000-0000000000a2';
select assert_eq((select kind from bug_reports where description = '旧代码在升级后提交'), 'bug', '旧代码插入的是 bug');
-- 3. 新代码：纠错（不带药柜和诊断信息）
insert into bug_reports (kind, subject_type, subject_herb_id, field, page_path, description, evidence)
select 'content', 'herb', id, 'properties', '/herbs/' || id, '归经应该是肺、膀胱经', '《中国药典》' from herbs where name_zh = '麻黄';
select assert_eq((select count(*) from bug_reports where kind = 'content'), 1::bigint, '新代码能提交纠错');
reset role;

insert into platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a5') on conflict do nothing;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select assert_eq((select count(*) from admin_bug_reports(null, 500)), (select count(*) from admin_feedback_reports(null, 500)),
  '旧函数和新函数看到的条数一样');
select assert_eq(
  (select string_agg(kind || ':' || coalesce(subject_label, '-') || ':' || coalesce(field, '-'), ',' order by kind)
   from admin_feedback_reports(null, 500) where description in ('升级前的反馈：保存没反应', '归经应该是肺、膀胱经')),
  'bug:-:-,content:麻黄:properties', '新函数：旧反馈是 bug，纠错带药名和哪一项');
reset role;
-- 清掉这里加的，别影响同一个库里后面的升级检查
delete from bug_reports where description in ('旧代码在升级后提交', '归经应该是肺、膀胱经');
delete from platform_admins where user_id = '00000000-0000-0000-0000-0000000000a5';
