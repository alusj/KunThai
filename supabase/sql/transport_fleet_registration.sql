create extension if not exists pgcrypto;

do $$ begin
  create type transport_service_category as enum ('transport', 'delivery', 'both');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type transport_fleet_type as enum ('car', 'motorcycle', 'tricycle');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type transport_verification_status as enum (
    'not_verified',
    'verification_pending',
    'verified',
    'verified_recommended'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type nearby_location_status as enum (
    'community_added',
    'under_review',
    'verified',
    'trusted_recommended'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists transport_operators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  operator_code char(5) not null unique check (operator_code ~ '^[0-9]{5}$'),
  display_code text generated always as ('KT-' || operator_code) stored,
  full_name text not null,
  phone text not null,
  city text,
  emergency_contact text,
  account_status text not null default 'pending_review',
  documents_skipped boolean not null default false,
  verification_status transport_verification_status not null default 'verification_pending',
  verification_note text,
  profile_completed_at timestamptz,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transport_fleets (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references transport_operators(id) on delete cascade,
  service_category transport_service_category not null,
  fleet_type transport_fleet_type not null,
  fleet_name text,
  plate_number text not null,
  make text,
  model text,
  manufacture_year int check (manufacture_year between 1950 and extract(year from now())::int + 1),
  color text,
  operating_area text,
  availability text,
  home_base_location text,
  fuel_type text,
  car_body_type text,
  max_load text,
  delivery_body_type text,
  base_fare numeric(12, 2),
  safety_answers jsonb not null default '{}'::jsonb,
  verification_status transport_verification_status not null default 'verification_pending',
  active_status text not null default 'offline' check (active_status in ('active', 'offline')),
  current_location_name text,
  current_latitude numeric(10, 7),
  current_longitude numeric(10, 7),
  last_known_location_name text,
  last_active_at timestamptz,
  rating numeric(2, 1) check (rating between 0 and 5),
  completed_jobs int not null default 0,
  price_hint text,
  is_visible_to_passengers boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator_id, plate_number)
);

alter table transport_fleets
  add column if not exists home_base_location text,
  add column if not exists fuel_type text,
  add column if not exists car_body_type text,
  add column if not exists max_load text,
  add column if not exists delivery_body_type text,
  add column if not exists base_fare numeric(12, 2),
  add column if not exists safety_answers jsonb not null default '{}'::jsonb,
  add column if not exists verification_status transport_verification_status not null default 'verification_pending',
  add column if not exists active_status text not null default 'offline',
  add column if not exists current_location_name text,
  add column if not exists current_latitude numeric(10, 7),
  add column if not exists current_longitude numeric(10, 7),
  add column if not exists last_known_location_name text,
  add column if not exists last_active_at timestamptz,
  add column if not exists rating numeric(2, 1),
  add column if not exists completed_jobs int not null default 0,
  add column if not exists price_hint text,
  add column if not exists is_visible_to_passengers boolean not null default true;

alter table transport_operators
  add column if not exists account_status text not null default 'pending_review',
  add column if not exists documents_skipped boolean not null default false;

do $$ begin
  alter table transport_fleets
    add constraint transport_fleets_active_status_check
    check (active_status in ('active', 'offline'));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table transport_fleets
    add constraint transport_fleets_rating_check
    check (rating between 0 and 5);
exception
  when duplicate_object then null;
end $$;

create table if not exists transport_fleet_images (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null references transport_fleets(id) on delete cascade,
  image_type text not null check (image_type in ('front', 'back', 'left_side', 'right_side', 'interior', 'delivery_storage', 'other')),
  file_url text not null,
  uploaded_at timestamptz not null default now(),
  unique (fleet_id, image_type)
);

create table if not exists transport_operator_documents (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references transport_operators(id) on delete cascade,
  fleet_id uuid references transport_fleets(id) on delete cascade,
  document_type text not null,
  file_url text not null,
  status transport_verification_status not null default 'verification_pending',
  admin_note text,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create table if not exists nearby_locations (
  id uuid primary key default gen_random_uuid(),
  added_by uuid references auth.users(id) on delete set null,
  name text not null,
  category text not null,
  place_type text,
  street_address text,
  landmark text,
  phone text,
  opening_hours text,
  usefulness_note text,
  safety_tags text[] not null default '{}',
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  status nearby_location_status not null default 'under_review',
  is_visible_to_passengers boolean not null default true,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nearby_location_photos (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references nearby_locations(id) on delete cascade,
  file_url text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create table if not exists transport_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  label text not null,
  phone text not null,
  contact_type text not null default 'trusted_contact',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists transport_trips (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid references auth.users(id) on delete set null,
  fleet_id uuid references transport_fleets(id) on delete set null,
  trip_mode text not null check (trip_mode in ('ride', 'delivery')),
  status text not null default 'pending_confirmation',
  pickup_label text,
  pickup_latitude numeric(10, 7),
  pickup_longitude numeric(10, 7),
  destination_label text,
  destination_latitude numeric(10, 7),
  destination_longitude numeric(10, 7),
  fare_amount numeric(12, 2),
  fare_currency text not null default 'SLE',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists passenger_saved_operators (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references transport_fleets(id) on delete cascade,
  saved_label text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (passenger_id, fleet_id)
);

create index if not exists transport_operators_code_idx on transport_operators (operator_code);
create index if not exists transport_fleets_plate_idx on transport_fleets (plate_number);
create index if not exists transport_fleets_category_type_idx on transport_fleets (service_category, fleet_type);
create index if not exists transport_fleets_visible_status_idx on transport_fleets (is_visible_to_passengers, verification_status);
create index if not exists transport_fleets_active_distance_idx on transport_fleets (active_status, fleet_type, service_category);
create index if not exists nearby_locations_category_status_idx on nearby_locations (category, status);
create index if not exists nearby_locations_visible_idx on nearby_locations (is_visible_to_passengers);
create index if not exists transport_trips_passenger_status_idx on transport_trips (passenger_id, status);
create index if not exists passenger_saved_operators_passenger_idx on passenger_saved_operators (passenger_id);

create or replace view passenger_visible_transport_fleets as
select
  f.id,
  o.display_code as operator_code,
  o.full_name as operator_name,
  f.service_category,
  f.fleet_type,
  f.fleet_name,
  f.plate_number,
  f.operating_area,
  f.home_base_location,
  f.delivery_body_type,
  f.verification_status,
  f.active_status,
  f.current_location_name,
  f.last_known_location_name,
  f.last_active_at,
  f.rating,
  f.completed_jobs,
  f.base_fare,
  f.price_hint,
  f.created_at
from transport_fleets f
join transport_operators o on o.id = f.operator_id
where f.is_visible_to_passengers = true;

create or replace view passenger_visible_nearby_locations as
select
  id,
  name,
  category,
  place_type,
  street_address,
  landmark,
  phone,
  opening_hours,
  usefulness_note,
  safety_tags,
  latitude,
  longitude,
  status,
  created_at
from nearby_locations
where is_visible_to_passengers = true;

alter table transport_operators enable row level security;
alter table transport_fleets enable row level security;
alter table transport_fleet_images enable row level security;
alter table transport_operator_documents enable row level security;
alter table nearby_locations enable row level security;
alter table nearby_location_photos enable row level security;
alter table transport_emergency_contacts enable row level security;
alter table transport_trips enable row level security;
alter table passenger_saved_operators enable row level security;

drop policy if exists "operators can read own profile" on transport_operators;
create policy "operators can read own profile"
  on transport_operators for select
  using (auth.uid() = user_id);

drop policy if exists "passengers can read visible fleets" on transport_fleets;
create policy "passengers can read visible fleets"
  on transport_fleets for select
  using (is_visible_to_passengers = true);

drop policy if exists "passengers can read visible nearby locations" on nearby_locations;
create policy "passengers can read visible nearby locations"
  on nearby_locations for select
  using (is_visible_to_passengers = true);

drop policy if exists "users can add nearby locations" on nearby_locations;
create policy "users can add nearby locations"
  on nearby_locations for insert
  with check (auth.uid() = added_by);

drop policy if exists "users can manage own emergency contacts" on transport_emergency_contacts;
create policy "users can manage own emergency contacts"
  on transport_emergency_contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "passengers can manage own trips" on transport_trips;
create policy "passengers can manage own trips"
  on transport_trips for all
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

drop policy if exists "passengers can manage saved operators" on passenger_saved_operators;
create policy "passengers can manage saved operators"
  on passenger_saved_operators for all
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);
