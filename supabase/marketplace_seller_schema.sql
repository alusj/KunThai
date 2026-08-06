-- Marketplace seller backend tables for KunThai.
-- Run this once in the Supabase SQL editor for project gwiqnoymozmvzhfjvysy.

create extension if not exists "pgcrypto";

create table if not exists public.marketplace_businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  description text not null default '',
  country text not null default '',
  city text not null default '',
  address text not null default '',
  phone text not null default '',
  whatsapp_enabled boolean not null default false,
  whatsapp text not null default '',
  email text not null default '',
  website_url text not null default '',
  discoverable_nearby boolean not null default true,
  latitude double precision,
  longitude double precision,
  business_type text not null default 'both',
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  operating_days jsonb not null default '["Mon", "Tue", "Wed", "Thu", "Fri"]'::jsonb,
  open_time time,
  close_time time,
  logo_url text,
  banner_url text,
  verification_status text not null default 'pending',
  readiness_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.marketplace_business_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now(),
  unique(business_id, category)
);

alter table public.marketplace_businesses add column if not exists website_url text not null default '';
alter table public.marketplace_businesses add column if not exists operating_days jsonb not null default '["Mon", "Tue", "Wed", "Thu", "Fri"]'::jsonb;

create table if not exists public.marketplace_business_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  document_type text not null,
  file_name text not null default '',
  file_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_payout_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  method_type text not null default 'skipped',
  kunthai_money_connected boolean not null default false,
  bank_name text not null default '',
  account_number_mask text not null default '',
  account_name text not null default '',
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id)
);

create table if not exists public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default '',
  condition text not null default 'new',
  brand text not null default '',
  model text not null default '',
  product_attributes jsonb not null default '{}'::jsonb,
  tier_pricing jsonb not null default '[]'::jsonb,
  price numeric not null default 0,
  discount_price numeric,
  status text not null default 'draft',
  stock integer not null default 0,
  sku text not null default '',
  low_stock_alert integer not null default 3,
  allow_negotiation boolean not null default false,
  delivery_available boolean not null default true,
  pickup_available boolean not null default true,
  delivery_time text not null default '',
  location text not null default '',
  main_image_url text,
  image_urls jsonb not null default '[]'::jsonb,
  video_url text,
  views integer not null default 0,
  sales integer not null default 0,
  revenue numeric not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_products add column if not exists description text not null default '';
alter table public.marketplace_products add column if not exists category text not null default '';
alter table public.marketplace_products add column if not exists condition text not null default 'new';
alter table public.marketplace_products add column if not exists brand text not null default '';
alter table public.marketplace_products add column if not exists model text not null default '';
alter table public.marketplace_products add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.marketplace_products add column if not exists product_attributes jsonb not null default '{}'::jsonb;
alter table public.marketplace_products add column if not exists tier_pricing jsonb not null default '[]'::jsonb;
alter table public.marketplace_products add column if not exists discount_price numeric;
alter table public.marketplace_products add column if not exists sku text not null default '';
alter table public.marketplace_products add column if not exists low_stock_alert integer not null default 3;
alter table public.marketplace_products add column if not exists allow_negotiation boolean not null default false;
alter table public.marketplace_products add column if not exists delivery_available boolean not null default true;
alter table public.marketplace_products add column if not exists pickup_available boolean not null default true;
alter table public.marketplace_products add column if not exists delivery_time text not null default '';
alter table public.marketplace_products add column if not exists location text not null default '';
alter table public.marketplace_products add column if not exists main_image_url text;
alter table public.marketplace_products add column if not exists image_urls jsonb not null default '[]'::jsonb;
alter table public.marketplace_products add column if not exists video_url text;
alter table public.marketplace_products add column if not exists published_at timestamptz;

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  status text not null default 'pending',
  total_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_customer_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  buyer_name text not null default '',
  topic text not null default '',
  preview text not null default '',
  message_type text not null default 'message',
  unread boolean not null default true,
  support_dispute boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  name text not null,
  product_name text not null default '',
  discount_label text not null default '',
  budget_spent numeric not null default 0,
  budget_limit numeric not null default 0,
  views integer not null default 0,
  orders integer not null default 0,
  revenue numeric not null default 0,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  buyer_name text not null default '',
  product_name text not null default '',
  rating integer not null default 0,
  comment text not null default '',
  response text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_payout_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_activities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  activity_type text not null default 'system',
  title text not null,
  description text not null default '',
  status text not null default 'completed',
  meta text not null default '',
  action_label text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_seller_verification_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  request_type text not null default 'seller_verification',
  note text not null default '',
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_seller_cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  case_type text not null default 'support',
  title text not null default '',
  description text not null default '',
  priority text not null default 'normal',
  status text not null default 'open',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_businesses enable row level security;
alter table public.marketplace_business_categories enable row level security;
alter table public.marketplace_business_documents enable row level security;
alter table public.marketplace_payout_methods enable row level security;
alter table public.marketplace_products enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_customer_messages enable row level security;
alter table public.marketplace_promotions enable row level security;
alter table public.marketplace_reviews enable row level security;
alter table public.marketplace_payout_transactions enable row level security;
alter table public.marketplace_activities enable row level security;
alter table public.marketplace_seller_verification_requests enable row level security;
alter table public.marketplace_seller_cases enable row level security;

drop policy if exists "business owners manage businesses" on public.marketplace_businesses;
drop policy if exists "business owners manage categories" on public.marketplace_business_categories;
drop policy if exists "business owners manage documents" on public.marketplace_business_documents;
drop policy if exists "business owners manage payout methods" on public.marketplace_payout_methods;
drop policy if exists "business owners manage products" on public.marketplace_products;
drop policy if exists "business owners manage orders" on public.marketplace_orders;
drop policy if exists "business owners manage messages" on public.marketplace_customer_messages;
drop policy if exists "business owners manage promotions" on public.marketplace_promotions;
drop policy if exists "business owners manage reviews" on public.marketplace_reviews;
drop policy if exists "business owners manage payout transactions" on public.marketplace_payout_transactions;
drop policy if exists "business owners manage activities" on public.marketplace_activities;
drop policy if exists "business owners manage verification requests" on public.marketplace_seller_verification_requests;
drop policy if exists "business owners manage seller cases" on public.marketplace_seller_cases;
drop policy if exists "business owners upload marketplace media" on storage.objects;
drop policy if exists "business owners update marketplace media" on storage.objects;
drop policy if exists "business owners read marketplace media" on storage.objects;

create policy "business owners manage businesses" on public.marketplace_businesses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "business owners manage categories" on public.marketplace_business_categories
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage documents" on public.marketplace_business_documents
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage payout methods" on public.marketplace_payout_methods
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage products" on public.marketplace_products
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (
    exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid())
    and (user_id is null or user_id = auth.uid())
  );

create policy "business owners manage orders" on public.marketplace_orders
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage messages" on public.marketplace_customer_messages
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage promotions" on public.marketplace_promotions
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage reviews" on public.marketplace_reviews
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage payout transactions" on public.marketplace_payout_transactions
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage activities" on public.marketplace_activities
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage verification requests" on public.marketplace_seller_verification_requests
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

create policy "business owners manage seller cases" on public.marketplace_seller_cases
  for all using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('marketplace-business-media', 'marketplace-business-media', true)
on conflict (id) do nothing;

create policy "business owners upload marketplace media" on storage.objects
  for insert with check (bucket_id = 'marketplace-business-media' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "business owners update marketplace media" on storage.objects
  for update using (bucket_id = 'marketplace-business-media' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "business owners read marketplace media" on storage.objects
  for select using (bucket_id = 'marketplace-business-media');
