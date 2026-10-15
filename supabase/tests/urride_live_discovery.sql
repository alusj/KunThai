-- Run ONLY against an isolated, disposable urride_live_discovery_test database:
-- createdb -h <host> -p <port> urride_live_discovery_test
-- psql -h <host> -p <port> -d urride_live_discovery_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/urride_live_discovery.sql
-- Stubs the tables the function reads, loads the real migration (twice, to
-- prove it is re-runnable), asserts.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'urride_live_discovery_test' then raise exception 'This fixture requires the disposable urride_live_discovery_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

create table auth.users(id uuid primary key);

-- Production column types: fleet type and verification status are enums.
create type public.transport_fleet_type as enum ('car', 'motorcycle', 'tricycle');
create type public.transport_verification_status as enum ('not_verified', 'verification_pending', 'verified', 'verified_recommended');
create table public.transport_operators(
  id uuid primary key, user_id uuid unique not null references auth.users,
  verification_status public.transport_verification_status default 'verification_pending', phone text
);
create table public.transport_fleets(
  id uuid primary key, operator_id uuid references public.transport_operators, company_id uuid,
  fleet_name text, service_category text default 'both',
  is_visible_to_passengers boolean not null default true, active_status text default 'active',
  fleet_type public.transport_fleet_type default 'motorcycle', country_iso text default 'SL',
  verification_status text default 'verified'
);
create table public.transport_operator_locations(
  operator_id uuid primary key references auth.users, status text not null default 'online',
  available boolean not null default true,
  lat double precision not null, lng double precision not null, last_seen_at timestamptz not null default now()
);

-- Distance helper from 20260927120000_urride_open_bookings.sql (unchanged).
create or replace function public.transport_open_booking_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371.0 * 2 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

\ir ../migrations/20261015130000_urride_live_discovery.sql
\ir ../migrations/20261015130000_urride_live_discovery.sql

-- Passenger in central Freetown. 0.009 deg latitude ~= 1 km.
--  1: 3 km, online, seen now                      -> available
--  2: 0.5 km, online, seen now                    -> available (nearest first)
--  3: 2 km, busy, seen 30 s ago                   -> busy
--  4: 1.5 km, online, seen 1 min 50 s ago         -> available (inside 2 min)
--  5: 1.5 km, online, seen 2 min 10 s ago         -> recent (just outside 2 min)
--  6: 1 km, online, seen 4 hours ago              -> excluded everywhere
--  7: 1 km, online now, Guinea                    -> other country, excluded
--  8: 1 km, online now, not verified              -> hidden unless asked
--  9: 1 km, online now, hidden company fleet      -> excluded
-- 10: 1 km, online now, Active switch off         -> excluded
-- 11: 20 km, online now                           -> outside 15 km, inside 50 km
-- 12: 80 km, online now                           -> outside every radius
-- 13: 1 km, online now, pending review            -> listed by default
-- 14: 1 km, online now, rejected                  -> hidden unless asked
-- 15: 1 km, online now, no verification at all    -> treated as pending, listed
-- 16: 1 km, offline row seen 1 min ago, switch on -> recent (signed out)
do $$
declare
  i int;
  id uuid;
begin
  for i in 1..16 loop
    id := ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users values (id);
    insert into public.transport_operators(id, user_id, phone) values (id, id, '+23270000' || lpad(i::text, 3, '0'));
    insert into public.transport_fleets(id, operator_id, fleet_name) values (id, id, 'Fleet ' || i);
  end loop;
end $$;

insert into public.transport_operator_locations(operator_id, lat, lng, last_seen_at, status) values
  ('00000000-0000-0000-0000-000000000001', 8.484 + 0.027, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000002', 8.484 + 0.0045, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000003', 8.484 + 0.018, -13.234, now() - interval '30 seconds', 'busy'),
  ('00000000-0000-0000-0000-000000000004', 8.484 + 0.0135, -13.234, now() - interval '110 seconds', 'online'),
  ('00000000-0000-0000-0000-000000000005', 8.484 - 0.0135, -13.234, now() - interval '130 seconds', 'online'),
  ('00000000-0000-0000-0000-000000000006', 8.484 + 0.009, -13.234, now() - interval '4 hours', 'online'),
  ('00000000-0000-0000-0000-000000000007', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000008', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000009', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000010', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000011', 8.484 + 0.18, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000012', 8.484 + 0.72, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000013', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000014', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000015', 8.484 + 0.009, -13.234, now(), 'online'),
  ('00000000-0000-0000-0000-000000000016', 8.484 + 0.009, -13.234, now() - interval '1 minute', 'offline');

update public.transport_fleets set country_iso = 'GN' where id = '00000000-0000-0000-0000-000000000007';
update public.transport_fleets set verification_status = 'not_verified' where id = '00000000-0000-0000-0000-000000000008';
update public.transport_fleets set company_id = gen_random_uuid(), is_visible_to_passengers = false where id = '00000000-0000-0000-0000-000000000009';
update public.transport_fleets set active_status = 'offline' where id = '00000000-0000-0000-0000-000000000010';
update public.transport_fleets set verification_status = 'pending_review' where id = '00000000-0000-0000-0000-000000000013';
update public.transport_fleets set verification_status = 'rejected' where id = '00000000-0000-0000-0000-000000000014';
update public.transport_fleets set verification_status = null where id = '00000000-0000-0000-0000-000000000015';
update public.transport_operators set verification_status = null where id = '00000000-0000-0000-0000-000000000015';

create function pg_temp.fid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;

do $$
declare
  ids uuid[];
  r record;
  n int;
  ordered boolean;
begin
  -- Default call: available + busy only, nearest first.
  select array_agg(fleet_id order by ord) into ids
  from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL') with ordinality as t(fleet_id, a, b, c, d, e, f, g, h, ord);
  if ids is distinct from array[pg_temp.fid(2), pg_temp.fid(13), pg_temp.fid(15), pg_temp.fid(4), pg_temp.fid(3), pg_temp.fid(1)] then
    raise exception 'default call should list 2 (0.5 km), 13, 15 (1 km), 4 (1.5 km), 3 (2 km), 1 (3 km); got %', ids;
  end if;

  select * into r from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL') where fleet_id = pg_temp.fid(1);
  if r.availability <> 'available' or r.distance_km <> 3.0 or r.eta_minutes <> 10 or r.fleet_name <> 'Fleet 1' then
    raise exception 'fleet 1 should be available, 3.0 km, 10 min (3/25*60+2): %', r;
  end if;
  select * into r from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL') where fleet_id = pg_temp.fid(3);
  if r.availability <> 'busy' then raise exception 'fleet 3 should be busy: %', r; end if;
  select * into r from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL') where fleet_id = pg_temp.fid(4);
  if r.availability <> 'available' then raise exception 'seen 1 min 50 s ago is still available: %', r; end if;
  select * into r from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL') where fleet_id = pg_temp.fid(13);
  if r.verification_status <> 'pending_review' then raise exception 'pending review is listed by default: %', r; end if;

  -- 2 minute boundary: fleet 5 (2 min 10 s) is not available.
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL') where fleet_id = pg_temp.fid(5);
  if n <> 0 then raise exception 'a position older than 2 minutes must not be available'; end if;

  -- Recently online: separate tier after every live row, never 'available'.
  select array_agg(fleet_id order by ord) into ids
  from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL', p_include_recent => true)
    with ordinality as t(fleet_id, a, b, c, d, e, f, g, h, ord)
  where h = 'recent';
  if ids is distinct from array[pg_temp.fid(16), pg_temp.fid(5)] then
    raise exception 'recent should be 16 (1 km, signed out) then 5 (1.5 km); got %', ids;
  end if;
  select count(*) into n
  from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL', p_include_recent => true)
  where fleet_id = pg_temp.fid(6);
  if n <> 0 then raise exception 'positions older than 3 hours are left out even as recent'; end if;
  select max(ord) filter (where h <> 'recent') < min(ord) filter (where h = 'recent') into strict ordered
  from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL', p_include_recent => true)
    with ordinality as t(fleet_id, a, b, c, d, e, f, g, h, ord);
  if not ordered then raise exception 'recent rows must come after every live row'; end if;

  -- Radius: 20 km fleet only with a wider radius; the radius is clamped to 1-50 km.
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL') where fleet_id = pg_temp.fid(11);
  if n <> 0 then raise exception 'default 15 km must not reach 20 km'; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, 25, p_country => 'SL') where fleet_id = pg_temp.fid(11);
  if n <> 1 then raise exception '25 km radius should reach fleet 11'; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, 500, p_country => 'SL') where fleet_id = pg_temp.fid(12);
  if n <> 0 then raise exception 'radius must be clamped to 50 km (fleet 12 is 80 km away)'; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, 0, p_country => 'SL');
  if n <> 1 then raise exception 'radius 0 clamps to 1 km (only fleet 2 at 0.5 km), got %', n; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_limit => 2, p_country => 'SL');
  if n <> 2 then raise exception 'limit should cap the rows, got %', n; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_limit => 0, p_country => 'SL');
  if n <> 1 then raise exception 'limit 0 clamps to 1, got %', n; end if;

  -- Country boundary: Guinea fleet never; no/invalid country, nothing at all.
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL', p_include_unverified => true, p_include_recent => true) where fleet_id = pg_temp.fid(7);
  if n <> 0 then raise exception 'a fleet from another country must never be listed'; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'GN');
  if n <> 1 then raise exception 'in Guinea only the Guinea fleet is listed, got %', n; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234);
  if n <> 0 then raise exception 'no country means no rows'; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'Sierra Leone');
  if n <> 0 then raise exception 'a non-ISO country must return nothing'; end if;
  select count(*) into n from public.transport_available_operators_nearby(95, -13.234, p_country => 'SL');
  if n <> 0 then raise exception 'invalid latitude must return nothing'; end if;

  -- Verification: not verified / rejected hidden by default, shown with the flag.
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL') where fleet_id in (pg_temp.fid(8), pg_temp.fid(14));
  if n <> 0 then raise exception 'not verified and rejected fleets are hidden by default'; end if;
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'sl', p_include_unverified => true) where fleet_id in (pg_temp.fid(8), pg_temp.fid(14));
  if n <> 2 then raise exception 'p_include_unverified must list not verified and rejected fleets, got %', n; end if;

  -- Invisible company fleets and fleets switched off never appear.
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_country => 'SL', p_include_unverified => true, p_include_recent => true) where fleet_id in (pg_temp.fid(9), pg_temp.fid(10));
  if n <> 0 then raise exception 'hidden company fleets and offline fleets must be excluded'; end if;

  -- Fleet type filter.
  select count(*) into n from public.transport_available_operators_nearby(8.484, -13.234, p_fleet_type => 'car', p_country => 'SL');
  if n <> 0 then raise exception 'fleet type filter failed, got %', n; end if;
  update public.transport_fleets set fleet_type = 'car' where id = pg_temp.fid(1);
  select * into r from public.transport_available_operators_nearby(8.484, -13.234, p_fleet_type => 'CAR', p_country => 'SL');
  if r.fleet_id <> pg_temp.fid(1) or r.eta_minutes <> 11 then raise exception 'car fleet 1 should be found with 11 min (3/22*60+2): %', r; end if;
  update public.transport_fleets set fleet_type = 'motorcycle' where id = pg_temp.fid(1);
end $$;

-- The function never returns coordinates or phone numbers, and anon can run it.
do $$
begin
  if exists (
    select 1 from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_name = 'transport_available_operators_nearby' and p.parameter_mode = 'OUT'
      and p.parameter_name in ('lat', 'lng', 'phone', 'operator_phone', 'operator_id')
  ) then
    raise exception 'private operator data must not be returned';
  end if;
  if not has_function_privilege('anon', 'public.transport_available_operators_nearby(double precision, double precision, numeric, text, integer, boolean, text, boolean)', 'execute') then
    raise exception 'anon must be able to execute the function';
  end if;
  if (select prosecdef from pg_proc where proname = 'transport_available_operators_nearby') is not true then
    raise exception 'the function must be security definer like the other nearby RPCs';
  end if;
end $$;

\echo 'urride_live_discovery: all assertions passed'
