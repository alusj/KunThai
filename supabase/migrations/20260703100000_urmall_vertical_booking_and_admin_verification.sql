-- Vertical booking requests, live marketplace refresh, and admin-owned verification.

create table if not exists public.marketplace_vertical_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid,
  listing_type text not null check (listing_type in ('hotel', 'property')),
  listing_name text not null default '',
  buyer_name text not null,
  phone text not null,
  start_date date not null,
  end_date date,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index if not exists marketplace_vertical_bookings_business_created_idx
  on public.marketplace_vertical_bookings (business_id, created_at desc);
create index if not exists marketplace_vertical_bookings_buyer_created_idx
  on public.marketplace_vertical_bookings (buyer_id, created_at desc);

alter table public.marketplace_vertical_bookings enable row level security;

drop policy if exists "buyers create vertical bookings" on public.marketplace_vertical_bookings;
create policy "buyers create vertical bookings"
on public.marketplace_vertical_bookings for insert to authenticated
with check (buyer_id = auth.uid());

drop policy if exists "buyers read own vertical bookings" on public.marketplace_vertical_bookings;
create policy "buyers read own vertical bookings"
on public.marketplace_vertical_bookings for select to authenticated
using (buyer_id = auth.uid());

drop policy if exists "business owners manage vertical bookings" on public.marketplace_vertical_bookings;
create policy "business owners manage vertical bookings"
on public.marketplace_vertical_bookings for all to authenticated
using (exists (
  select 1 from public.marketplace_businesses business
  where business.id = business_id and business.user_id = auth.uid()
))
with check (exists (
  select 1 from public.marketplace_businesses business
  where business.id = business_id and business.user_id = auth.uid()
));

grant select, insert, update on public.marketplace_vertical_bookings to authenticated;

-- A published property is a buyer-visible listing. Business verification remains
-- a separate admin decision and is displayed by the shared UrMall trust UI.
drop policy if exists "buyers read property listings" on public.marketplace_property_listings;
create policy "buyers read property listings"
on public.marketplace_property_listings for select to anon, authenticated
using (published = true and availability_status = 'available' and expires_at > now());

-- Sellers may create and edit their business, but only an administrator with the
-- marketplace verification permission may assign an approved/verified state.
create or replace function public.guard_marketplace_business_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.admin_has_permission('marketplace.verify', 'marketplace') then
    if tg_op = 'INSERT' then
      if new.verification_status in ('verified', 'approved') then
        new.verification_status := 'pending';
      end if;
    else
      new.verification_status := old.verification_status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_marketplace_business_admin_fields_trigger on public.marketplace_businesses;
create trigger guard_marketplace_business_admin_fields_trigger
before insert or update on public.marketplace_businesses
for each row execute function public.guard_marketplace_business_admin_fields();

revoke all on function public.guard_marketplace_business_admin_fields() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'marketplace_vertical_bookings',
    'marketplace_restaurant_menu_items',
    'marketplace_hotel_images',
    'marketplace_hotel_rooms',
    'marketplace_property_listings',
    'marketplace_customer_messages',
    'marketplace_reviews',
    'marketplace_orders'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
