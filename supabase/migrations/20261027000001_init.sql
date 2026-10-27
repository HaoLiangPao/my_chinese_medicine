-- =============================================================================
-- MVP1 初始 schema：药方记录 / 家庭库存 / 采购 / 统计
-- 目标库：Supabase (Postgres 15+)。依赖 Supabase 自带的 auth.users 与 auth.uid()。
-- 设计说明见 docs/design/0001-mvp1.md
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. 工作空间（家庭 / 诊所）与成员
--    MVP1 只有一个 household；MVP3 加 clinic 时复用同一套表，不用重构。
-- -----------------------------------------------------------------------------
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'household' check (kind in ('household', 'clinic')),
  created_at  timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner', 'member', 'doctor', 'patient')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- 当前用户是否属于某 workspace（RLS 用）
create or replace function public.is_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. 药材目录（全局共享）
--    炮制品单独一行（炙黄芪 ≠ 黄芪），用 base_herb_id 指回原药材，便于合并统计。
-- -----------------------------------------------------------------------------
create table public.herbs (
  id            uuid primary key default gen_random_uuid(),
  name_zh       text not null unique,          -- 标准名，如「炙黄芪」
  pinyin        text,                          -- 如 "zhi huang qi"
  base_herb_id  uuid references public.herbs(id) on delete set null,  -- 炮制品 → 原药材
  category      text,                          -- 功效分类，如「补气药」
  notes         text,
  created_at    timestamptz not null default now()
);

-- 别名 / 常见写法（照片识别时用来匹配，如「北芪」→ 黄芪）
create table public.herb_aliases (
  alias    text primary key,
  herb_id  uuid not null references public.herbs(id) on delete cascade
);

-- 名字 → 药材（先查标准名，再查别名）
create or replace function public.match_herb(raw_name text)
returns uuid
language sql stable
as $$
  select coalesce(
    (select id from public.herbs where name_zh = btrim(raw_name)),
    (select herb_id from public.herb_aliases where alias = btrim(raw_name))
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. 药方
-- -----------------------------------------------------------------------------
create table public.prescriptions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  title          text,                               -- 自己起的名字，如「十月调理方」
  prescriber     text default '李医生',
  patient_label  text,                               -- 谁吃的
  issued_on      date not null default current_date,
  dose_count     integer not null default 1 check (dose_count > 0),  -- 剂数（几副）
  instructions   text,                               -- 煎服法
  price_paid     numeric(10, 2),                     -- 在诊所实际付了多少钱（可空）
  photo_path     text,                               -- storage 里的路径
  source         text not null default 'manual' check (source in ('manual', 'photo')),
  notes          text,
  created_by     uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index on public.prescriptions (workspace_id, issued_on desc);

create table public.prescription_items (
  id               uuid primary key default gen_random_uuid(),
  prescription_id  uuid not null references public.prescriptions(id) on delete cascade,
  herb_id          uuid not null references public.herbs(id),
  grams_per_dose   numeric(8, 2) not null check (grams_per_dose > 0),  -- 每副克数
  special_prep     text check (special_prep in ('先煎', '后下', '包煎', '另煎', '烊化', '冲服')),
  raw_name         text,              -- 识别/手写时的原文，留作核对
  sort_order       integer not null default 0,
  unique (prescription_id, herb_id)
);
create index on public.prescription_items (herb_id);

-- -----------------------------------------------------------------------------
-- 4. 店铺与采购
-- -----------------------------------------------------------------------------
create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  kind          text not null default 'shop' check (kind in ('clinic', 'shop', 'online')),
  url           text,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  store_id      uuid references public.stores(id) on delete set null,
  purchased_on  date not null default current_date,
  notes         text,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index on public.purchases (workspace_id, purchased_on desc);

create table public.purchase_items (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references public.purchases(id) on delete cascade,
  herb_id      uuid not null references public.herbs(id),
  grams        numeric(10, 2) not null check (grams > 0),
  price        numeric(10, 2) not null check (price >= 0),   -- 这一行总价（CAD）
  unique (purchase_id, herb_id)
);

-- -----------------------------------------------------------------------------
-- 5. 库存流水（ledger）：库存 = 流水求和，不直接存「剩余克数」
-- -----------------------------------------------------------------------------
create table public.inventory_txns (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  herb_id           uuid not null references public.herbs(id),
  delta_grams       numeric(10, 2) not null check (delta_grams <> 0),
  kind              text not null check (kind in ('purchase', 'consume', 'adjust', 'discard')),
  purchase_item_id  uuid unique references public.purchase_items(id) on delete cascade,
  prescription_id   uuid references public.prescriptions(id) on delete set null,
  occurred_at       timestamptz not null default now(),
  note              text,
  created_by        uuid references auth.users(id) default auth.uid()
);
create index on public.inventory_txns (workspace_id, herb_id);

-- 每个罐子的设置（标签、低库存提醒）
create table public.pantry_settings (
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  herb_id          uuid not null references public.herbs(id) on delete cascade,
  jar_label        text,
  low_stock_grams  numeric(10, 2),
  primary key (workspace_id, herb_id)
);

-- 采购明细 → 自动写入/更新库存流水
create or replace function public.sync_purchase_item_txn()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare ws uuid; d date;
begin
  select workspace_id, purchased_on into ws, d from public.purchases where id = new.purchase_id;
  insert into public.inventory_txns (workspace_id, herb_id, delta_grams, kind, purchase_item_id, occurred_at, created_by)
  values (ws, new.herb_id, new.grams, 'purchase', new.id, d::timestamptz, auth.uid())
  on conflict (purchase_item_id) do update
    set herb_id = excluded.herb_id, delta_grams = excluded.delta_grams;
  return new;
end;
$$;

create trigger purchase_items_sync_txn
after insert or update of herb_id, grams on public.purchase_items
for each row execute function public.sync_purchase_item_txn();

-- 「用家里库存配 N 副这张方子」：一次写入所有扣减流水
create or replace function public.consume_prescription(p_id uuid, p_doses integer default null)
returns integer
language plpgsql security invoker set search_path = public
as $$
declare ws uuid; n integer; cnt integer;
begin
  select workspace_id, coalesce(p_doses, dose_count) into ws, n
  from public.prescriptions where id = p_id;
  if ws is null then raise exception 'prescription not found'; end if;
  if n <= 0 then raise exception 'doses must be positive'; end if;

  insert into public.inventory_txns (workspace_id, herb_id, delta_grams, kind, prescription_id, note)
  select ws, i.herb_id, -(i.grams_per_dose * n), 'consume', p_id, format('配药 %s 副', n)
  from public.prescription_items i where i.prescription_id = p_id;
  get diagnostics cnt = row_count;
  return cnt;
end;
$$;

-- 首次登录：没有 workspace 就建一个，并把自己设为 owner
create or replace function public.ensure_default_workspace(ws_name text default '我们家')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select workspace_id into ws from public.workspace_members where user_id = auth.uid()
  order by created_at limit 1;
  if ws is null then
    insert into public.workspaces (name) values (ws_name) returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  end if;
  return ws;
end;
$$;

-- 把已注册的家人拉进自己的 workspace（对方需先注册过）。
-- 对方如果自己已经有一个空的默认 workspace，会被移出那个、只留在这个。
create or replace function public.add_member_by_email(ws uuid, member_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid;
begin
  if not exists (select 1 from public.workspace_members
                 where workspace_id = ws and user_id = auth.uid() and role = 'owner') then
    raise exception '只有 owner 可以添加成员';
  end if;
  select id into uid from auth.users where lower(email) = lower(btrim(member_email));
  if uid is null then raise exception '这个邮箱还没注册'; end if;

  -- 清掉对方自动生成且没有任何数据的空 workspace
  delete from public.workspaces w
  using public.workspace_members m
  where m.workspace_id = w.id and m.user_id = uid and w.id <> ws
    and not exists (select 1 from public.prescriptions p where p.workspace_id = w.id)
    and not exists (select 1 from public.purchases p where p.workspace_id = w.id)
    and not exists (select 1 from public.workspace_members o where o.workspace_id = w.id and o.user_id <> uid);

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, uid, 'member') on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. 统计视图（security_invoker：跟随调用者的 RLS）
-- -----------------------------------------------------------------------------

-- 当前库存
create view public.v_inventory with (security_invoker = true) as
select t.workspace_id,
       t.herb_id,
       h.name_zh,
       h.pinyin,
       sum(t.delta_grams)                                     as on_hand_grams,
       max(t.occurred_at) filter (where t.kind = 'purchase')  as last_purchased_at,
       ps.jar_label,
       ps.low_stock_grams,
       (ps.low_stock_grams is not null and sum(t.delta_grams) <= ps.low_stock_grams) as is_low
from public.inventory_txns t
join public.herbs h on h.id = t.herb_id
left join public.pantry_settings ps on ps.workspace_id = t.workspace_id and ps.herb_id = t.herb_id
group by t.workspace_id, t.herb_id, h.name_zh, h.pinyin, ps.jar_label, ps.low_stock_grams;

-- 每味药在药方里的使用统计
create view public.v_herb_usage with (security_invoker = true) as
select p.workspace_id,
       i.herb_id,
       h.name_zh,
       count(distinct p.id)                       as prescription_count,
       sum(i.grams_per_dose * p.dose_count)       as total_grams,
       round(avg(i.grams_per_dose), 2)            as avg_grams_per_dose,
       min(i.grams_per_dose)                      as min_grams_per_dose,
       max(i.grams_per_dose)                      as max_grams_per_dose,
       min(p.issued_on)                           as first_used_on,
       max(p.issued_on)                           as last_used_on
from public.prescription_items i
join public.prescriptions p on p.id = i.prescription_id
join public.herbs h on h.id = i.herb_id
group by p.workspace_id, i.herb_id, h.name_zh;

-- 每次采购的单价（为 MVP2 比价打底）
create view public.v_purchase_prices with (security_invoker = true) as
select pu.workspace_id,
       pi.herb_id,
       h.name_zh,
       pu.store_id,
       s.name                               as store_name,
       pu.purchased_on,
       pi.grams,
       pi.price,
       round(pi.price / pi.grams, 4)        as price_per_gram
from public.purchase_items pi
join public.purchases pu on pu.id = pi.purchase_id
join public.herbs h on h.id = pi.herb_id
left join public.stores s on s.id = pu.store_id;

-- -----------------------------------------------------------------------------
-- 7. RLS
-- -----------------------------------------------------------------------------
alter table public.workspaces          enable row level security;
alter table public.workspace_members   enable row level security;
alter table public.herbs               enable row level security;
alter table public.herb_aliases        enable row level security;
alter table public.prescriptions       enable row level security;
alter table public.prescription_items  enable row level security;
alter table public.stores              enable row level security;
alter table public.purchases           enable row level security;
alter table public.purchase_items      enable row level security;
alter table public.inventory_txns      enable row level security;
alter table public.pantry_settings     enable row level security;

create policy ws_select on public.workspaces for select using (public.is_member(id));
create policy ws_update on public.workspaces for update using (public.is_member(id));
create policy wm_select on public.workspace_members for select using (public.is_member(workspace_id));

-- 药材目录：所有登录用户可读、可新增（MVP1 简化；以后改成管理员审核）
create policy herbs_read   on public.herbs for select to authenticated using (true);
create policy herbs_insert on public.herbs for insert to authenticated with check (true);
create policy herbs_update on public.herbs for update to authenticated using (true);
create policy alias_read   on public.herb_aliases for select to authenticated using (true);
create policy alias_insert on public.herb_aliases for insert to authenticated with check (true);

-- 直接带 workspace_id 的表
create policy rx_all  on public.prescriptions   for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy st_all  on public.stores          for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy pu_all  on public.purchases       for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy inv_all on public.inventory_txns  for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy ps_all  on public.pantry_settings for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- 子表：通过父表判断
create policy rxi_all on public.prescription_items for all
  using (exists (select 1 from public.prescriptions p where p.id = prescription_id and public.is_member(p.workspace_id)))
  with check (exists (select 1 from public.prescriptions p where p.id = prescription_id and public.is_member(p.workspace_id)));
create policy pui_all on public.purchase_items for all
  using (exists (select 1 from public.purchases p where p.id = purchase_id and public.is_member(p.workspace_id)))
  with check (exists (select 1 from public.purchases p where p.id = purchase_id and public.is_member(p.workspace_id)));

-- -----------------------------------------------------------------------------
-- 8. Storage：药方照片（私有 bucket，路径以 workspace_id/ 开头）
--    本地纯 Postgres 测试时没有 storage schema，跳过。
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('prescription-photos', 'prescription-photos', false)
    on conflict (id) do nothing;

    execute $p$
      create policy rx_photos_rw on storage.objects for all to authenticated
      using (bucket_id = 'prescription-photos' and public.is_member(((storage.foldername(name))[1])::uuid))
      with check (bucket_id = 'prescription-photos' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
end $$;
