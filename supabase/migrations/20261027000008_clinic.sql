-- =============================================================================
-- MVP4：医生开方。诊所 = kind 'clinic' 的 workspace；病人是诊所里的记录。
-- 设计说明见 docs/design/0006-clinic-prescribing.md
-- =============================================================================

-- 处方来源加 clinic；每味药可以有医生备注
alter table public.prescriptions drop constraint if exists prescriptions_source_check;
alter table public.prescriptions add constraint prescriptions_source_check
  check (source in ('manual', 'photo', 'clinic'));
alter table public.prescription_items add column note text check (char_length(note) <= 200);

-- ---------------------------------------------------------------------------
-- 病人
-- ---------------------------------------------------------------------------
create table public.patients (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text check (char_length(name) <= 50),
  phone         text check (char_length(phone) <= 30),
  phone_digits  text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  notes         text,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  check (nullif(btrim(name), '') is not null or nullif(btrim(phone), '') is not null),
  unique (id, workspace_id)
);
create unique index patients_phone_unique on public.patients (workspace_id, phone_digits) where phone_digits is not null;
create index on public.patients (workspace_id, created_at desc);

alter table public.patients enable row level security;
create policy pat_all on public.patients for all
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- 只有诊所能建病人
create or replace function public.patients_only_in_clinic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select kind from public.workspaces where id = new.workspace_id) <> 'clinic' then
    raise exception '只有诊所可以建病人档案';
  end if;
  return new;
end $$;
create trigger patients_clinic_only before insert or update of workspace_id on public.patients
for each row execute function public.patients_only_in_clinic();

-- 处方挂病人：病人必须属于同一个 workspace；有处方的病人不能删
alter table public.prescriptions add column patient_id uuid;
alter table public.prescriptions add constraint prescriptions_patient_fk
  foreign key (patient_id, workspace_id) references public.patients (id, workspace_id) on delete restrict;
create index on public.prescriptions (patient_id, issued_on desc);

-- ---------------------------------------------------------------------------
-- 诊所
-- ---------------------------------------------------------------------------
create or replace function public.create_clinic(clinic_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare ws uuid; n text := btrim(clinic_name);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if n is null or n = '' then raise exception '请填写诊所名称'; end if;
  if char_length(n) > 40 then raise exception '诊所名称太长'; end if;
  insert into public.workspaces (name, kind) values (n, 'clinic') returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  insert into public.user_settings (user_id, active_workspace_id) values (auth.uid(), ws)
  on conflict (user_id) do update set active_workspace_id = ws;
  return ws;
end;
$$;

-- my_workspaces 加上 kind（返回列变了，要先删再建）
drop function if exists public.my_workspaces();
create function public.my_workspaces()
returns table (workspace_id uuid, name text, role text, is_active boolean, kind text)
language sql stable security definer set search_path = public
as $$
  select w.id, w.name, m.role, w.id = s.active_workspace_id, w.kind
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  left join public.user_settings s on s.user_id = m.user_id
  where m.user_id = auth.uid()
  order by m.created_at;
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.my_workspaces() to authenticated;
  end if;
end $$;

-- 有病人的 workspace 不是空的（接受邀请时不能被清理掉）
create or replace function public.workspace_is_empty(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (select 1 from public.prescriptions   where workspace_id = ws)
     and not exists (select 1 from public.purchases       where workspace_id = ws)
     and not exists (select 1 from public.stores          where workspace_id = ws)
     and not exists (select 1 from public.inventory_txns  where workspace_id = ws)
     and not exists (select 1 from public.pantry_settings where workspace_id = ws)
     and not exists (select 1 from public.decoctions      where workspace_id = ws)
     and not exists (select 1 from public.patients        where workspace_id = ws);
$$;
