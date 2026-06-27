-- Keeps seller dashboard fields and notification actions backed by real columns.

alter table if exists public.marketplace_businesses
  add column if not exists website_url text,
  add column if not exists country_iso text,
  add column if not exists currency text,
  add column if not exists operating_days text[] default array['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  add column if not exists open_time time,
  add column if not exists close_time time,
  add column if not exists discoverable_nearby boolean not null default true,
  add column if not exists whatsapp_enabled boolean not null default false,
  add column if not exists whatsapp text,
  add column if not exists business_type text not null default 'both',
  add column if not exists delivery_enabled boolean not null default true,
  add column if not exists pickup_enabled boolean not null default true,
  add column if not exists logo_url text,
  add column if not exists banner_url text,
  add column if not exists readiness_score integer not null default 0;

alter table if exists public.marketplace_products
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists product_attributes jsonb not null default '{}'::jsonb,
  add column if not exists tier_pricing jsonb not null default '[]'::jsonb,
  add column if not exists country text,
  add column if not exists country_iso text,
  add column if not exists currency text;

alter table if exists public.marketplace_activities
  add column if not exists product_id uuid,
  add column if not exists action_target text,
  add column if not exists dismissed_at timestamptz;

do $$
begin
  if to_regclass('public.marketplace_activities') is not null then
    create index if not exists marketplace_activities_business_dismissed_idx
      on public.marketplace_activities (business_id, dismissed_at, created_at desc);
  end if;

  if to_regclass('public.marketplace_products') is not null
    and to_regclass('public.marketplace_businesses') is not null
  then
    update public.marketplace_products p
      set user_id = b.user_id
      from public.marketplace_businesses b
      where p.business_id = b.id
        and p.user_id is null;

    create index if not exists marketplace_products_business_status_idx
      on public.marketplace_products (business_id, status, created_at desc);
  end if;

  if to_regclass('public.marketplace_activities') is not null
    and to_regclass('public.marketplace_products') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'marketplace_activities_product_id_fkey'
    )
  then
    alter table public.marketplace_activities
      add constraint marketplace_activities_product_id_fkey
      foreign key (product_id)
      references public.marketplace_products(id)
      on delete set null;
  end if;
end $$;

alter table if exists public.marketplace_products enable row level security;
alter table if exists public.marketplace_activities enable row level security;

drop policy if exists "business owners manage products" on public.marketplace_products;
create policy "business owners manage products" on public.marketplace_products
  for all
  using (
    exists (
      select 1
      from public.marketplace_businesses b
      where b.id = business_id
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.marketplace_businesses b
      where b.id = business_id
        and b.user_id = auth.uid()
    )
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists "business owners manage activities" on public.marketplace_activities;
create policy "business owners manage activities" on public.marketplace_activities
  for all
  using (
    exists (
      select 1
      from public.marketplace_businesses b
      where b.id = business_id
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.marketplace_businesses b
      where b.id = business_id
        and b.user_id = auth.uid()
    )
  );
