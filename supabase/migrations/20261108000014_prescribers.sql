-- =============================================================================
-- RX-6：家庭录方的医生改成下拉选择。设计见 docs/design/0011-prescribers.md
-- 先扩展、后收缩（0009 §3）：只加表和可以为空的列；旧代码只写 prescriptions.prescriber 文字，照样能用。
-- =============================================================================

create table if not exists public.prescribers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index if not exists prescribers_name_unique on public.prescribers (workspace_id, name);

alter table public.prescribers enable row level security;
drop policy if exists prs_all on public.prescribers;
create policy prs_all on public.prescribers for all
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- 药方挂医生：医生必须属于同一个药柜
alter table public.prescriptions add column if not exists prescriber_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prescriptions_prescriber_fk') then
    alter table public.prescriptions add constraint prescriptions_prescriber_fk
      foreign key (prescriber_id, workspace_id) references public.prescribers (id, workspace_id);
  end if;
end $$;
create index if not exists prescriptions_prescriber_idx on public.prescriptions (prescriber_id);

-- 回填：已有的家庭药方，按药柜把医生文字去重建记录，再挂上。诊所处方的文字是诊所名称，不建。
-- 名字整理和 App 一样（web/src/lib/prescribers.ts cleanPrescriberName）：连续空白（含全角空格）合成一个，去掉首尾空白。
-- 可以重复执行：已有的医生不重复建，只回填还没挂上的药方（migration 上线后、新代码上线前旧代码存的也会补上）。
create or replace function pg_temp.clean_name(s text) returns text language sql immutable as $$
  select btrim(regexp_replace(coalesce(s, ''), '[[:space:]　]+', ' ', 'g'))
$$;

insert into public.prescribers (workspace_id, name, created_by)
select distinct p.workspace_id, pg_temp.clean_name(p.prescriber), null::uuid
from public.prescriptions p
where p.source <> 'clinic' and char_length(pg_temp.clean_name(p.prescriber)) between 1 and 100
on conflict (workspace_id, name) do nothing;

update public.prescriptions p
set prescriber_id = d.id
from public.prescribers d
where p.prescriber_id is null
  and p.source <> 'clinic'
  and d.workspace_id = p.workspace_id
  and d.name = pg_temp.clean_name(p.prescriber);
