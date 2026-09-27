-- Run ONLY against the isolated, disposable open_booking_test database:
-- psql -h 127.0.0.1 -p 55441 -U postgres -d open_booking_test -v ON_ERROR_STOP=1 -f supabase/tests/urride_open_bookings.sql
-- (supabase/tests/run-urride-open-bookings.ps1 creates that throwaway cluster.)
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'open_booking_test' then raise exception 'This fixture requires the disposable open_booking_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Production column types: fleet type / service category / alert type are enums.
create type public.transport_service_category as enum ('transport', 'delivery', 'both');
create type public.transport_fleet_type as enum ('car', 'motorcycle', 'tricycle');
create type public.transport_operator_alert_type as enum ('passenger_waiting', 'verification', 'payment', 'review', 'system');

create table public.transport_operators(id uuid primary key, user_id uuid unique not null references auth.users, full_name text);
create table public.transport_fleets(
  id uuid primary key, operator_id uuid references public.transport_operators, company_id uuid,
  is_visible_to_passengers boolean not null default true, active_status text default 'active',
  fleet_type public.transport_fleet_type, service_category public.transport_service_category, country_iso text default 'SL'
);
create table public.transport_operator_locations(
  operator_id uuid primary key references auth.users, status text not null default 'online', available boolean not null default true,
  lat double precision not null, lng double precision not null, last_seen_at timestamptz not null default now()
);
create table public.transport_trips(
  id uuid primary key default gen_random_uuid(), passenger_id uuid, passenger_name text, fleet_id uuid references public.transport_fleets,
  trip_type text, trip_mode text, title text, status text not null default 'requested',
  pickup_label text, pickup_latitude numeric(10, 7), pickup_longitude numeric(10, 7),
  destination_label text, destination_latitude numeric(10, 7), destination_longitude numeric(10, 7),
  contact_phone text, package_description text, trip_note text, country text, country_iso text,
  booking_method text default 'distance', estimated_distance_km numeric(10, 3), fare_amount numeric(12, 2), fare_currency text,
  scheduled_at timestamptz, ended_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.transport_operator_alerts(
  id uuid primary key default gen_random_uuid(), operator_id uuid not null references public.transport_operators, fleet_id uuid,
  alert_type public.transport_operator_alert_type not null default 'system', title text not null, body text,
  action_label text, action_target text, created_at timestamptz not null default now()
);

\ir ../migrations/20260927120000_urride_open_bookings.sql

-- Pickup: central Freetown. ~0.009 degrees of latitude = 1 km.
insert into auth.users(id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a0', '{"display_name":"Pat Passenger"}'),
  ('00000000-0000-4000-8000-0000000000a1', '{}'), ('00000000-0000-4000-8000-0000000000a2', '{}'),
  ('00000000-0000-4000-8000-0000000000a3', '{}'), ('00000000-0000-4000-8000-0000000000a4', '{}'),
  ('00000000-0000-4000-8000-0000000000a5', '{}'), ('00000000-0000-4000-8000-0000000000a6', '{}'),
  ('00000000-0000-4000-8000-0000000000a7', '{}'), ('00000000-0000-4000-8000-0000000000a8', '{}'),
  ('00000000-0000-4000-8000-0000000000a9', '{}'), ('00000000-0000-4000-8000-0000000000aa', '{}'),
  ('00000000-0000-4000-8000-0000000000ab', '{}'), ('00000000-0000-4000-8000-0000000000ac', '{}');

insert into public.transport_operators(id, user_id, full_name) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'A near bike'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a2', 'B 5km bike'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a3', 'C offline bike'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a4', 'D tricycle'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000a5', 'E stale bike'),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000a6', 'F hidden company bike'),
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-0000000000a7', 'G delivery-only bike'),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-0000000000a8', 'H Guinea bike'),
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-0000000000a0', 'I passenger own bike'),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a9', 'J busy bike'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000aa', 'K 2.5km bike'),
  ('10000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-0000000000ab', 'L delivery van'),
  ('10000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-0000000000ac', 'M unavailable bike');

insert into public.transport_fleets(id, operator_id, company_id, is_visible_to_passengers, active_status, fleet_type, service_category, country_iso) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, true, 'active', 'motorcycle', 'transport', 'SL'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', null, true, 'active', 'motorcycle', 'both', 'SL'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', null, true, 'active', 'motorcycle', 'transport', 'SL'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', null, true, 'active', 'tricycle', 'transport', 'SL'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', null, true, 'active', 'motorcycle', 'transport', 'SL'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001', false, 'active', 'motorcycle', 'transport', 'SL'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', null, true, 'active', 'motorcycle', 'delivery', 'SL'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', null, true, 'active', 'motorcycle', 'transport', 'GN'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', null, true, 'active', 'motorcycle', 'transport', 'SL'),
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', null, true, 'active', 'motorcycle', 'transport', 'SL'),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b', null, true, 'active', 'motorcycle', 'transport', 'SL'),
  ('20000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-00000000000c', null, true, 'active', 'car', 'delivery', 'SL'),
  ('20000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-00000000000d', null, true, 'active', 'motorcycle', 'transport', 'SL');

insert into public.transport_operator_locations(operator_id, status, available, lat, lng, last_seen_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'online', true, 8.4747, -13.2317, now()),                        -- A 1 km
  ('00000000-0000-4000-8000-0000000000a2', 'online', true, 8.5107, -13.2317, now()),                        -- B 5 km
  ('00000000-0000-4000-8000-0000000000a3', 'offline', true, 8.4702, -13.2317, now()),                       -- C offline
  ('00000000-0000-4000-8000-0000000000a4', 'online', true, 8.4702, -13.2317, now()),                        -- D tricycle
  ('00000000-0000-4000-8000-0000000000a5', 'online', true, 8.4702, -13.2317, now() - interval '20 minutes'),-- E stale
  ('00000000-0000-4000-8000-0000000000a6', 'online', true, 8.4702, -13.2317, now()),                        -- F hidden company fleet
  ('00000000-0000-4000-8000-0000000000a7', 'online', true, 8.4702, -13.2317, now()),                        -- G delivery-only
  ('00000000-0000-4000-8000-0000000000a8', 'online', true, 8.4702, -13.2317, now()),                        -- H other country
  ('00000000-0000-4000-8000-0000000000a0', 'online', true, 8.4670, -13.2317, now()),                        -- I passenger's own fleet
  ('00000000-0000-4000-8000-0000000000a9', 'online', true, 8.4702, -13.2317, now()),                        -- J busy
  ('00000000-0000-4000-8000-0000000000aa', 'online', true, 8.4882, -13.2317, now()),                        -- K 2.5 km
  ('00000000-0000-4000-8000-0000000000ab', 'online', true, 8.4747, -13.2317, now()),                        -- L delivery van 1 km
  ('00000000-0000-4000-8000-0000000000ac', 'online', false, 8.4702, -13.2317, now());                       -- M unavailable

-- J is already on a job.
insert into public.transport_trips(passenger_id, fleet_id, status) values
  ('00000000-0000-4000-8000-0000000000ac', '20000000-0000-4000-8000-00000000000a', 'in_progress');

create temporary table results(name text primary key, value jsonb);
grant all on results to public;

-- Every scenario runs as the passenger.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a0', false);

-- 1. Ride by motorbike: only A (1 km) and K (2.5 km) qualify inside 3 km, nearest first.
insert into results select 'ride', public.create_transport_open_booking(
  'ride', 'Motorcycle', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', 8.4200, -13.2800,
  25, 'SLE', 'SL', 'Sierra Leone', null, '+232 99 000 000', null, 'Near the clock tower', 2, 6.2, null);

do $$
declare r jsonb := (select value from results where name = 'ride'); fleets uuid[];
begin
  if (r ->> 'notified_count')::int <> 2 then raise exception 'ride: expected 2 operators, got %', r; end if;
  if (r ->> 'radius_km')::numeric <> 3 then raise exception 'ride: expected the 3 km ring, got %', r; end if;
  select array_agg(fleet_id order by pickup_latitude, fleet_id) into fleets from public.transport_trips where open_booking_id = (r ->> 'open_booking_id')::uuid;
  if not (fleets @> array['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000b']::uuid[] and array_length(fleets, 1) = 2) then
    raise exception 'ride: wrong operators notified: %', fleets;
  end if;
  if (select array_agg(t.fleet_id order by ord) from jsonb_array_elements_text(r -> 'trip_ids') with ordinality as e(id, ord) join public.transport_trips t on t.id = e.id::uuid)
     <> array['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000b']::uuid[] then
    raise exception 'ride: operators are not ordered nearest first';
  end if;
  if exists (select 1 from public.transport_trips where open_booking_id = (r ->> 'open_booking_id')::uuid
             and (status <> 'requested' or fare_amount <> 25 or fare_currency <> 'SLE' or passenger_name <> 'Pat Passenger'
                  or title <> 'Open ride request - 2 passengers' or trip_type <> 'ride' or country_iso <> 'SL')) then
    raise exception 'ride: request rows are not as sent';
  end if;
end $$;

-- 2. A accepts; K's request becomes 'taken' and K is told.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
update public.transport_trips set status = 'accepted'
 where open_booking_id = (select (value ->> 'open_booking_id')::uuid from results where name = 'ride')
   and fleet_id = '20000000-0000-4000-8000-000000000001';

do $$
declare g uuid := (select (value ->> 'open_booking_id')::uuid from results where name = 'ride');
begin
  if (select status from public.transport_trips where open_booking_id = g and fleet_id = '20000000-0000-4000-8000-00000000000b') <> 'taken' then
    raise exception 'accept: the other request was not marked taken';
  end if;
  if not exists (select 1 from public.transport_operator_alerts where operator_id = '10000000-0000-4000-8000-00000000000b' and title = 'Open request taken') then
    raise exception 'accept: the other operator was not alerted';
  end if;
end $$;

-- 3. K can no longer accept.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000aa', false);
do $$
begin
  update public.transport_trips set status = 'accepted'
   where open_booking_id = (select (value ->> 'open_booking_id')::uuid from results where name = 'ride')
     and fleet_id = '20000000-0000-4000-8000-00000000000b';
  raise exception 'late accept: should have been refused';
exception when others then
  if sqlerrm <> 'This open booking is no longer available.' then raise; end if;
end $$;

-- A finishes that job, so A and K are both free again.
update public.transport_trips set status = 'completed' where status = 'accepted';

-- 4. Two accepts racing: with the settle trigger off (as if the other accept
--    has not committed its cascade yet), the second accept must still fail.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a0', false);
insert into results select 'race', public.create_transport_open_booking(
  'ride', 'motorcycle', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', null, null,
  30, 'SLE', 'SL', 'Sierra Leone', null, null, null, null, 1, null, null);
alter table public.transport_trips disable trigger transport_open_booking_settle_group_trigger;
update public.transport_trips set status = 'accepted'
 where open_booking_id = (select (value ->> 'open_booking_id')::uuid from results where name = 'race')
   and fleet_id = '20000000-0000-4000-8000-00000000000b';
do $$
begin
  update public.transport_trips set status = 'accepted'
   where open_booking_id = (select (value ->> 'open_booking_id')::uuid from results where name = 'race')
     and fleet_id <> '20000000-0000-4000-8000-00000000000b';
  raise exception 'race: a second operator could accept';
exception when others then
  if sqlerrm <> 'Another operator already took this open booking.' then raise; end if;
end $$;
do $$
begin
  if (select count(*) from public.transport_trips where open_booking_id = (select (value ->> 'open_booking_id')::uuid from results where name = 'race')) <> 2 then
    raise exception 'race: expected A and K to both receive the request';
  end if;
end $$;
alter table public.transport_trips enable trigger transport_open_booking_settle_group_trigger;

-- K (accepted in scenario 4) finishes too.
update public.transport_trips set status = 'completed' where status = 'accepted';

-- 5. The passenger cancels one request: the whole open booking is withdrawn.
insert into results select 'cancel', public.create_transport_open_booking(
  'ride', 'motorcycle', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', null, null,
  30, 'SLE', 'SL', 'Sierra Leone', null, null, null, null, 1, null, null);
update public.transport_trips set status = 'cancelled', ended_by = 'passenger'
 where id = (select (value -> 'trip_ids' ->> 0)::uuid from results where name = 'cancel');
do $$
declare g uuid := (select (value ->> 'open_booking_id')::uuid from results where name = 'cancel');
begin
  if (select count(*) from public.transport_trips where open_booking_id = g) < 2 then raise exception 'cancel: expected a group of requests'; end if;
  if exists (select 1 from public.transport_trips where open_booking_id = g and status not in ('cancelled', 'withdrawn')) then
    raise exception 'cancel: the rest of the open booking was not withdrawn';
  end if;
end $$;

-- 6. Delivery by van reaches car fleets that deliver (L), not ride-only fleets.
insert into results select 'van', public.create_transport_open_booking(
  'delivery', 'van', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', null, null,
  80, 'SLE', 'SL', 'Sierra Leone', null, null, 'Two boxes of books', null, 1, null, null);
do $$
declare r jsonb := (select value from results where name = 'van');
begin
  if (r ->> 'notified_count')::int <> 1
     or (select fleet_id from public.transport_trips where id = (r -> 'trip_ids' ->> 0)::uuid) <> '20000000-0000-4000-8000-00000000000c'
     or (select package_description from public.transport_trips where id = (r -> 'trip_ids' ->> 0)::uuid) <> 'Two boxes of books' then
    raise exception 'van: expected only the delivery van, got %', r;
  end if;
end $$;

-- 7. Nobody of that type nearby: nothing is created.
do $$
declare r jsonb;
begin
  r := public.create_transport_open_booking('ride', 'car', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', null, null,
    40, 'SLE', 'SL', 'Sierra Leone', null, null, null, null, 1, null, null);
  if (r ->> 'notified_count')::int <> 0 or r ->> 'open_booking_id' is not null then raise exception 'empty: expected no operators, got %', r; end if;
end $$;

-- 8. Wider rings: a pickup 4 km from K and 5 km+ from others uses the 7 km ring.
do $$
declare r jsonb;
begin
  r := public.create_transport_open_booking('ride', 'motorcycle', 'North pickup', 8.5250, -13.2317, 'Lumley', null, null,
    20, 'SLE', 'SL', 'Sierra Leone', null, null, null, null, 1, null, null);
  if (r ->> 'radius_km')::numeric <> 3 and (r ->> 'radius_km')::numeric <> 7 then raise exception 'rings: unexpected radius %', r; end if;
  if (r ->> 'notified_count')::int < 1 then raise exception 'rings: expected nearby operators, got %', r; end if;
end $$;

-- 9. Validation.
do $$
declare cases text[][] := array[
  ['pickup', 'Set your pickup point on the map so nearby operators can be found.'],
  ['package', 'Describe the package before sending.'],
  ['offer', 'Add the fare you are offering.'],
  ['vehicle', 'Choose a vehicle type.'],
  ['country', 'Choose your country in Settings before booking.']
]; i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    begin
      case cases[i][1]
        when 'pickup' then perform public.create_transport_open_booking('ride', 'motorcycle', 'Somewhere', null, null, 'Lumley', null, null, 10, 'SLE', 'SL', null, null, null, null, null, 1, null, null);
        when 'package' then perform public.create_transport_open_booking('delivery', 'motorcycle', 'Somewhere', 8.4657, -13.2317, 'Lumley', null, null, 10, 'SLE', 'SL', null, null, null, '  ', null, 1, null, null);
        when 'offer' then perform public.create_transport_open_booking('ride', 'motorcycle', 'Somewhere', 8.4657, -13.2317, 'Lumley', null, null, 0, 'SLE', 'SL', null, null, null, null, null, 1, null, null);
        when 'vehicle' then perform public.create_transport_open_booking('ride', 'helicopter', 'Somewhere', 8.4657, -13.2317, 'Lumley', null, null, 10, 'SLE', 'SL', null, null, null, null, null, 1, null, null);
        when 'country' then perform public.create_transport_open_booking('ride', 'motorcycle', 'Somewhere', 8.4657, -13.2317, 'Lumley', null, null, 10, 'SLE', '', null, null, null, null, null, 1, null, null);
      end case;
      raise exception 'validation %: accepted bad input', cases[i][1];
    exception when others then
      if sqlerrm <> cases[i][2] then raise exception 'validation %: got "%"', cases[i][1], sqlerrm; end if;
    end;
  end loop;
end $$;

-- 10. Throttle: five open bookings in ten minutes (four were made above plus
--     this one), then the next is refused.
do $$
declare made int := (select count(distinct open_booking_id) from public.transport_trips where passenger_id = '00000000-0000-4000-8000-0000000000a0' and open_booking_id is not null);
begin
  while made < 5 loop
    perform public.create_transport_open_booking('ride', 'motorcycle', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', null, null, 15, 'SLE', 'SL', null, null, null, null, null, 1, null, null);
    made := made + 1;
  end loop;
  begin
    perform public.create_transport_open_booking('ride', 'motorcycle', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', null, null, 15, 'SLE', 'SL', null, null, null, null, null, 1, null, null);
    raise exception 'throttle: sixth open booking was allowed';
  exception when others then
    if sqlerrm <> 'Too many open bookings. Please wait a few minutes and try again.' then raise; end if;
  end;
end $$;

-- 11. Signed out: refused.
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  perform public.create_transport_open_booking('ride', 'motorcycle', 'Somewhere', 8.4657, -13.2317, 'Lumley', null, null, 10, 'SLE', 'SL', null, null, null, null, null, 1, null, null);
  raise exception 'auth: anonymous call was allowed';
exception when others then
  if sqlerrm <> 'Sign in to book transport.' then raise; end if;
end $$;

select 'urride open bookings: all scenarios passed' as result;
