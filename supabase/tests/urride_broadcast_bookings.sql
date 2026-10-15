-- Run ONLY against an isolated, disposable urride_broadcast_bookings_test database:
-- createdb -h <host> -p <port> urride_broadcast_bookings_test
-- psql -h <host> -p <port> -d urride_broadcast_bookings_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/urride_broadcast_bookings.sql
-- Stubs the tables the functions read, loads the real migrations (the
-- broadcast migration twice, to prove it is re-runnable), asserts. The race
-- scenarios open two extra connections to this same database with dblink.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'urride_broadcast_bookings_test' then raise exception 'This fixture requires the disposable urride_broadcast_bookings_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create extension if not exists dblink schema public;

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
  fleet_type public.transport_fleet_type, service_category public.transport_service_category, country_iso text default 'SL',
  fleet_name text, plate_number text, make text, model text, color text, last_active_at timestamptz
);
create table public.transport_operator_locations(
  operator_id uuid primary key references auth.users, status text not null default 'online', available boolean not null default true,
  lat double precision not null, lng double precision not null, last_seen_at timestamptz not null default now(), metadata jsonb
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
create table public.transport_passenger_notifications(
  id uuid primary key default gen_random_uuid(), passenger_id uuid not null, trip_id uuid, fleet_id uuid,
  notification_type text not null default 'trip_update', title text not null, body text, created_at timestamptz not null default now()
);
create table public.explore_user_blocks(id uuid primary key default gen_random_uuid(), blocker_id uuid not null, blocked_id uuid not null);
-- Only so the notification migration can attach its review triggers.
create table public.marketplace_reviews(id uuid primary key);
create table public.transport_operator_reviews(id uuid primary key);

\ir ../migrations/20260927120000_urride_open_bookings.sql
\ir ../migrations/20260927140000_urride_open_booking_reach.sql
\ir ../migrations/20260820090000_professional_marketplace_transport_notifications.sql
create trigger transport_notify_trip_changes_trigger
  after insert or update of status on public.transport_trips
  for each row execute function public.transport_notify_trip_changes();
\ir ../migrations/20261015150000_urride_broadcast_bookings.sql
\ir ../migrations/20261015150000_urride_broadcast_bookings.sql

-- Fixture builder: one operator, one fleet, one live position.
-- Pickup is central Freetown (8.4657, -13.2317); 0.009 degrees of latitude ~ 1 km.
create table ops(tag text primary key, user_id uuid, operator_id uuid, fleet_id uuid);
create function make_op(
  p_tag text, p_km_north double precision, p_type text default 'motorcycle', p_service text default 'transport',
  p_country text default 'SL', p_active text default 'active', p_company_hidden boolean default false,
  p_loc_status text default 'online', p_available boolean default true, p_seen_ago interval default interval '10 seconds',
  p_user uuid default null
) returns uuid language plpgsql as $$
declare v_user uuid := coalesce(p_user, gen_random_uuid()); v_op uuid := gen_random_uuid(); v_fleet uuid := gen_random_uuid();
begin
  insert into auth.users(id) values (v_user) on conflict do nothing;
  insert into public.transport_operators(id, user_id, full_name) values (v_op, v_user, 'Operator ' || p_tag);
  insert into public.transport_fleets(id, operator_id, company_id, is_visible_to_passengers, active_status, fleet_type, service_category, country_iso, fleet_name, plate_number, make, model, color)
  values (v_fleet, v_op, case when p_company_hidden then gen_random_uuid() end, not p_company_hidden, p_active,
          p_type::public.transport_fleet_type, p_service::public.transport_service_category, p_country, 'Fleet ' || p_tag, 'SL-' || upper(p_tag), 'Honda', 'Ace', 'Red');
  insert into public.transport_operator_locations(operator_id, status, available, lat, lng, last_seen_at)
  values (v_user, p_loc_status, p_available, 8.4657 + p_km_north * 0.009, -13.2317, now() - p_seen_ago);
  insert into ops values (p_tag, v_user, v_op, v_fleet);
  return v_fleet;
end $$;

insert into auth.users(id, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000a0', '{"display_name":"Pat Passenger"}');

-- Eight available motorbikes within 5 km (more than the old five).
select make_op('m' || i, 0.5 * i) from generate_series(1, 8) i;
-- Within 5 km but NOT available for a broadcast:
select make_op('stale', 1, p_seen_ago => interval '3 minutes');          -- last seen > 2 min
select make_op('busyloc', 1, p_loc_status => 'busy');                    -- location busy
select make_op('offline', 1, p_loc_status => 'offline');                 -- location offline
select make_op('unavail', 1, p_available => false);                      -- marked unavailable
select make_op('inactive', 1, p_active => 'offline');                    -- fleet switched off
select make_op('hidden', 1, p_company_hidden => true);                   -- hidden company fleet
select make_op('tricycle', 1, p_type => 'tricycle');                     -- other vehicle type
select make_op('delivonly', 1, p_service => 'delivery');                 -- delivery only
select make_op('guinea', 1, p_country => 'GN');                          -- other country
select make_op('self', 1, p_user => '00000000-0000-4000-8000-0000000000a0'); -- the passenger
select make_op('ontrip', 1);                                             -- already on a trip
select make_op('blocked', 1);                                            -- blocked by the passenger
insert into public.transport_trips(passenger_id, fleet_id, status) select gen_random_uuid(), fleet_id, 'in_progress' from ops where tag = 'ontrip';
insert into public.explore_user_blocks(blocker_id, blocked_id) select '00000000-0000-4000-8000-0000000000a0', user_id from ops where tag = 'blocked';
-- Wider rings: two at 7 km (10 km wave), nobody between 10 and 20 km, one at 25 km.
select make_op('w2a', 7); select make_op('w2b', 7.5); select make_op('w4', 25);
-- The fixture's own inserts are not part of any scenario.
truncate public.transport_passenger_notifications, public.transport_operator_alerts;

create temporary table results(name text primary key, value jsonb);
grant all on results to public;
create function sent_tags(p_group uuid) returns text[] language sql as $$
  select coalesce(array_agg(ops.tag order by ops.tag), '{}') from public.transport_trips t join ops on ops.fleet_id = t.fleet_id where t.open_booking_id = p_group
$$;
create function grp(p_name text) returns uuid language sql as $$ select (value ->> 'open_booking_id')::uuid from results where name = p_name $$;
create function trip_of(p_name text, p_tag text) returns uuid language sql as $$
  select t.id from public.transport_trips t join ops on ops.fleet_id = t.fleet_id where t.open_booking_id = grp(p_name) and ops.tag = p_tag
$$;
create function as_user(p_uid uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', p_uid::text, false) $$;
create function as_op(p_tag text) returns void language sql as $$ select set_config('request.jwt.claim.sub', (select user_id::text from ops where tag = p_tag), false) $$;
create function end_wave(p_name text) returns void language sql as $$
  update public.transport_broadcast_bookings set wave_expires_at = now() - interval '2 seconds' where open_booking_id = grp(p_name)
$$;
create function book(p_type text default 'motorcycle', p_trip text default 'ride') returns jsonb language sql as $$
  select public.create_transport_broadcast_booking(p_trip, p_type, 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', 8.42, -13.28,
    25, 'SLE', 'SL', 'Sierra Leone', null, '+232 99 000 000', case when p_trip = 'delivery' then 'Box' end, null, 1, 6.2, null)
$$;

select as_user('00000000-0000-4000-8000-0000000000a0');

-- 1. Reach: all eight available motorbikes within 5 km, nobody else.
insert into results select 'one', book();
do $$
declare r jsonb := (select value from results where name = 'one'); tags text[] := sent_tags(grp('one'));
begin
  if (r ->> 'notified_count')::int <> 8 or (r ->> 'radius_km')::numeric <> 5 or r ->> 'reach' <> 'broadcast' or (r ->> 'wave')::int <> 1 then
    raise exception 'reach: expected 8 operators in the 5 km wave, got %', r;
  end if;
  if tags <> array['m1','m2','m3','m4','m5','m6','m7','m8'] then raise exception 'reach: wrong operators %', tags; end if;
  if jsonb_array_length(r -> 'trip_ids') <> 8 then raise exception 'reach: trip_ids %', r; end if;
  if exists (select 1 from public.transport_trips where open_booking_id = grp('one')
             and (status <> 'requested' or fare_amount <> 25 or passenger_name <> 'Pat Passenger' or title <> 'Open ride request'
                  or broadcast_expires_at < now() + interval '55 seconds' or broadcast_expires_at > now() + interval '65 seconds')) then
    raise exception 'reach: request rows are not as sent';
  end if;
  -- Notifications: exactly one new-request alert per operator, nothing for the passenger yet.
  if (select count(*) from public.transport_operator_alerts a join public.transport_trips t on a.action_target = 'trip:' || t.id
      where t.open_booking_id = grp('one') and a.alert_type = 'passenger_waiting') <> 8 then
    raise exception 'notify: expected one alert per request';
  end if;
  if exists (select 1 from public.transport_passenger_notifications) then raise exception 'notify: passenger notified on send'; end if;
end $$;

-- 2. Status before the wave ends: still searching, nothing new sent.
do $$
declare s jsonb := public.transport_broadcast_booking_status(grp('one'));
begin
  if s ->> 'status' <> 'searching' or (s ->> 'wave')::int <> 1 or (s ->> 'notified_count')::int <> 8 or (s ->> 'seconds_left')::int not between 40 and 45 then
    raise exception 'status: %', s;
  end if;
  s := public.expand_transport_broadcast_booking(grp('one'));
  if (s ->> 'wave')::int <> 1 then raise exception 'expand: widened before the wave ended: %', s; end if;
end $$;

-- 3. Wave 2 (10 km) adds only the two new operators; earlier requests are kept and extended.
select end_wave('one');
update public.transport_trips set broadcast_expires_at = now() + interval '5 seconds' where open_booking_id = grp('one');
do $$
declare s jsonb := public.transport_broadcast_booking_status(grp('one'));
begin
  if (s ->> 'wave')::int <> 2 or (s ->> 'radius_km')::numeric <> 10 or (s ->> 'notified_count')::int <> 10 or s ->> 'status' <> 'searching' then
    raise exception 'wave 2: %', s;
  end if;
  if sent_tags(grp('one')) <> array['m1','m2','m3','m4','m5','m6','m7','m8','w2a','w2b'] then raise exception 'wave 2: tags %', sent_tags(grp('one')); end if;
  if (select count(*) from public.transport_trips where open_booking_id = grp('one')) <> 10 then raise exception 'wave 2: duplicates'; end if;
  if exists (select 1 from public.transport_trips where open_booking_id = grp('one') and broadcast_expires_at < now() + interval '55 seconds') then
    raise exception 'wave 2: earlier requests were not extended';
  end if;
end $$;

-- 4. Wave 3 skips the empty 20 km ring and goes straight to 30 km.
select end_wave('one');
do $$
declare s jsonb := public.transport_broadcast_booking_status(grp('one'));
begin
  if (s ->> 'wave')::int <> 4 or (s ->> 'radius_km')::numeric <> 30 or (s ->> 'notified_count')::int <> 11 then raise exception 'wave 4: %', s; end if;
  if not ('w4' = any (sent_tags(grp('one')))) or (select count(*) from public.transport_trips where open_booking_id = grp('one')) <> 11 then
    raise exception 'wave 4: %', sent_tags(grp('one'));
  end if;
end $$;

-- 5. A decline is recorded as 'declined' and tells the passenger nothing.
select as_op('m3');
update public.transport_trips set status = 'cancelled', ended_by = 'operator' where id = trip_of('one', 'm3');
do $$
begin
  if (select status from public.transport_trips where id = trip_of('one', 'm3')) <> 'declined' then raise exception 'decline: not recorded as declined'; end if;
  if exists (select 1 from public.transport_passenger_notifications) then raise exception 'decline: passenger was notified'; end if;
end $$;

-- 6. Last wave over: the booking expires, every open request is expired, nobody is notified.
select as_user('00000000-0000-4000-8000-0000000000a0');
select end_wave('one');
do $$
declare s jsonb := public.transport_broadcast_booking_status(grp('one')); alerts int := (select count(*) from public.transport_operator_alerts);
begin
  if s ->> 'status' <> 'expired' or s ->> 'message' <> 'No operator accepted your request. Try again or raise your fare.' then raise exception 'expiry: %', s; end if;
  if exists (select 1 from public.transport_trips where open_booking_id = grp('one') and status not in ('expired', 'declined')) then
    raise exception 'expiry: requests left open';
  end if;
  if exists (select 1 from public.transport_passenger_notifications) or alerts <> (select count(*) from public.transport_operator_alerts) then
    raise exception 'expiry: someone was notified';
  end if;
end $$;
-- An operator accepting an expired request gets a clear answer, and a direct update is refused.
select as_op('m1');
do $$
declare r jsonb := public.accept_transport_broadcast_request(trip_of('one', 'm1'));
begin
  if (r ->> 'ok')::boolean or r ->> 'reason' <> 'expired' or r ->> 'message' <> 'This request has expired.' then raise exception 'expired accept: %', r; end if;
  begin
    update public.transport_trips set status = 'accepted' where id = trip_of('one', 'm2');
    raise exception 'expired accept: direct update allowed';
  exception when others then
    if sqlerrm <> 'This request has expired.' then raise; end if;
  end;
end $$;

-- 7. First accept wins: the others flip to 'taken' at once, nobody but the passenger hears about it.
select as_user('00000000-0000-4000-8000-0000000000a0');
insert into results select 'two', book();
select as_op('m2');
do $$
declare r jsonb := public.accept_transport_broadcast_request(trip_of('two', 'm2'), 30, 'SLE'); alerts int;
begin
  if not (r ->> 'ok')::boolean or r -> 'trip' ->> 'status' <> 'accepted' or (r -> 'trip' ->> 'fare_amount')::numeric <> 30 then raise exception 'accept: %', r; end if;
  if exists (select 1 from public.transport_trips where open_booking_id = grp('two') and id <> trip_of('two', 'm2') and status <> 'taken') then
    raise exception 'accept: others were not taken';
  end if;
  if (select status from public.transport_broadcast_bookings where open_booking_id = grp('two')) <> 'accepted' then raise exception 'accept: booking not accepted'; end if;
  if exists (select 1 from public.transport_operator_alerts where title in ('Open request taken', 'Open request withdrawn')) then raise exception 'accept: taken alerts sent'; end if;
  if (select count(*) from public.transport_passenger_notifications where notification_type = 'trip_accepted') <> 1
     or (select count(*) from public.transport_passenger_notifications) <> 1 then
    raise exception 'accept: expected exactly one passenger notification';
  end if;
  -- Accepting again is idempotent.
  if not (public.accept_transport_broadcast_request(trip_of('two', 'm2')) ->> 'ok')::boolean then raise exception 'accept: not idempotent'; end if;
end $$;
-- The loser: a clear reason, no exception; a direct update gets the same message.
select as_op('m1');
do $$
declare r jsonb := public.accept_transport_broadcast_request(trip_of('two', 'm1'));
begin
  if (r ->> 'ok')::boolean or r ->> 'reason' <> 'taken' or r ->> 'message' <> 'Another operator accepted this trip.' then raise exception 'loser: %', r; end if;
  begin
    update public.transport_trips set status = 'accepted' where id = trip_of('two', 'm1');
    raise exception 'loser: direct update allowed';
  exception when others then
    if sqlerrm <> 'Another operator accepted this trip.' then raise; end if;
  end;
  begin
    perform public.accept_transport_broadcast_request(trip_of('two', 'm2'));
    raise exception 'auth: accepted another fleet''s request';
  exception when others then
    if sqlerrm <> 'This request was not sent to your fleet.' then raise; end if;
  end;
end $$;
-- Passenger sees who accepted (no coordinates).
select as_user('00000000-0000-4000-8000-0000000000a0');
do $$
declare s jsonb := public.transport_broadcast_booking_status(grp('two'));
begin
  if s ->> 'status' <> 'accepted' or s -> 'accepted' ->> 'operator_name' <> 'Operator m2' or s -> 'accepted' ->> 'plate_number' <> 'SL-M2'
     or (s -> 'accepted' ->> 'distance_km')::numeric <> 1.0 or (s -> 'accepted' ->> 'eta_minutes')::int < 1 or s -> 'accepted' ->> 'vehicle' <> 'Red Honda Ace' then
    raise exception 'accepted snapshot: %', s;
  end if;
  if s::text ~ '"(lat|lng|[a-z_]*latitude|[a-z_]*longitude|contact_phone)"' then raise exception 'snapshot leaks coordinates or phone: %', s; end if;
end $$;
update public.transport_trips set status = 'completed' where id = trip_of('two', 'm2');

-- 8. Passenger cancels while searching: every request withdrawn, nobody notified.
insert into results select 'three', book();
do $$
declare s jsonb; alerts int := (select count(*) from public.transport_operator_alerts); notes int := (select count(*) from public.transport_passenger_notifications);
begin
  s := public.cancel_transport_broadcast_booking(grp('three'));
  if s ->> 'status' <> 'cancelled' then raise exception 'cancel: %', s; end if;
  if exists (select 1 from public.transport_trips where open_booking_id = grp('three') and status <> 'withdrawn') then raise exception 'cancel: not all withdrawn'; end if;
  if alerts <> (select count(*) from public.transport_operator_alerts) or notes <> (select count(*) from public.transport_passenger_notifications) then
    raise exception 'cancel: someone was notified';
  end if;
end $$;
select as_op('m1');
do $$
declare r jsonb := public.accept_transport_broadcast_request(trip_of('three', 'm1'));
begin
  if r ->> 'reason' <> 'withdrawn' or r ->> 'message' <> 'The passenger cancelled this request.' then raise exception 'withdrawn accept: %', r; end if;
end $$;
-- The older cancel path (one request cancelled by the passenger) withdraws the rest too.
select as_user('00000000-0000-4000-8000-0000000000a0');
insert into results select 'four', book();
update public.transport_trips set status = 'cancelled', ended_by = 'passenger' where id = trip_of('four', 'm1');
do $$
begin
  if exists (select 1 from public.transport_trips where open_booking_id = grp('four') and id <> trip_of('four', 'm1') and status <> 'withdrawn') then
    raise exception 'legacy cancel: not withdrawn';
  end if;
  if (select status from public.transport_broadcast_bookings where open_booking_id = grp('four')) <> 'cancelled' then raise exception 'legacy cancel: booking open'; end if;
  if exists (select 1 from public.transport_operator_alerts where title = 'Open request withdrawn') then raise exception 'legacy cancel: withdrawn alerts sent'; end if;
end $$;

-- Earlier bookings leave the throttle window (5 per 10 minutes).
update public.transport_trips set created_at = now() - interval '1 hour' where open_booking_id is not null;

-- 9. Cap: 35 tricycles within 5 km -> 30 in wave 1, the other 5 in wave 2, nobody twice.
select make_op('t' || lpad(i::text, 2, '0'), 0.1 * i, p_type => 'tricycle') from generate_series(1, 35) i;
insert into results select 'cap', book('tricycle');
select end_wave('cap');
do $$
declare first jsonb := (select value from results where name = 'cap'); s jsonb := public.transport_broadcast_booking_status(grp('cap'));
begin
  if (first ->> 'notified_count')::int <> 30 then raise exception 'cap: first wave %', first; end if;
  if (s ->> 'notified_count')::int <> 36 or (s ->> 'wave')::int <> 2 then raise exception 'cap: second wave %', s; end if;  -- 35 + the 1 km tricycle
  if (select count(distinct fleet_id) from public.transport_trips where open_booking_id = grp('cap')) <> 36
     or (select count(*) from public.transport_trips where open_booking_id = grp('cap')) <> 36 then
    raise exception 'cap: duplicates';
  end if;
end $$;
select public.cancel_transport_broadcast_booking(grp('cap')) is not null;

-- 10. Nobody available within 30 km: nothing is created (the app falls back to the older open booking).
do $$
declare r jsonb := public.create_transport_broadcast_booking('ride', 'car', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', null, null,
  40, 'SLE', 'SL', 'Sierra Leone', null, null, null, null, 1, null, null);
begin
  if (r ->> 'notified_count')::int <> 0 or r ->> 'open_booking_id' is not null or r ->> 'reach' <> 'none' then raise exception 'none: %', r; end if;
  begin
    perform public.create_transport_broadcast_booking('ride', 'motorcycle', 'Somewhere', 8.4657, -13.2317, 'Lumley', null, null, 0, 'SLE', 'SL', null, null, null, null, null, 1, null, null);
    raise exception 'validation: zero fare accepted';
  exception when others then
    if sqlerrm <> 'Add the fare you are offering.' then raise; end if;
  end;
end $$;

-- 11. Every wave settles stale requests: a request past its expiry cannot be accepted.
insert into results select 'five', book();
update public.transport_trips set broadcast_expires_at = now() - interval '1 second' where id = trip_of('five', 'm4');
select as_op('m4');
do $$
declare r jsonb := public.accept_transport_broadcast_request(trip_of('five', 'm4'));
begin
  if r ->> 'reason' <> 'expired' then raise exception 'stale accept: %', r; end if;
  if (select status from public.transport_trips where id = trip_of('five', 'm4')) <> 'expired' then raise exception 'stale accept: request left in the queue'; end if;
end $$;
select as_user('00000000-0000-4000-8000-0000000000a0');
select public.cancel_transport_broadcast_booking(grp('five')) is not null;

-- 12. Concurrent accepts through the RPC (two real connections): exactly one winner, no deadlock.
insert into results select 'race', book();
select as_user('00000000-0000-4000-8000-0000000000a0');
do $$
declare
  conn text := format('dbname=%s port=%s host=%s', current_database(), current_setting('port'), split_part(current_setting('unix_socket_directories'), ',', 1));
  a_trip uuid := trip_of('race', 'm5'); b_trip uuid := trip_of('race', 'm6');
  a_uid text := (select user_id::text from ops where tag = 'm5'); b_uid text := (select user_id::text from ops where tag = 'm6');
  a jsonb; b jsonb;
begin
  perform dblink_connect('racer_a', conn);
  perform dblink_connect('racer_b', conn);
  perform dblink_exec('racer_a', 'begin');
  perform dblink_exec('racer_b', 'begin');
  perform dblink_exec('racer_a', format('set request.jwt.claim.sub = %L', a_uid));
  perform dblink_exec('racer_b', format('set request.jwt.claim.sub = %L', b_uid));
  -- A accepts and holds its transaction open; B's accept starts and must wait.
  select x into a from dblink('racer_a', format('select public.accept_transport_broadcast_request(%L)::text', a_trip)) as t(x jsonb);
  perform dblink_send_query('racer_b', format('select public.accept_transport_broadcast_request(%L)::text', b_trip));
  perform pg_sleep(0.3);
  if dblink_is_busy('racer_b') = 0 then raise exception 'race: B did not wait for A'; end if;
  perform dblink_exec('racer_a', 'commit');
  select x into b from dblink_get_result('racer_b') as t(x jsonb);
  perform * from dblink_get_result('racer_b') as t(x text);
  perform dblink_exec('racer_b', 'commit');
  perform dblink_disconnect('racer_a');
  perform dblink_disconnect('racer_b');
  if not (a ->> 'ok')::boolean then raise exception 'race: A lost: %', a; end if;
  if (b ->> 'ok')::boolean or b ->> 'reason' <> 'taken' or b ->> 'message' <> 'Another operator accepted this trip.' then raise exception 'race: B: %', b; end if;
  if (select count(*) from public.transport_trips where open_booking_id = grp('race') and status = 'accepted') <> 1 then raise exception 'race: not exactly one winner'; end if;
  if exists (select 1 from public.transport_trips where open_booking_id = grp('race') and status = 'requested') then raise exception 'race: requests left open'; end if;
end $$;
update public.transport_trips set status = 'completed' where open_booking_id = grp('race') and status = 'accepted';

-- 13. Older app (direct updates) racing: one holds B's row while A accepts; A wins
--     without a deadlock, B is refused, and the next status call tidies B's request.
insert into results select 'race2', book();
do $$
declare
  conn text := format('dbname=%s port=%s host=%s', current_database(), current_setting('port'), split_part(current_setting('unix_socket_directories'), ',', 1));
  a_trip uuid := trip_of('race2', 'm7'); b_trip uuid := trip_of('race2', 'm8');
  a_uid text := (select user_id::text from ops where tag = 'm7'); b_uid text := (select user_id::text from ops where tag = 'm8');
  b_error text := null;
begin
  perform dblink_connect('racer_a', conn);
  perform dblink_connect('racer_b', conn);
  perform dblink_exec('racer_b', 'begin');
  perform dblink_exec('racer_b', format('set request.jwt.claim.sub = %L', b_uid));
  perform dblink_exec('racer_b', format('update public.transport_trips set updated_at = updated_at where id = %L', b_trip));
  perform dblink_exec('racer_a', format('set request.jwt.claim.sub = %L', a_uid));
  perform dblink_exec('racer_a', format('update public.transport_trips set status = %L where id = %L', 'accepted', a_trip));
  begin
    perform dblink_exec('racer_b', format('update public.transport_trips set status = %L where id = %L', 'accepted', b_trip));
  exception when others then
    b_error := sqlerrm;
  end;
  perform dblink_exec('racer_b', 'rollback');
  perform dblink_disconnect('racer_a');
  perform dblink_disconnect('racer_b');
  if b_error is null or b_error !~ 'Another operator accepted this trip' then raise exception 'race2: B was not refused cleanly: %', b_error; end if;
  if (select count(*) from public.transport_trips where open_booking_id = grp('race2') and status = 'accepted') <> 1 then raise exception 'race2: not exactly one winner'; end if;
end $$;
do $$
declare s jsonb := public.transport_broadcast_booking_status(grp('race2'));
begin
  if s ->> 'status' <> 'accepted' then raise exception 'race2 status: %', s; end if;
  if exists (select 1 from public.transport_trips where open_booking_id = grp('race2') and status = 'requested') then raise exception 'race2: requests left open'; end if;
end $$;
update public.transport_trips set status = 'completed' where open_booking_id = grp('race2') and status = 'accepted';

-- 14. Background tick (pg_cron when present): widens and expires without the app.
update public.transport_trips set created_at = now() - interval '1 hour' where open_booking_id is not null;
insert into results select 'tick', book();
select end_wave('tick');
do $$
begin
  if public.transport_broadcast_tick() < 1 then raise exception 'tick: did nothing'; end if;
  if (select wave from public.transport_broadcast_bookings where open_booking_id = grp('tick')) <> 2 then raise exception 'tick: did not widen'; end if;
end $$;

-- 15. Older open bookings keep their behaviour (nearest five, 'taken' alert).
do $$
declare r jsonb := public.create_transport_open_booking('ride', 'motorcycle', 'Siaka Stevens Street', 8.4657, -13.2317, 'Lumley', null, null,
  20, 'SLE', 'SL', 'Sierra Leone', null, null, null, null, 1, null, null);
declare s jsonb;
begin
  if (r ->> 'notified_count')::int <> 5 then raise exception 'legacy: %', r; end if;
  s := public.transport_broadcast_booking_status((r ->> 'open_booking_id')::uuid);
  if s ->> 'mode' <> 'legacy' or s ->> 'status' <> 'searching' or (s ->> 'notified_count')::int <> 5 then raise exception 'legacy status: %', s; end if;
end $$;

-- 16. Security: helpers are private, passenger RPCs need a signed-in owner.
do $$
begin
  if has_function_privilege('authenticated', 'public.transport_broadcast_advance(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.transport_broadcast_tick()', 'execute')
     or has_function_privilege('authenticated', 'public.transport_broadcast_candidates(uuid, text, text, text, double precision, double precision, numeric, uuid, integer)', 'execute')
     or has_function_privilege('anon', 'public.transport_broadcast_booking_status(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.accept_transport_broadcast_request(uuid, numeric, text)', 'execute') then
    raise exception 'security: wrong grants';
  end if;
  perform as_op('m1');
  begin
    perform public.transport_broadcast_booking_status(grp('two'));
    raise exception 'security: another user read the booking';
  exception when others then
    if sqlerrm <> 'This booking was not found.' then raise; end if;
  end;
end $$;

select 'urride broadcast bookings: all scenarios passed' as result;
