-- =============================================================================
-- MVP2：比价与每副药成本
-- 设计说明见 docs/design/0003-mvp2-pricing.md
--
-- 约定：
--   * 价格 0 的采购行视为「赠品」，不参与比价（否则会永远是最便宜的那家），但计入库存平均成本。
--   * 「某店现价」= 这家店最近一次采购的每克单价（同一天多次取最后录入的）。
-- =============================================================================

-- 每味药在每家店的最近价格
create view public.v_store_latest_prices with (security_invoker = true) as
with ranked as (
  select pu.workspace_id, pi.herb_id, pu.store_id, s.name as store_name, s.kind as store_kind,
         pu.purchased_on, pi.price / pi.grams as price_per_gram,
         row_number() over (partition by pu.workspace_id, pi.herb_id, pu.store_id
                            order by pu.purchased_on desc, pu.created_at desc) as rn,
         count(*) over (partition by pu.workspace_id, pi.herb_id, pu.store_id) as purchase_count
  from public.purchase_items pi
  join public.purchases pu on pu.id = pi.purchase_id
  join public.stores s on s.id = pu.store_id
  where pi.price > 0
)
select r.workspace_id, r.herb_id, h.name_zh, r.store_id, r.store_name, r.store_kind,
       r.purchased_on as last_purchased_on,
       round(r.price_per_gram, 6) as price_per_gram,
       r.purchase_count
from ranked r join public.herbs h on h.id = r.herb_id
where r.rn = 1;

-- 每味药的比价汇总
create view public.v_herb_price_summary with (security_invoker = true) as
with latest as (select * from public.v_store_latest_prices),
cheapest as (
  select distinct on (workspace_id, herb_id) workspace_id, herb_id, store_id, store_name, price_per_gram
  from latest order by workspace_id, herb_id, price_per_gram, last_purchased_on desc, store_name
),
agg as (
  select workspace_id, herb_id, count(*) as store_count,
         min(price_per_gram) as min_ppg, max(price_per_gram) as max_ppg
  from latest group by workspace_id, herb_id
),
paid as (  -- 加权平均成本：含赠品
  select pu.workspace_id, pi.herb_id, sum(pi.price) / sum(pi.grams) as avg_cost_per_gram
  from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
  group by pu.workspace_id, pi.herb_id
)
select p.workspace_id, p.herb_id, h.name_zh, coalesce(a.store_count, 0) as store_count,
       c.store_id as cheapest_store_id, c.store_name as cheapest_store_name,
       a.min_ppg, a.max_ppg,
       case when a.min_ppg > 0 then round((a.max_ppg - a.min_ppg) / a.min_ppg * 100, 1) end as spread_pct,
       round(p.avg_cost_per_gram, 6) as avg_cost_per_gram
from paid p
join public.herbs h on h.id = p.herb_id
left join agg a on a.workspace_id = p.workspace_id and a.herb_id = p.herb_id
left join cheapest c on c.workspace_id = p.workspace_id and c.herb_id = p.herb_id;

-- 一张药方每味药的每副成本
--   p_strategy：'cheapest' 各店现价最低 / 'average' 自己买入的加权平均成本 / 'store' 只看 p_store_id 这家
--   查不到价格的药 price_per_gram 为 null
create or replace function public.prescription_cost(
  p_prescription_id uuid,
  p_strategy text default 'cheapest',
  p_store_id uuid default null
)
returns table (
  herb_id uuid, name_zh text, grams_per_dose numeric,
  price_per_gram numeric, store_name text, cost_per_dose numeric
)
language plpgsql stable security invoker set search_path = public
as $$
declare ws uuid;
begin
  if p_strategy not in ('cheapest', 'average', 'store') then
    raise exception 'unknown strategy %', p_strategy;
  end if;
  if p_strategy = 'store' and p_store_id is null then
    raise exception 'strategy store needs p_store_id';
  end if;
  select workspace_id into ws from public.prescriptions where id = p_prescription_id;
  if ws is null then raise exception 'prescription not found'; end if;

  return query
  select i.herb_id, h.name_zh, i.grams_per_dose,
         pr.ppg, pr.store_name,
         round(i.grams_per_dose * pr.ppg, 4)
  from public.prescription_items i
  join public.herbs h on h.id = i.herb_id
  left join lateral (
    select s.min_ppg as ppg, s.cheapest_store_name as store_name
      from public.v_herb_price_summary s
     where p_strategy = 'cheapest' and s.workspace_id = ws and s.herb_id = i.herb_id
    union all
    select s.avg_cost_per_gram, '平均成本'
      from public.v_herb_price_summary s
     where p_strategy = 'average' and s.workspace_id = ws and s.herb_id = i.herb_id
    union all
    select l.price_per_gram, l.store_name
      from public.v_store_latest_prices l
     where p_strategy = 'store' and l.workspace_id = ws and l.herb_id = i.herb_id and l.store_id = p_store_id
  ) pr on true
  where i.prescription_id = p_prescription_id
  order by i.sort_order, h.name_zh;
end;
$$;

-- 每家店配这张方子：每副多少钱、缺几味
create or replace function public.prescription_cost_by_store(p_prescription_id uuid)
returns table (store_id uuid, store_name text, store_kind text, cost_per_dose numeric, priced_items bigint, missing_items bigint)
language sql stable security invoker set search_path = public
as $$
  select s.id, s.name, s.kind,
         round(sum(i.grams_per_dose * l.price_per_gram), 4),
         count(l.price_per_gram),
         count(*) - count(l.price_per_gram)
  from public.prescriptions p
  join public.prescription_items i on i.prescription_id = p.id
  cross join public.stores s
  left join public.v_store_latest_prices l
         on l.workspace_id = p.workspace_id and l.herb_id = i.herb_id and l.store_id = s.id
  where p.id = p_prescription_id and s.workspace_id = p.workspace_id
  group by s.id, s.name, s.kind
  having count(l.price_per_gram) > 0
  order by count(*) - count(l.price_per_gram), 4, s.name;
$$;

-- 药柜当前价值（按加权平均成本；负库存不计）
create view public.v_inventory_value with (security_invoker = true) as
select i.workspace_id, i.herb_id, i.name_zh, i.on_hand_grams,
       s.avg_cost_per_gram,
       round(greatest(i.on_hand_grams, 0) * s.avg_cost_per_gram, 2) as value
from public.v_inventory i
left join public.v_herb_price_summary s on s.workspace_id = i.workspace_id and s.herb_id = i.herb_id;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.v_store_latest_prices, public.v_herb_price_summary, public.v_inventory_value to authenticated;
  end if;
end $$;
