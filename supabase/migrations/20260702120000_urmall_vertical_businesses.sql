alter table if exists public.marketplace_businesses
  add column if not exists business_kind text not null default 'retail';

do $$ begin
  alter table public.marketplace_businesses
    add constraint marketplace_businesses_kind_check
    check (business_kind in ('retail', 'restaurant', 'hotel', 'property_agent'));
exception when duplicate_object then null;
end $$;

-- Older UrMall installs used a one-business-per-user unique constraint. Keep
-- user_id as the owner, but allow the same owner to create multiple workspaces.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'marketplace_businesses'
      and constraint_type = 'UNIQUE'
  loop
    if (
      select array_agg(column_name::text order by ordinal_position)
      from information_schema.key_column_usage
      where table_schema = 'public'
        and table_name = 'marketplace_businesses'
        and constraint_name = constraint_row.constraint_name
    ) = array['user_id']::text[] then
      execute format('alter table public.marketplace_businesses drop constraint %I', constraint_row.constraint_name);
    end if;
  end loop;
end;
$$;

create index if not exists marketplace_businesses_owner_updated_idx
  on public.marketplace_businesses (user_id, updated_at desc);
create index if not exists marketplace_businesses_kind_country_idx
  on public.marketplace_businesses (business_kind, country_iso, updated_at desc);

create table if not exists public.marketplace_business_members (
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager', 'staff')),
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

insert into public.marketplace_business_members (business_id, user_id, role, status)
select business.id, business.user_id, 'owner', 'active'
from public.marketplace_businesses business
where business.user_id is not null
on conflict (business_id, user_id) do update set role = 'owner', status = 'active', updated_at = now();

create or replace function public.marketplace_add_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.marketplace_business_members (business_id, user_id, role, status)
  values (new.id, new.user_id, 'owner', 'active')
  on conflict (business_id, user_id) do update set role = 'owner', status = 'active', updated_at = now();
  return new;
end;
$$;

drop trigger if exists marketplace_business_owner_membership on public.marketplace_businesses;
create trigger marketplace_business_owner_membership
after insert on public.marketplace_businesses
for each row execute function public.marketplace_add_owner_membership();

create table if not exists public.marketplace_restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  meal_period text not null default 'all_day' check (meal_period in ('breakfast', 'lunch', 'dinner', 'drinks', 'all_day')),
  name text not null,
  description text not null default '',
  price numeric(14,2) not null check (price >= 0),
  image_url text,
  preparation_minutes integer not null default 20 check (preparation_minutes between 0 and 480),
  available boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_menu_business_day_idx
  on public.marketplace_restaurant_menu_items (business_id, day_of_week, available, sort_order);

create table if not exists public.marketplace_hotel_images (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  image_url text not null,
  caption text not null default '',
  is_cover boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_hotel_rooms (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  name text not null,
  description text not null default '',
  nightly_rate numeric(14,2) not null check (nightly_rate >= 0),
  capacity integer not null default 1 check (capacity between 1 and 50),
  rooms_available integer not null default 1 check (rooms_available >= 0),
  amenities text[] not null default '{}'::text[],
  image_urls text[] not null default '{}'::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hotel_images_business_sort_idx on public.marketplace_hotel_images (business_id, is_cover desc, sort_order);
create index if not exists hotel_rooms_business_active_idx on public.marketplace_hotel_rooms (business_id, active, nightly_rate);

create table if not exists public.marketplace_property_listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  title text not null,
  description text not null default '',
  purpose text not null check (purpose in ('rent', 'sale')),
  property_type text not null check (property_type in ('house', 'apartment', 'land', 'commercial')),
  price numeric(16,2) not null check (price >= 0),
  rent_period text check (rent_period is null or rent_period in ('day', 'week', 'month', 'year')),
  bedrooms integer not null default 0 check (bedrooms >= 0),
  bathrooms integer not null default 0 check (bathrooms >= 0),
  furnished boolean not null default false,
  address text not null default '',
  city text not null default '',
  latitude double precision,
  longitude double precision,
  image_urls text[] not null default '{}'::text[],
  amenities text[] not null default '{}'::text[],
  availability_status text not null default 'available' check (availability_status in ('available', 'under_offer', 'rented', 'sold')),
  authorization_status text not null default 'pending' check (authorization_status in ('pending', 'verified', 'rejected')),
  published boolean not null default false,
  expires_at timestamptz not null default (now() + interval '60 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_listing_discovery_idx
  on public.marketplace_property_listings (purpose, property_type, availability_status, created_at desc)
  where published = true;
create index if not exists property_listing_business_idx on public.marketplace_property_listings (business_id, updated_at desc);

alter table public.marketplace_business_members enable row level security;
alter table public.marketplace_restaurant_menu_items enable row level security;
alter table public.marketplace_hotel_images enable row level security;
alter table public.marketplace_hotel_rooms enable row level security;
alter table public.marketplace_property_listings enable row level security;

drop policy if exists "business members read own memberships" on public.marketplace_business_members;
create policy "business members read own memberships" on public.marketplace_business_members
for select to authenticated using (user_id = auth.uid() or exists (
  select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid()
));

drop policy if exists "business owners manage memberships" on public.marketplace_business_members;
create policy "business owners manage memberships" on public.marketplace_business_members
for all to authenticated using (exists (
  select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid()
)) with check (exists (
  select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid()
));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'marketplace_restaurant_menu_items', 'marketplace_hotel_images',
    'marketplace_hotel_rooms', 'marketplace_property_listings'
  ] loop
    execute format('drop policy if exists "owners manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "owners manage %s" on public.%I for all to authenticated using (exists (select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid())) with check (exists (select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid()))',
      table_name, table_name
    );
  end loop;
end;
$$;

drop policy if exists "buyers read restaurant menus" on public.marketplace_restaurant_menu_items;
create policy "buyers read restaurant menus" on public.marketplace_restaurant_menu_items
for select using (available = true and exists (
  select 1 from public.marketplace_businesses business
  where business.id = business_id and business.verification_status in ('verified', 'approved')
));
drop policy if exists "buyers read hotel images" on public.marketplace_hotel_images;
create policy "buyers read hotel images" on public.marketplace_hotel_images for select using (exists (
  select 1 from public.marketplace_businesses business
  where business.id = business_id and business.verification_status in ('verified', 'approved')
));
drop policy if exists "buyers read hotel rooms" on public.marketplace_hotel_rooms;
create policy "buyers read hotel rooms" on public.marketplace_hotel_rooms for select using (active = true and rooms_available > 0 and exists (
  select 1 from public.marketplace_businesses business
  where business.id = business_id and business.verification_status in ('verified', 'approved')
));
drop policy if exists "buyers read property listings" on public.marketplace_property_listings;
create policy "buyers read property listings" on public.marketplace_property_listings
for select using (published = true and authorization_status = 'verified' and availability_status = 'available' and expires_at > now() and exists (
  select 1 from public.marketplace_businesses business
  where business.id = business_id and business.verification_status in ('verified', 'approved')
));

grant select on public.marketplace_restaurant_menu_items, public.marketplace_hotel_images,
  public.marketplace_hotel_rooms, public.marketplace_property_listings to anon, authenticated;
grant select, insert, update, delete on public.marketplace_business_members,
  public.marketplace_restaurant_menu_items, public.marketplace_hotel_images,
  public.marketplace_hotel_rooms, public.marketplace_property_listings to authenticated;

create or replace function public.marketplace_require_registration_documents()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verification_status in ('verified', 'approved')
     and old.verification_status is distinct from new.verification_status then
    if not exists (
      select 1 from public.marketplace_business_documents document
      where document.business_id = new.id and document.document_type = 'id'
    ) or not exists (
      select 1 from public.marketplace_business_documents document
      where document.business_id = new.id and document.document_type = 'business'
    ) then
      raise exception 'Both identity and business registration documents are required before approval.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_business_required_documents on public.marketplace_businesses;
create trigger marketplace_business_required_documents
before update of verification_status on public.marketplace_businesses
for each row execute function public.marketplace_require_registration_documents();

comment on column public.marketplace_businesses.business_kind is
  'Primary UrMall workspace: retail, restaurant, hotel, or property_agent. Secondary categories remain separate.';

do $$ begin
  if to_regclass('public.admin_cases') is not null
     and to_regprocedure('public.admin_capture_source_case()') is not null then
    drop trigger if exists admin_intake_marketplace_property_listings on public.marketplace_property_listings;
    create trigger admin_intake_marketplace_property_listings
      after insert or update on public.marketplace_property_listings
      for each row execute function public.admin_capture_source_case(
        'marketplace_property_listing', 'marketplace', 'content_safety', 'property_listing_review'
      );
  end if;
end $$;

create or replace function public.admin_sync_property_listing_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resource_type = 'marketplace_property_listing'
     and new.resolution_code is distinct from old.resolution_code
     and new.resolution_code in ('approve', 'reject') then
    update public.marketplace_property_listings
    set authorization_status = case when new.resolution_code = 'approve' then 'verified' else 'rejected' end,
        published = new.resolution_code = 'approve',
        updated_at = now()
    where id = new.resource_id;
  end if;
  return new;
end;
$$;

do $$ begin
  if to_regclass('public.admin_cases') is not null then
    drop trigger if exists admin_sync_property_listing_decision_trigger on public.admin_cases;
    create trigger admin_sync_property_listing_decision_trigger
      after update of resolution_code on public.admin_cases
      for each row execute function public.admin_sync_property_listing_decision();
  end if;
end $$;
