-- UrRide passenger saved places (Home, Work, pickup points...).
--
-- Until now these lived only in the device's localStorage, so a photo of the
-- front of the place could exceed the storage quota and the save silently
-- failed, and nothing followed the passenger to another device. This mirrors
-- marketplace_buyer_delivery_addresses so UrMall delivery addresses and UrRide
-- saved places share one model and one experience.

create table if not exists public.transport_passenger_saved_places (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null default 'Home',
  custom_category text not null default '',
  place_name text not null default '',
  contact_name text not null default '',
  phone text not null default '',
  street text not null default '',
  note text not null default '',
  -- A small compressed JPEG data URL (the client downsizes before saving).
  front_picture_url text not null default '',
  detected_address text not null default '',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_passenger_saved_places_category_check
    check (category in ('Home', 'Work', 'School', 'Market', 'Bus stop', 'Other')),
  constraint transport_passenger_saved_places_picture_size_check
    check (char_length(front_picture_url) <= 600000),
  constraint transport_passenger_saved_places_has_address_check
    check (char_length(btrim(street)) > 0 or char_length(btrim(detected_address)) > 0)
);

create index if not exists transport_passenger_saved_places_passenger_idx
  on public.transport_passenger_saved_places (passenger_id, updated_at desc);

alter table public.transport_passenger_saved_places enable row level security;

drop policy if exists "passengers read own saved places" on public.transport_passenger_saved_places;
drop policy if exists "passengers insert own saved places" on public.transport_passenger_saved_places;
drop policy if exists "passengers update own saved places" on public.transport_passenger_saved_places;
drop policy if exists "passengers delete own saved places" on public.transport_passenger_saved_places;

create policy "passengers read own saved places"
on public.transport_passenger_saved_places
for select
to authenticated
using (auth.uid() = passenger_id);

create policy "passengers insert own saved places"
on public.transport_passenger_saved_places
for insert
to authenticated
with check (auth.uid() = passenger_id);

create policy "passengers update own saved places"
on public.transport_passenger_saved_places
for update
to authenticated
using (auth.uid() = passenger_id)
with check (auth.uid() = passenger_id);

create policy "passengers delete own saved places"
on public.transport_passenger_saved_places
for delete
to authenticated
using (auth.uid() = passenger_id);

grant select, insert, update, delete on public.transport_passenger_saved_places to authenticated;
