-- =============================================================================
-- 煎药记录：记下每次煎药「实际」用了多少克，可以和处方不一样
--   - 多抓了几克 / 少放了 / 某味药没放（0g）/ 临时加了处方外的药（如生姜）
--   - 每次煎药生成一条 decoction + 若干 decoction_items，并写对应的库存扣减流水
-- 设计说明见 docs/design/0002-decoctions-and-testing.md
-- =============================================================================

create table public.decoctions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  prescription_id  uuid references public.prescriptions(id) on delete set null,
  doses            integer not null check (doses > 0),
  decocted_at      timestamptz not null default now(),
  note             text,
  created_by       uuid references auth.users(id) default auth.uid()
);
create index on public.decoctions (workspace_id, decocted_at desc);
create index on public.decoctions (prescription_id);

create table public.decoction_items (
  decoction_id   uuid not null references public.decoctions(id) on delete cascade,
  herb_id        uuid not null references public.herbs(id),
  planned_grams  numeric(10, 2) not null default 0 check (planned_grams >= 0),  -- 处方应用量（每副 × 副数）；处方外的药为 0
  actual_grams   numeric(10, 2) not null check (actual_grams >= 0),             -- 实际用量；0 = 这次没放
  primary key (decoction_id, herb_id)
);

alter table public.inventory_txns
  add column decoction_id uuid references public.decoctions(id) on delete cascade;
create index on public.inventory_txns (decoction_id);

alter table public.decoctions      enable row level security;
alter table public.decoction_items enable row level security;
create policy dec_all on public.decoctions for all
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy deci_all on public.decoction_items for all
  using (exists (select 1 from public.decoctions d where d.id = decoction_id and public.is_member(d.workspace_id)))
  with check (exists (select 1 from public.decoctions d where d.id = decoction_id and public.is_member(d.workspace_id)));

-- 记一次煎药。
--   p_actual：[{ "herb_id": "...", "grams": 50 }, ...] —— 这次「总共」实际用了多少克（不是每副）。
--             没列出的药按处方量；列出但不在处方里的 = 临时加的药；grams = 0 = 没放。
-- 返回 decoction id。
create or replace function public.record_decoction(
  p_prescription_id uuid,
  p_doses integer default null,
  p_actual jsonb default '[]'::jsonb,
  p_note text default null,
  p_decocted_at timestamptz default now()
)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare ws uuid; n integer; dec_id uuid;
begin
  select workspace_id, coalesce(p_doses, dose_count) into ws, n
  from public.prescriptions where id = p_prescription_id;
  if ws is null then raise exception 'prescription not found'; end if;
  if n is null or n <= 0 then raise exception 'doses must be positive'; end if;
  if jsonb_typeof(coalesce(p_actual, '[]'::jsonb)) <> 'array' then raise exception 'p_actual must be a JSON array'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_actual, '[]'::jsonb)) e
             where (e->>'grams') is null or (e->>'grams')::numeric < 0 or (e->>'herb_id') is null) then
    raise exception 'each p_actual entry needs herb_id and grams >= 0';
  end if;

  insert into public.decoctions (workspace_id, prescription_id, doses, note, decocted_at)
  values (ws, p_prescription_id, n, p_note, p_decocted_at)
  returning id into dec_id;

  with planned as (
    select herb_id, grams_per_dose * n as grams
    from public.prescription_items where prescription_id = p_prescription_id
  ),
  actual as (
    select (e->>'herb_id')::uuid as herb_id, sum((e->>'grams')::numeric) as grams
    from jsonb_array_elements(coalesce(p_actual, '[]'::jsonb)) e
    group by 1
  )
  insert into public.decoction_items (decoction_id, herb_id, planned_grams, actual_grams)
  select dec_id,
         coalesce(p.herb_id, a.herb_id),
         coalesce(p.grams, 0),
         coalesce(a.grams, p.grams)
  from planned p full join actual a on a.herb_id = p.herb_id;

  insert into public.inventory_txns (workspace_id, herb_id, delta_grams, kind, prescription_id, decoction_id, occurred_at, note)
  select ws, i.herb_id, -i.actual_grams, 'consume', p_prescription_id, dec_id, p_decocted_at, format('煎药 %s 副', n)
  from public.decoction_items i
  where i.decoction_id = dec_id and i.actual_grams > 0;

  return dec_id;
end;
$$;

-- 旧接口保留：按处方原量煎药
create or replace function public.consume_prescription(p_id uuid, p_doses integer default null)
returns integer
language plpgsql security invoker set search_path = public
as $$
declare dec_id uuid; cnt integer;
begin
  dec_id := public.record_decoction(p_id, p_doses);
  select count(*) into cnt from public.inventory_txns where decoction_id = dec_id;
  return cnt;
end;
$$;

-- 处方量 vs 实际量
create view public.v_decoction_variance with (security_invoker = true) as
select d.workspace_id,
       d.id              as decoction_id,
       d.prescription_id,
       d.decocted_at,
       d.doses,
       i.herb_id,
       h.name_zh,
       i.planned_grams,
       i.actual_grams,
       i.actual_grams - i.planned_grams as diff_grams,
       case
         when i.planned_grams = 0 then 'extra'      -- 处方外临时加的
         when i.actual_grams = 0 then 'omitted'     -- 没放
         when i.actual_grams > i.planned_grams then 'over'
         when i.actual_grams < i.planned_grams then 'under'
         else 'exact'
       end as status
from public.decoctions d
join public.decoction_items i on i.decoction_id = d.id
join public.herbs h on h.id = i.herb_id;

-- 新表沿用本地 supabase-lite 的默认授权（真实 Supabase 上本来就有）
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant all on public.decoctions, public.decoction_items, public.v_decoction_variance to authenticated;
  end if;
end $$;
