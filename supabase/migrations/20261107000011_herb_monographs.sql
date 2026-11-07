-- =============================================================================
-- 药材资料（全站共用）+ 审核人 + 修改记录。设计见 docs/design/0010-herb-labels.md §3.1、§3.2
--
-- - herb_monographs：一味药一行。登录用户能读全部；未登录只能读已审核的（以后的公开介绍页）
-- - 谁都不能直接写：审核人通过 review_herb_monograph() 改，每次都记 herb_monograph_revisions
-- - 内容由下一个 migration（scripts/gen-herb-monographs.mjs 生成）导入
-- 只加新表和新函数，旧代码不受影响。
-- =============================================================================

create table public.herb_monographs (
  herb_id         uuid primary key references public.herbs(id) on delete cascade,
  latin_name      text,
  source          text,
  flavors         text[] not null,
  nature          text not null,
  meridians       text[] not null,
  traditional_use text not null,
  processing      text,
  regions         text,
  quality         text,
  toxicity        text,          -- 炮制品可空：显示原药材的
  cautions        text,
  storage         text,
  reference       text not null,
  check_note      text,          -- 需要重点核对的地方（草稿里带的）
  flag_note       text,          -- 审核人点「有问题」写的备注
  status          text not null default 'draft',
  reviewed_by     text,
  reviewed_at     date,
  updated_at      timestamptz not null default now(),

  constraint hm_nature check (nature in ('寒', '微寒', '大寒', '凉', '微凉', '大凉', '平', '微平', '大平', '温', '微温', '大温', '热', '微热', '大热')),
  constraint hm_flavors check (cardinality(flavors) > 0 and flavors <@ array['酸', '苦', '甘', '辛', '咸', '淡', '涩', '微酸', '微苦', '微甘', '微辛', '微咸', '微淡', '微涩']),
  constraint hm_meridians check (cardinality(meridians) > 0 and meridians <@ array['肺', '大肠', '胃', '脾', '心', '小肠', '膀胱', '肾', '心包', '三焦', '胆', '肝']),
  constraint hm_toxicity check (toxicity in ('none', 'minor', 'toxic', 'severe')),
  constraint hm_reference check (reference in ('中国药典', '中药学教材')),
  constraint hm_use check (btrim(traditional_use) <> ''),
  -- 不写用量（CLAUDE.md：AI 只做转录和科普）
  constraint hm_no_dose check (traditional_use !~* '\d+(\.\d+)?\s*(g|克|钱|两|mg|毫克)' and coalesce(cautions, '') !~* '\d+(\.\d+)?\s*(g|克|钱|两|mg|毫克)'),
  constraint hm_status check (status in ('draft', 'reviewed')),
  constraint hm_reviewed check ((status = 'reviewed') = (reviewed_by is not null and reviewed_at is not null))
);

create table public.monograph_reviewers (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 20),
  created_at   timestamptz not null default now()
);

create table public.herb_monograph_revisions (
  id            bigint generated always as identity primary key,
  herb_id       uuid not null references public.herbs(id) on delete cascade,
  action        text not null check (action in ('save', 'approve', 'flag')),
  before        jsonb,
  after         jsonb,
  note          text,
  reviewer_id   uuid references auth.users(id) on delete set null,
  reviewer_name text not null,
  created_at    timestamptz not null default now()
);
create index on public.herb_monograph_revisions (herb_id, created_at);

-- ---------------------------------------------------------------------------
-- 权限：都不能直接写；读的范围见上
-- ---------------------------------------------------------------------------
alter table public.herb_monographs enable row level security;
alter table public.monograph_reviewers enable row level security;
alter table public.herb_monograph_revisions enable row level security;

create or replace function public.is_monograph_reviewer()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.monograph_reviewers where user_id = auth.uid()) $$;

create policy hm_read on public.herb_monographs for select to authenticated using (true);
create policy hm_read_public on public.herb_monographs for select to anon using (status = 'reviewed');
create policy mr_self on public.monograph_reviewers for select to authenticated using (user_id = (select auth.uid()));
create policy hmr_read on public.herb_monograph_revisions for select to authenticated using (public.is_monograph_reviewer());

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke insert, update, delete, truncate on public.herb_monographs, public.monograph_reviewers, public.herb_monograph_revisions from %I', r);
      execute format('revoke usage on sequence public.herb_monograph_revisions_id_seq from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke select on public.monograph_reviewers, public.herb_monograph_revisions from anon;
    -- 未登录（以后的公开页）只给资料本身，不给内部备注（check_note、flag_note）
    revoke select on public.herb_monographs from anon;
    grant select (herb_id, latin_name, source, flavors, nature, meridians, traditional_use, processing, regions,
                  quality, toxicity, cautions, storage, reference, status, reviewed_by, reviewed_at, updated_at)
      on public.herb_monographs to anon;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 审核人修改资料：save（存着，内容变了就退回草稿）/ approve（通过）/ flag（有问题，只记备注）
-- p_content 的键和列名一样；返回改完以后的状态
-- ---------------------------------------------------------------------------
create or replace function public.review_herb_monograph(p_herb_id uuid, p_content jsonb, p_action text, p_note text default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_old public.herb_monographs;
  v_new public.herb_monographs;
  dose constant text := '\d+(\.\d+)?\s*(g|克|钱|两|mg|毫克)';
  n text := nullif(btrim(p_note), '');
  fields constant text[] := array['latin_name', 'source', 'flavors', 'nature', 'meridians', 'traditional_use',
                                  'processing', 'regions', 'quality', 'toxicity', 'cautions', 'storage'];
begin
  select display_name into v_name from public.monograph_reviewers where user_id = auth.uid();
  if v_name is null then raise exception '只有审核人可以修改药材资料'; end if;
  if p_action is null or p_action not in ('save', 'approve', 'flag') then raise exception '操作不对'; end if;

  select * into v_old from public.herb_monographs where herb_id = p_herb_id for update;
  if not found then raise exception '这味药还没有资料'; end if;

  if p_action = 'flag' then
    if n is null then raise exception '请写一下是什么问题'; end if;
    update public.herb_monographs set flag_note = n, updated_at = now() where herb_id = p_herb_id;
    insert into public.herb_monograph_revisions (herb_id, action, note, reviewer_id, reviewer_name)
    values (p_herb_id, 'flag', n, auth.uid(), v_name);
    return v_old.status;
  end if;

  v_new := v_old;
  v_new.latin_name      := nullif(btrim(p_content->>'latin_name'), '');
  v_new.source          := nullif(btrim(p_content->>'source'), '');
  v_new.flavors         := array(select btrim(x) from jsonb_array_elements_text(coalesce(p_content->'flavors', '[]')) x where btrim(x) <> '');
  v_new.nature          := btrim(coalesce(p_content->>'nature', ''));
  v_new.meridians       := array(select btrim(x) from jsonb_array_elements_text(coalesce(p_content->'meridians', '[]')) x where btrim(x) <> '');
  v_new.traditional_use := btrim(coalesce(p_content->>'traditional_use', ''));
  v_new.processing      := nullif(btrim(p_content->>'processing'), '');
  v_new.regions         := nullif(btrim(p_content->>'regions'), '');
  v_new.quality         := nullif(btrim(p_content->>'quality'), '');
  v_new.toxicity        := nullif(btrim(p_content->>'toxicity'), '');
  v_new.cautions        := nullif(btrim(p_content->>'cautions'), '');
  v_new.storage         := nullif(btrim(p_content->>'storage'), '');

  -- 和表上的约束一样，先检查一遍，给出看得懂的提示
  if v_new.nature not in ('寒', '微寒', '大寒', '凉', '微凉', '大凉', '平', '微平', '大平', '温', '微温', '大温', '热', '微热', '大热') then
    raise exception '「性」只能写 寒 / 凉 / 平 / 温 / 热，可以加「微」「大」';
  end if;
  if cardinality(v_new.flavors) = 0 or not v_new.flavors <@ array['酸', '苦', '甘', '辛', '咸', '淡', '涩', '微酸', '微苦', '微甘', '微辛', '微咸', '微淡', '微涩'] then
    raise exception '「味」只能写 酸 / 苦 / 甘 / 辛 / 咸 / 淡 / 涩，可以加「微」';
  end if;
  if cardinality(v_new.meridians) = 0 or not v_new.meridians <@ array['肺', '大肠', '胃', '脾', '心', '小肠', '膀胱', '肾', '心包', '三焦', '胆', '肝'] then
    raise exception '「归经」只能写 肺 / 大肠 / 胃 / 脾 / 心 / 小肠 / 膀胱 / 肾 / 心包 / 三焦 / 胆 / 肝';
  end if;
  if v_new.toxicity is not null and v_new.toxicity not in ('none', 'minor', 'toxic', 'severe') then raise exception '毒性不对'; end if;
  if v_new.traditional_use = '' then raise exception '请填写传统用途'; end if;
  if v_new.traditional_use ~* dose or coalesce(v_new.cautions, '') ~* dose then
    raise exception '药材资料里不写用量（传统用途、使用注意里不能有「数字 + 克」）';
  end if;

  if p_action = 'approve' then
    v_new.status := 'reviewed'; v_new.reviewed_by := v_name; v_new.reviewed_at := current_date; v_new.flag_note := null;
  elsif (select jsonb_object_agg(k, to_jsonb(v_new)->k) from unnest(fields) k)
        is distinct from (select jsonb_object_agg(k, to_jsonb(v_old)->k) from unnest(fields) k) then
    -- 改了内容：审核过的也退回草稿，要重新通过
    v_new.status := 'draft'; v_new.reviewed_by := null; v_new.reviewed_at := null;
  end if;
  v_new.updated_at := now();

  update public.herb_monographs set
    latin_name = v_new.latin_name, source = v_new.source, flavors = v_new.flavors, nature = v_new.nature,
    meridians = v_new.meridians, traditional_use = v_new.traditional_use, processing = v_new.processing,
    regions = v_new.regions, quality = v_new.quality, toxicity = v_new.toxicity, cautions = v_new.cautions,
    storage = v_new.storage, flag_note = v_new.flag_note, status = v_new.status, reviewed_by = v_new.reviewed_by,
    reviewed_at = v_new.reviewed_at, updated_at = v_new.updated_at
  where herb_id = p_herb_id;

  insert into public.herb_monograph_revisions (herb_id, action, before, after, note, reviewer_id, reviewer_name)
  values (p_herb_id, p_action,
          (select jsonb_object_agg(k, to_jsonb(v_old)->k) from unnest(fields || array['status']) k),
          (select jsonb_object_agg(k, to_jsonb(v_new)->k) from unnest(fields || array['status']) k),
          n, auth.uid(), v_name);
  return v_new.status;
end;
$$;

do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('review_herb_monograph', 'is_monograph_reviewer') loop
    execute format('revoke execute on function %s from public', f);
    if has_anon then execute format('revoke execute on function %s from anon', f); end if;
    if has_auth then execute format('grant execute on function %s to authenticated', f); end if;
  end loop;
end $$;
