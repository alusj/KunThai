-- Marketplace buyer backend additions for KunThai.
-- Run after marketplace_seller_schema.sql in the Supabase SQL editor.

create extension if not exists "pgcrypto";

alter table public.marketplace_orders add column if not exists buyer_id uuid references auth.users(id) on delete set null;
alter table public.marketplace_orders add column if not exists buyer_name text not null default '';
alter table public.marketplace_orders add column if not exists product_id uuid references public.marketplace_products(id) on delete set null;
alter table public.marketplace_orders add column if not exists preview text not null default '';
alter table public.marketplace_orders add column if not exists item_count integer not null default 0;
alter table public.marketplace_orders add column if not exists delivery_location text not null default '';
alter table public.marketplace_customer_messages add column if not exists buyer_id uuid references auth.users(id) on delete set null;
alter table public.marketplace_customer_messages add column if not exists product_id uuid references public.marketplace_products(id) on delete set null;
alter table public.marketplace_customer_messages add column if not exists product_name text not null default '';
alter table public.marketplace_customer_messages add column if not exists conversation_key text not null default '';
alter table public.marketplace_customer_messages add column if not exists sender_role text not null default 'buyer'
  check (sender_role in ('buyer', 'seller'));
alter table public.marketplace_reviews add column if not exists buyer_id uuid references auth.users(id) on delete set null;
alter table public.marketplace_reviews add column if not exists product_id uuid references public.marketplace_products(id) on delete set null;
alter table public.marketplace_reviews add column if not exists review_type text not null default 'marketplace'
  check (review_type in ('product', 'marketplace'));

create table if not exists public.marketplace_cart_items (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(buyer_id, product_id)
);

create table if not exists public.marketplace_saved_products (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(buyer_id, product_id)
);

create table if not exists public.marketplace_saved_sellers (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(buyer_id, business_id)
);

create table if not exists public.marketplace_buyer_delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Resident'
    check (category in ('Resident', 'Office', 'Market', 'School', 'Other')),
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

create table if not exists public.marketplace_buyer_hidden_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(buyer_id, order_id)
);

alter table public.marketplace_buyer_delivery_addresses add column if not exists custom_category text not null default '';
alter table public.marketplace_buyer_delivery_addresses drop constraint if exists marketplace_buyer_delivery_addresses_buyer_id_key;
alter table public.marketplace_buyer_delivery_addresses drop constraint if exists marketplace_buyer_delivery_addresses_category_check;
alter table public.marketplace_buyer_delivery_addresses add constraint marketplace_buyer_delivery_addresses_category_check
  check (category in ('Resident', 'Office', 'Market', 'School', 'Other'));

alter table public.marketplace_cart_items enable row level security;
alter table public.marketplace_saved_products enable row level security;
alter table public.marketplace_saved_sellers enable row level security;
alter table public.marketplace_buyer_delivery_addresses enable row level security;
alter table public.marketplace_buyer_hidden_orders enable row level security;

drop policy if exists "buyers read active marketplace products" on public.marketplace_products;
drop policy if exists "buyers read discoverable marketplace businesses" on public.marketplace_businesses;
drop policy if exists "buyers read marketplace business categories" on public.marketplace_business_categories;
drop policy if exists "buyers manage own cart items" on public.marketplace_cart_items;
drop policy if exists "buyers manage own saved products" on public.marketplace_saved_products;
drop policy if exists "buyers manage own saved sellers" on public.marketplace_saved_sellers;
drop policy if exists "buyers manage own delivery address" on public.marketplace_buyer_delivery_addresses;
drop policy if exists "buyers manage own hidden orders" on public.marketplace_buyer_hidden_orders;
drop policy if exists "buyers create own marketplace orders" on public.marketplace_orders;
drop policy if exists "buyers read own marketplace orders" on public.marketplace_orders;
drop policy if exists "buyers manage own marketplace messages" on public.marketplace_customer_messages;
drop policy if exists "buyers create marketplace reviews" on public.marketplace_reviews;
drop policy if exists "buyers read marketplace reviews" on public.marketplace_reviews;

create policy "buyers read active marketplace products"
on public.marketplace_products
for select
using (status = 'active' and stock > 0);

create policy "buyers read discoverable marketplace businesses"
on public.marketplace_businesses
for select
using (discoverable_nearby = true);

create policy "buyers read marketplace business categories"
on public.marketplace_business_categories
for select
using (
  exists (
    select 1
    from public.marketplace_businesses b
    where b.id = business_id
      and b.discoverable_nearby = true
  )
);

create policy "buyers manage own cart items"
on public.marketplace_cart_items
for all
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);

create policy "buyers manage own saved products"
on public.marketplace_saved_products
for all
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);

create policy "buyers manage own saved sellers"
on public.marketplace_saved_sellers
for all
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);

create policy "buyers manage own delivery address"
on public.marketplace_buyer_delivery_addresses
for all
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);

create policy "buyers manage own hidden orders"
on public.marketplace_buyer_hidden_orders
for all
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);

create policy "buyers create own marketplace orders"
on public.marketplace_orders
for insert
with check (auth.uid() = buyer_id);

create policy "buyers read own marketplace orders"
on public.marketplace_orders
for select
using (auth.uid() = buyer_id);

create policy "buyers manage own marketplace messages"
on public.marketplace_customer_messages
for all
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);

create index if not exists marketplace_customer_messages_buyer_conversation_idx
on public.marketplace_customer_messages (buyer_id, conversation_key, created_at);

create index if not exists marketplace_customer_messages_business_conversation_idx
on public.marketplace_customer_messages (business_id, conversation_key, created_at);

create index if not exists marketplace_saved_sellers_buyer_created_idx
on public.marketplace_saved_sellers (buyer_id, created_at desc);

create policy "buyers create marketplace reviews"
on public.marketplace_reviews
for insert
with check (auth.uid() = buyer_id);

create policy "buyers read marketplace reviews"
on public.marketplace_reviews
for select
using (true);

create or replace function public.increment_marketplace_product_view(product_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.marketplace_products
  set views = views + 1,
      updated_at = now()
  where id = product_id
    and status = 'active'
    and stock > 0;
$$;
