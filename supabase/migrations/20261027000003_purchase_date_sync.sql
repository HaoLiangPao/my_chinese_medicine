-- 修正：改了采购日期时，对应的库存流水时间也要跟着改（之前只同步克数和药材）。
create or replace function public.sync_purchase_date_txn()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.inventory_txns t
     set occurred_at = new.purchased_on::timestamptz
    from public.purchase_items pi
   where pi.purchase_id = new.id and t.purchase_item_id = pi.id;
  return new;
end;
$$;

create trigger purchases_sync_date
after update of purchased_on on public.purchases
for each row when (old.purchased_on is distinct from new.purchased_on)
execute function public.sync_purchase_date_txn();
