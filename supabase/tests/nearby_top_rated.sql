-- Run ONLY against an isolated, disposable nearby_test database:
-- createdb -h <host> -p <port> -U postgres nearby_test
-- psql -h <host> -p <port> -U postgres -d nearby_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/nearby_top_rated.sql
-- Stubs the tables the functions read, loads the real migration, asserts.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'nearby_test' then raise exception 'This fixture requires the disposable nearby_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

create table auth.users(id uuid primary key);

-- Production column types: fleet type / service category are enums.
create type public.transport_fleet_type as enum ('car', 'motorcycle', 'tricycle');
create table public.transport_operators(id uuid primary key, user_id uuid unique not null references auth.users, verification_status text);
create table public.transport_fleets(
  id uuid primary key, operator_id uuid references public.transport_operators, company_id uuid,
  is_visible_to_passengers boolean not null default true, active_status text default 'active',
  fleet_type public.transport_fleet_type default 'motorcycle', country_iso text default 'SL', verification_status text
);
create table public.transport_operator_locations(
  operator_id uuid primary key references auth.users, status text not null default 'online',
  lat double precision not null, lng double precision not null, last_seen_at timestamptz not null default now()
);
create table public.transport_operator_reviews(id uuid primary key default gen_random_uuid(), operator_id uuid, rating int);
create table public.transport_trips(id uuid primary key default gen_random_uuid(), fleet_id uuid, status text);

create table public.marketplace_businesses(id uuid primary key, latitude double precision, longitude double precision);
create table public.marketplace_business_locations(
  id uuid primary key default gen_random_uuid(), business_id uuid references public.marketplace_businesses,
  latitude double precision, longitude double precision
);

-- Distance helper from 20260927120000_urride_open_bookings.sql (unchanged).
create or replace function public.transport_open_booking_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371.0 * 2 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

\ir ../migrations/20261006120000_nearby_top_rated_and_urmall_distance.sql
\ir ../migrations/20261006130000_transport_fleet_distances.sql

-- Passenger in central Freetown. 0.009 deg latitude ~= 1 km.
-- f1: 1 km, one 5-star review (live)          -> pulled toward the area mean
-- f2: 2 km, twenty 5-star reviews (live)      -> best
-- f3: 3 km, ten 3-star reviews, last seen 2 h ago -> rated, "recent"
-- f4: 1.5 km, no reviews                      -> "new near you"
-- f5: 120 km away, 5 stars                    -> outside 50 km
-- f6: 1 km, Guinea                            -> other country, excluded
-- f7: 1 km, offline (active_status)           -> excluded
-- f8: 1 km, last seen 3 days ago              -> excluded (position too old)
-- f9: 1 km, hidden company fleet              -> excluded
do $$
declare
  i int;
  ids uuid[] := array[
    '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000009'
  ]::uuid[];
begin
  for i in 1..9 loop
    insert into auth.users values (ids[i]);
    insert into public.transport_operators values (ids[i], ids[i], 'not_verified');
    insert into public.transport_fleets(id, operator_id) values (ids[i], ids[i]);
  end loop;
end $$;

insert into public.transport_operator_locations(operator_id, lat, lng, last_seen_at, status) values
  ('00000000-0000-0000-0000-000000000001', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000002', 8.484 + 0.018, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000003', 8.484 + 0.027, -13.234, now() - interval '2 hours', 'offline'),
  ('00000000-0000-0000-0000-000000000004', 8.484 + 0.0135, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000005', 8.484 + 1.08, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000006', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000007', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000008', 8.484 + 0.009, -13.234, now() - interval '3 days', 'online'),
  ('00000000-0000-0000-0000-000000000009', 8.484 + 0.009, -13.234, now(), 'online');

update public.transport_fleets set country_iso = 'GN' where id = '00000000-0000-0000-0000-000000000006';
update public.transport_fleets set active_status = 'offline' where id = '00000000-0000-0000-0000-000000000007';
update public.transport_fleets set company_id = gen_random_uuid(), is_visible_to_passengers = false where id = '00000000-0000-0000-0000-000000000009';

insert into public.transport_operator_reviews(operator_id, rating) values ('00000000-0000-0000-0000-000000000001', 5);
insert into public.transport_operator_reviews(operator_id, rating) select '00000000-0000-0000-0000-000000000002', 5 from generate_series(1, 20);
insert into public.transport_operator_reviews(operator_id, rating) select '00000000-0000-0000-0000-000000000003', 3 from generate_series(1, 10);
insert into public.transport_operator_reviews(operator_id, rating) values
  ('00000000-0000-0000-0000-000000000005', 5), ('00000000-0000-0000-0000-000000000006', 5),
  ('00000000-0000-0000-0000-000000000007', 5), ('00000000-0000-0000-0000-000000000008', 5),
  ('00000000-0000-0000-0000-000000000009', 5);

do $$
declare
  rows_seen int;
  first_id uuid;
  second_id uuid;
  r record;
begin
  select count(*) into rows_seen from public.transport_top_rated_nearby(8.484, -13.234, 'sl');
  if rows_seen <> 4 then raise exception 'expected 4 nearby fleets (f1-f4), got %', rows_seen; end if;

  select fleet_id into first_id from public.transport_top_rated_nearby(8.484, -13.234, 'SL') limit 1;
  if first_id <> '00000000-0000-0000-0000-000000000002' then
    raise exception 'a long 5-star record must outrank a single 5-star review, got %', first_id;
  end if;

  select fleet_id into second_id from public.transport_top_rated_nearby(8.484, -13.234, 'SL') offset 1 limit 1;
  if second_id <> '00000000-0000-0000-0000-000000000001' then raise exception 'expected f1 second, got %', second_id; end if;

  select * into r from public.transport_top_rated_nearby(8.484, -13.234, 'SL')
  where fleet_id = '00000000-0000-0000-0000-000000000003';
  if r.location_source <> 'recent' or not r.is_rated then raise exception 'f3 should be rated with a recent position: %', r; end if;
  if r.distance_km <> 3.0 then raise exception 'distance should be rounded to 0.1 km, got %', r.distance_km; end if;

  select * into r from public.transport_top_rated_nearby(8.484, -13.234, 'SL')
  where fleet_id = '00000000-0000-0000-0000-000000000004';
  if r.is_rated or r.location_source <> 'live' then raise exception 'f4 should be an unrated live fleet: %', r; end if;

  select * into r from public.transport_top_rated_nearby(8.484, -13.234, 'SL') limit 1;
  if r.radius_km <> 50 then raise exception 'too few rated fleets for a small radius; expected 50, got %', r.radius_km; end if;

  select count(*) into rows_seen from public.transport_top_rated_nearby(8.484, -13.234, 'SL', 'car');
  if rows_seen <> 0 then raise exception 'fleet type filter failed, got % rows', rows_seen; end if;

  select count(*) into rows_seen from public.transport_top_rated_nearby(95, -13.234, 'SL');
  if rows_seen <> 0 then raise exception 'invalid latitude must return nothing'; end if;
  select count(*) into rows_seen from public.transport_top_rated_nearby(8.484, -13.234, 'Sierra Leone');
  if rows_seen <> 0 then raise exception 'a non-ISO country must return nothing'; end if;
end $$;

-- Category lists: distances for chosen fleets only.
do $$
declare
  r record;
  n int;
begin
  select * into r from public.transport_fleet_distances(8.484, -13.234, array['00000000-0000-0000-0000-000000000002']::uuid[]);
  if r.distance_km <> 2.0 or r.location_source <> 'live' then raise exception 'f2 should be 2 km live: %', r; end if;

  select * into r from public.transport_fleet_distances(8.484, -13.234, array['00000000-0000-0000-0000-000000000003']::uuid[]);
  if r.location_source <> 'recent' then raise exception 'f3 should be recent: %', r; end if;

  -- Offline fleets still get a distance in category lists (they show "last seen"),
  -- but stale positions, hidden company fleets and empty input do not.
  select count(*) into n from public.transport_fleet_distances(8.484, -13.234, array[
    '00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000009']::uuid[]);
  if n <> 0 then raise exception 'stale or hidden fleets must get no distance, got %', n; end if;
  select count(*) into n from public.transport_fleet_distances(8.484, -13.234, array[]::uuid[]);
  if n <> 0 then raise exception 'empty input must return nothing'; end if;
end $$;

-- Dense area: 12 rated fleets within 5 km -> radius shrinks to 5 km.
do $$
declare
  i int;
  id uuid;
  r record;
begin
  for i in 1..12 loop
    id := gen_random_uuid();
    insert into auth.users values (id);
    insert into public.transport_operators values (id, id, 'verified');
    insert into public.transport_fleets(id, operator_id) values (id, id);
    insert into public.transport_operator_locations(operator_id, lat, lng) values (id, 8.484 + 0.002 * i, -13.234);
    insert into public.transport_operator_reviews(operator_id, rating) values (id, 4);
  end loop;

  select * into r from public.transport_top_rated_nearby(8.484, -13.234, 'SL') limit 1;
  if r.radius_km <> 5 then raise exception 'dense area should use a 5 km radius, got %', r.radius_km; end if;
  if exists (select 1 from public.transport_top_rated_nearby(8.484, -13.234, 'SL') where distance_km > 5) then
    raise exception 'nothing beyond the chosen radius may be returned';
  end if;
end $$;

-- UrMall: nearest of main store and branches.
insert into public.marketplace_businesses values
  ('10000000-0000-0000-0000-000000000001', 8.484 + 0.09, -13.234),  -- main 10 km away
  ('10000000-0000-0000-0000-000000000002', null, null);              -- no coordinates
insert into public.marketplace_business_locations(business_id, latitude, longitude) values
  ('10000000-0000-0000-0000-000000000001', 8.484 + 0.018, -13.234); -- branch 2 km away

do $$
declare
  d numeric;
  n int;
begin
  select distance_km into d from public.marketplace_nearest_store_distances(8.484, -13.234,
    array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002']::uuid[])
  where business_id = '10000000-0000-0000-0000-000000000001';
  if d <> 2.0 then raise exception 'nearest branch should win (2 km), got %', d; end if;

  select count(*) into n from public.marketplace_nearest_store_distances(8.484, -13.234,
    array['10000000-0000-0000-0000-000000000002']::uuid[]);
  if n <> 0 then raise exception 'a store without coordinates gets no distance'; end if;

  select count(*) into n from public.marketplace_nearest_store_distances(8.484, -13.234, array[]::uuid[]);
  if n <> 0 then raise exception 'empty input must return nothing'; end if;
end $$;

\echo 'nearby_top_rated: all assertions passed'
