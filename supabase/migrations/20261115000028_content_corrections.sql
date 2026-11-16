-- =============================================================================
-- 信息纠错：指出药材和题目里的错误。设计见 docs/design/0021-content-corrections.md
--
-- 复用 bug_reports，加一列类型（bug 程序问题 / content 信息纠错）和指向被纠错对象的几列。
-- 先扩展：只加列（带默认值）、约束、一条限制性策略、列级授权和一个新函数；
-- 不改已有的策略和函数——线上旧代码插入时不写新列，kind 默认 bug，照常能用。
-- =============================================================================

alter table public.bug_reports
  add column kind                text not null default 'bug',
  add column subject_type        text,
  add column subject_herb_id     uuid references public.herbs(id) on delete set null,
  add column subject_question_id text references public.quiz_questions(id) on delete set null,
  add column field               text,
  add column evidence            text;

alter table public.bug_reports
  add constraint bug_reports_kind check (kind in ('bug', 'content')),
  -- 依据：原文最多 200 字（不只是去掉空格以后：首尾补空格不能绕过），至少有一个不是空白的字
  add constraint bug_reports_evidence check (evidence is null or (char_length(evidence) <= 200 and evidence ~ '\S')),
  -- 程序问题：纠错的列都是空的。信息纠错：对象和「哪一项」对得上（列表和 web/src/lib/content-correction.ts 一致，单元测试比对）；
  -- 不带诊断信息（操作记录、前端错误、浏览器、药柜，0021 §4）。
  -- 对象「必须存在」不写在这里：药材删掉时外键置空，这里不能因此失败（见下面的 br_insert_subject）。
  -- coalesce：field 是 null 时 `in (…)` 得 null，check 会当成通过
  add constraint bug_reports_kind_shape check (coalesce(
    case kind
      when 'bug' then
        subject_type is null and subject_herb_id is null and subject_question_id is null and field is null and evidence is null
      when 'content' then
        recent_actions = '[]'::jsonb and recent_errors = '[]'::jsonb
        and user_agent is null and viewport is null and workspace_id is null
        and case subject_type
          when 'herb' then subject_question_id is null
            and field in ('name', 'pinyin', 'aliases', 'category', 'origin_kind', 'medicinal_part', 'base_herb',
                          'properties', 'monograph', 'photo', 'other')
          when 'quiz_question' then subject_herb_id is null
            and field in ('stem', 'options', 'answer', 'explanation', 'source', 'other')
          else false
        end
      else false
    end, false)
  );

create index on public.bug_reports (subject_herb_id) where subject_herb_id is not null;
create index on public.bug_reports (subject_question_id) where subject_question_id is not null;

-- 用户提交纠错时，对象必须存在（外键保证存在，这里保证不是空的）。
-- 限制性策略：和原来的 br_insert 同时满足才能插入；原来的策略不用改。只管插入，以后药材删了外键置空不受影响
create policy br_insert_subject on public.bug_reports as restrictive for insert to authenticated
  with check (
    kind = 'bug'
    or (subject_type = 'herb' and subject_herb_id is not null)
    or (subject_type = 'quiz_question' and subject_question_id is not null)
  );

-- 新列的插入授权（原来那几列的授权不变；status、reporter_id、created_at、id 仍然只能用默认值）
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant insert (kind, subject_type, subject_herb_id, subject_question_id, field, evidence) on public.bug_reports to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 看板用：和 admin_bug_reports 一样，多返回类型和纠错的几列（药名 / 题干从目录、题库里 join）。
-- 旧的 admin_bug_reports 先留着给线上旧代码用，下一次动 bug_reports 时删（0021 §3.4）
-- ---------------------------------------------------------------------------
create or replace function public.admin_feedback_reports(p_status text default null, p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, status text, reporter_id uuid, reporter_no integer, reporter_kind text, reporter_email text,
  page_path text, description text, user_agent text, viewport text, app_version text, recent_actions jsonb, recent_errors jsonb,
  kind text, subject_type text, subject_id text, subject_label text, field text, evidence text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.admin_require();
  if p_status is not null and p_status not in ('new', 'in_progress', 'fixed', 'wontfix') then
    raise exception '状态不对' using errcode = '22023';
  end if;
  return query
  select b.id, b.created_at, b.status, b.reporter_id, n.user_no, s.account_kind,
         case when s.account_kind = 'clinic' then u.email::text end,
         b.page_path, b.description, b.user_agent, b.viewport, b.app_version, b.recent_actions, b.recent_errors,
         b.kind, b.subject_type, coalesce(b.subject_herb_id::text, b.subject_question_id),
         coalesce(h.name_zh, q.stem), b.field, b.evidence
  from public.bug_reports b
  left join auth.users u on u.id = b.reporter_id
  left join public.user_settings s on s.user_id = b.reporter_id
  left join public.admin_user_numbers() n on n.user_id = b.reporter_id
  left join public.herbs h on h.id = b.subject_herb_id
  left join public.quiz_questions q on q.id = b.subject_question_id
  where p_status is null or b.status = p_status
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- 只给登录用户（函数里再检查是不是管理员）
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_feedback_reports' loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;
