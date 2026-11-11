-- =============================================================================
-- 预设药方 + 处方复用（IDEA-3）。设计见 docs/design/0013-prescription-templates.md
-- 只加表、加可以为空的列，旧代码不受影响。
-- =============================================================================

create table public.prescription_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  dose_count   integer check (dose_count between 1 and 60),
  instructions text check (char_length(instructions) <= 200),
  notes        text check (char_length(notes) <= 500),
  use_count    integer not null default 0,
  last_used_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, name)
);

create table public.prescription_template_items (
  template_id    uuid not null references public.prescription_templates(id) on delete cascade,
  herb_id        uuid not null references public.herbs(id),
  grams_per_dose numeric(8, 2) not null check (grams_per_dose > 0),
  special_prep   text,
  note           text check (char_length(note) <= 200),
  sort_order     integer not null default 0,
  primary key (template_id, herb_id)
);

-- 只有诊所可以建预设药方（和病人档案一样）
create or replace function public.templates_only_in_clinic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select kind from public.workspaces where id = new.workspace_id) <> 'clinic' then
    raise exception '只有诊所可以建预设药方';
  end if;
  return new;
end $$;
create trigger prescription_templates_clinic_only before insert or update of workspace_id on public.prescription_templates
for each row execute function public.templates_only_in_clinic();

alter table public.prescription_templates enable row level security;
alter table public.prescription_template_items enable row level security;
create policy pt_all on public.prescription_templates for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy pti_all on public.prescription_template_items for all to authenticated
  using (exists (select 1 from public.prescription_templates t where t.id = template_id and public.is_member(t.workspace_id)))
  with check (exists (select 1 from public.prescription_templates t where t.id = template_id and public.is_member(t.workspace_id)));
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.prescription_templates, public.prescription_template_items from anon;
  end if;
end $$;

-- 处方记下从哪开的。复合外键保证来源和新处方在同一个药柜；删了来源只把来源列变空，处方不受影响
alter table public.prescriptions add constraint prescriptions_id_workspace_key unique (id, workspace_id);
alter table public.prescriptions
  add column source_template_id uuid,
  add column source_prescription_id uuid,
  add constraint prescriptions_source_template_fk foreign key (source_template_id, workspace_id)
    references public.prescription_templates (id, workspace_id) on delete set null (source_template_id),
  add constraint prescriptions_source_prescription_fk foreign key (source_prescription_id, workspace_id)
    references public.prescriptions (id, workspace_id) on delete set null (source_prescription_id);

create index on public.prescriptions (source_template_id) where source_template_id is not null;
create index on public.prescriptions (source_prescription_id) where source_prescription_id is not null;

-- ---------------------------------------------------------------------------
-- 预设药方的写操作放在一个函数里（一个事务）：明细整个换掉不会只换一半；用过次数原子加一。
-- security invoker：权限照常走 RLS 和「只有诊所」的触发器。
-- p_lines：[{"herb_id": uuid, "grams": number, "prep": text|null, "note": text|null}, …]，按数组顺序排
-- ---------------------------------------------------------------------------
create or replace function public.replace_template_items(p_template_id uuid, p_lines jsonb)
returns void
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception '预设药方至少要有一味药'; end if;
  delete from public.prescription_template_items where template_id = p_template_id;
  insert into public.prescription_template_items (template_id, herb_id, grams_per_dose, special_prep, note, sort_order)
  select p_template_id, (e->>'herb_id')::uuid, (e->>'grams')::numeric, nullif(e->>'prep', ''), nullif(e->>'note', ''), (o - 1)::int
  from jsonb_array_elements(p_lines) with ordinality as t(e, o);
end;
$$;

-- 新建预设（带明细）。返回新预设的 id；名字重复时报「已经有叫…」
create or replace function public.create_prescription_template(
  p_workspace_id uuid, p_name text, p_doses integer, p_instructions text, p_notes text, p_lines jsonb, p_used boolean default false)
returns uuid
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare tid uuid; n text := btrim(p_name);
begin
  if exists (select 1 from public.prescription_templates where workspace_id = p_workspace_id and name = n) then
    raise exception '已经有叫「%」的预设药方了，换个名字', n;
  end if;
  insert into public.prescription_templates (workspace_id, name, dose_count, instructions, notes, use_count, last_used_at)
  values (p_workspace_id, n, p_doses, nullif(btrim(p_instructions), ''), nullif(btrim(p_notes), ''),
          case when p_used then 1 else 0 end, case when p_used then now() end)
  returning id into tid;
  perform public.replace_template_items(tid, p_lines);
  return tid;
end;
$$;

-- 用预设开了一张处方：用过次数加一；p_update 时用这次的剂数、煎服法、医嘱、药材覆盖预设（「同时更新预设」）。
-- 预设已经被删了：什么都不做，返回 false
create or replace function public.use_prescription_template(
  p_template_id uuid, p_update boolean, p_doses integer, p_instructions text, p_notes text, p_lines jsonb)
returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  perform 1 from public.prescription_templates where id = p_template_id for update;  -- 同时保存时排队
  if not found then return false; end if;
  update public.prescription_templates set
    use_count = use_count + 1,
    last_used_at = now(),
    dose_count = case when p_update then p_doses else dose_count end,
    instructions = case when p_update then nullif(btrim(p_instructions), '') else instructions end,
    notes = case when p_update then nullif(btrim(p_notes), '') else notes end,
    updated_at = case when p_update then now() else updated_at end
  where id = p_template_id;
  if p_update then perform public.replace_template_items(p_template_id, p_lines); end if;
  return true;
end;
$$;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('replace_template_items', 'create_prescription_template', 'use_prescription_template') loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', f); end if;
  end loop;
end $$;

-- 触发器函数谁都不能直接调用
do $$
declare f regprocedure; r text;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'templates_only_in_clinic' loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke execute on function %s from %I', f, r); end if;
    end loop;
  end loop;
end $$;
