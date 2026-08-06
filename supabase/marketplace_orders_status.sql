-- Optional UrMall order status support.
-- Run this in Supabase SQL editor if you want order status updates to track updated_at
-- and ensure buyers/sellers can update only the order rows they own.

alter table if exists public.marketplace_orders
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_marketplace_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_marketplace_orders_updated_at on public.marketplace_orders;
create trigger set_marketplace_orders_updated_at
before update on public.marketplace_orders
for each row
execute function public.set_marketplace_orders_updated_at();

alter table if exists public.marketplace_orders enable row level security;

drop policy if exists "Buyers can cancel their pending marketplace orders" on public.marketplace_orders;
create policy "Buyers can cancel their pending marketplace orders"
on public.marketplace_orders
for update
to authenticated
using (buyer_id = auth.uid() and status = 'pending')
with check (buyer_id = auth.uid() and status in ('pending', 'cancelled'));

drop policy if exists "Sellers can update their marketplace order status" on public.marketplace_orders;
create policy "Sellers can update their marketplace order status"
on public.marketplace_orders
for update
to authenticated
using (
  exists (
    select 1
    from public.marketplace_businesses business
    where business.id = marketplace_orders.business_id
      and business.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.marketplace_businesses business
    where business.id = marketplace_orders.business_id
      and business.user_id = auth.uid()
  )
  and status in ('pending', 'shipped', 'completed', 'cancelled', 'refunded')
);
