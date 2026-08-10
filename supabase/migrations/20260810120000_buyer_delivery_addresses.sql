-- Buyer delivery addresses for UrMall. The client service
-- (buyerMarketplaceService.js: fetch/save/deleteBuyerDeliveryAddress) already
-- reads and writes this table, but no migration ever created it — so saves and
-- especially DELETES could not persist (a deleted address reappeared on refresh
-- because the row was never actually removed / RLS did not permit it). This
-- creates the table with per-owner RLS covering select/insert/update/delete.

create table if not exists public.marketplace_buyer_delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Resident',
  custom_category text not null default '',
  full_name text not null default '',
  phone text not null default '',
  street text not null default '',
  delivery_note text not null default '',
  front_picture_url text not null default '',
  detected_address text not null default '',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_buyer_delivery_addresses_buyer_idx
  on public.marketplace_buyer_delivery_addresses (buyer_id, updated_at desc);

alter table public.marketplace_buyer_delivery_addresses enable row level security;

drop policy if exists "Buyers read own delivery addresses" on public.marketplace_buyer_delivery_addresses;
create policy "Buyers read own delivery addresses"
on public.marketplace_buyer_delivery_addresses for select to authenticated
using (buyer_id = auth.uid());

drop policy if exists "Buyers insert own delivery addresses" on public.marketplace_buyer_delivery_addresses;
create policy "Buyers insert own delivery addresses"
on public.marketplace_buyer_delivery_addresses for insert to authenticated
with check (buyer_id = auth.uid());

drop policy if exists "Buyers update own delivery addresses" on public.marketplace_buyer_delivery_addresses;
create policy "Buyers update own delivery addresses"
on public.marketplace_buyer_delivery_addresses for update to authenticated
using (buyer_id = auth.uid())
with check (buyer_id = auth.uid());

drop policy if exists "Buyers delete own delivery addresses" on public.marketplace_buyer_delivery_addresses;
create policy "Buyers delete own delivery addresses"
on public.marketplace_buyer_delivery_addresses for delete to authenticated
using (buyer_id = auth.uid());

grant select, insert, update, delete on public.marketplace_buyer_delivery_addresses to authenticated;
