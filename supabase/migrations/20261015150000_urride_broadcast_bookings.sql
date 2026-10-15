-- UrRide broadcast bookings (Phase 3), 2026-10-15. Apply AFTER
-- 20260927120000_urride_open_bookings.sql, 20260927140000_urride_open_booking_reach.sql,
-- 20261001150000_admin_operations_platform.sql and 20261015130000_urride_live_discovery.sql.
--
-- An open booking now goes to EVERY available operator nearby at once and the
-- first to accept gets the trip (a broadcast), instead of only the nearest five.
--
-- Reach ("available" = the Phase 1 rule):
--   * fleet of the requested vehicle type and service (ride / delivery), Active,
--     visible to passengers (company fleets), registered in the passenger's
--     country, not restricted by an admin, operator not already on a trip,
--     not the passenger, not blocked either way (explore_user_blocks, when the
--     table exists);
--   * live position: status 'online', not marked unavailable, last_seen_at
--     within 2 minutes;
--   * one request per operator, at most 30 per wave (nearest first, only for
--     the cap).
-- Waves: 5 km first. Each wave lasts 45 s; if nobody has accepted, the next
-- wave widens to 10 -> 20 -> 30 km and adds the operators not reached yet (no
-- one gets the request twice). Empty rings are skipped. After the last wave
-- the booking is 'expired' and every open request becomes 'expired'.
-- The passenger's app drives the waves (transport_broadcast_booking_status /
-- expand_transport_broadcast_booking, polled every 5 s while the sheet is
-- open). When pg_cron is installed, a job also runs every minute
-- (transport_broadcast_tick), so bookings still widen and expire with the
-- app closed. Nothing relies on secrets.
--
-- Each request row carries broadcast_expires_at = end of the current wave +
-- 15 s grace. A new wave extends the open requests; a request past it can no
-- longer be accepted, and the operator app hides it.
--
-- First accept wins: accept_transport_broadcast_request() takes the booking's
-- advisory lock BEFORE it locks any trip row, so concurrent accepts queue up
-- instead of deadlocking; the first commits, every other open request of the
-- booking becomes 'taken' at once, and the next in line gets
-- {ok:false, reason:'taken', message:'Another operator accepted this trip.'}.
-- A direct status update (older app versions) still goes through the same
-- claim trigger and is refused with the same message.
--
-- Notifications: each request row is inserted once, so the existing
-- transport_notify_trip_changes() INSERT alert (and any push built on it)
-- fires exactly once per operator. 'taken', 'withdrawn', 'expired' and
-- 'declined' are outside every status the notification triggers announce, and
-- for broadcast bookings the settle trigger adds no "request taken/withdrawn"
-- alert. An operator declining a broadcast request is recorded as 'declined'
-- (not 'cancelled'), so the passenger is not told "Operator declined" up to
-- thirty times.
--
-- Older open bookings (no transport_broadcast_bookings row) behave exactly as
-- before. create_transport_open_booking() is not changed and stays the
-- fallback. Re-runnable; no existing row is changed or removed.

begin;

alter table public.transport_trips
  add column if not exists broadcast_expires_at timestamptz;

create index if not exists transport_trips_broadcast_expiry_idx
  on public.transport_trips (broadcast_expires_at)
  where broadcast_expires_at is not null;

create table if not exists public.transport_broadcast_bookings (
  open_booking_id uuid primary key,
  passenger_id uuid not null references auth.users(id) on delete cascade,
  trip_type text not null,
  fleet_type text not null,
  country_iso text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  template_trip_id uuid,
  status text not null default 'searching',
  wave integer not null default 1,
  max_wave integer not null default 4,
  radius_km numeric not null,
  wave_started_at timestamptz not null default now(),
  wave_expires_at timestamptz not null,
  notified_count integer not null default 0,
  accepted_trip_id uuid,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_broadcast_bookings_status_check
    check (status in ('searching', 'accepted', 'expired', 'cancelled'))
);

create index if not exists transport_broadcast_bookings_searching_idx
  on public.transport_broadcast_bookings (wave_expires_at)
  where status = 'searching';
create index if not exists transport_broadcast_bookings_passenger_idx
  on public.transport_broadcast_bookings (passenger_id, created_at desc);

alter table public.transport_broadcast_bookings enable row level security;
drop policy if exists "passengers read own broadcast bookings" on public.transport_broadcast_bookings;
create policy "passengers read own broadcast bookings"
  on public.transport_broadcast_bookings
  for select to authenticated
  using (passenger_id = auth.uid());
revoke all on public.transport_broadcast_bookings from public, anon, authenticated;
grant select on public.transport_broadcast_bookings to authenticated;

-- Wave rings, in km. Wave n uses element n.
create or replace function public.transport_broadcast_radii()
returns numeric[]
language sql
immutable
as $$ select array[5, 10, 20, 30]::numeric[] $$;

-- Lock shared by every path that changes one open booking (claim trigger,
-- accept, waves, cancel). Same key as the 2026-09-27 claim trigger.
create or replace function public.transport_open_booking_lock(p_open_booking_id uuid)
returns void
language sql
volatile
as $$ select pg_advisory_xact_lock(hashtextextended(p_open_booking_id::text, 0)) $$;

revoke all on function public.transport_open_booking_lock(uuid) from public, anon, authenticated;

-- Available operators of the booking's type within p_radius_km who have not
-- had a request of p_exclude_group yet. Nearest first, at most p_limit (<= 30).
create or replace function public.transport_broadcast_candidates(
  p_uid uuid,
  p_trip_type text,
  p_fleet_type text,
  p_country text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km numeric,
  p_exclude_group uuid default null,
  p_limit integer default 30
)
returns table (fleet_id uuid, operator_id uuid, distance_km double precision)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_blocked uuid[] := '{}';
begin
  if to_regclass('public.explore_user_blocks') is not null then
    execute $q$
      select coalesce(array_agg(distinct case when blocker_id = $1 then blocked_id else blocker_id end), '{}'::uuid[])
      from public.explore_user_blocks
      where blocker_id = $1 or blocked_id = $1
    $q$ into v_blocked using p_uid;
  end if;

  return query
  select picked.fleet_id, picked.operator_id, picked.distance_km
  from (
    select distinct on (eligible.operator_id)
      eligible.fleet_id,
      eligible.operator_id,
      public.transport_open_booking_distance_km(p_lat, p_lng, location.lat, location.lng) as distance_km
    from public.transport_open_booking_eligible_fleets(p_uid, p_trip_type, p_fleet_type, p_country) eligible
    join public.transport_operator_locations location on location.operator_id = eligible.operator_user_id
    where eligible.is_active
      and location.status::text = 'online'
      and coalesce((to_jsonb(location) ->> 'available')::boolean, true)
      and location.last_seen_at > now() - interval '2 minutes'
      and location.lat between -90 and 90
      and location.lng between -180 and 180
      and not (eligible.operator_user_id = any (v_blocked))
      and (
        p_exclude_group is null
        or not exists (
          select 1
          from public.transport_trips sent
          join public.transport_fleets sent_fleet on sent_fleet.id = sent.fleet_id
          where sent.open_booking_id = p_exclude_group
            and sent_fleet.operator_id = eligible.operator_id
        )
      )
    order by eligible.operator_id, distance_km
  ) picked
  where picked.distance_km <= p_radius_km
  order by picked.distance_km, picked.fleet_id
  limit greatest(1, least(coalesce(p_limit, 30), 30));
end;
$$;

revoke all on function public.transport_broadcast_candidates(uuid, text, text, text, double precision, double precision, numeric, uuid, integer) from public, anon, authenticated;

-- Sends one wave: a request row per new candidate, copied from the booking's
-- first request; at most p_limit (the wave cap, 30). Returns how many were
-- sent. Caller holds the booking lock and has set wave / radius / wave_expires_at.
create or replace function public.transport_broadcast_send_wave(p_open_booking_id uuid, p_limit integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.transport_broadcast_bookings%rowtype;
  v_count integer := 0;
begin
  select * into v_booking from public.transport_broadcast_bookings where open_booking_id = p_open_booking_id;
  if not found or v_booking.template_trip_id is null or coalesce(p_limit, 0) < 1 then
    return 0;
  end if;

  with inserted as (
    insert into public.transport_trips (
      passenger_id, passenger_name, fleet_id, trip_type, trip_mode, title,
      pickup_label, pickup_latitude, pickup_longitude,
      destination_label, destination_latitude, destination_longitude,
      contact_phone, package_description, trip_note, country, country_iso,
      booking_method, estimated_distance_km, fare_amount, fare_currency,
      scheduled_at, status, open_booking_id, broadcast_expires_at
    )
    select
      template.passenger_id, template.passenger_name, candidate.fleet_id, template.trip_type, template.trip_mode, template.title,
      template.pickup_label, template.pickup_latitude, template.pickup_longitude,
      template.destination_label, template.destination_latitude, template.destination_longitude,
      template.contact_phone, template.package_description, template.trip_note, template.country, template.country_iso,
      template.booking_method, template.estimated_distance_km, template.fare_amount, template.fare_currency,
      template.scheduled_at, 'requested', p_open_booking_id, v_booking.wave_expires_at + interval '15 seconds'
    from public.transport_trips template
    cross join public.transport_broadcast_candidates(
      v_booking.passenger_id, v_booking.trip_type, v_booking.fleet_type, v_booking.country_iso,
      v_booking.pickup_lat, v_booking.pickup_lng, v_booking.radius_km, p_open_booking_id, p_limit
    ) candidate
    where template.id = v_booking.template_trip_id
    returning 1
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function public.transport_broadcast_send_wave(uuid, integer) from public, anon, authenticated;

-- What the passenger's "Finding an operator" sheet shows. Never returns
-- operator coordinates or phone numbers; works for older open bookings too.
create or replace function public.transport_broadcast_snapshot(p_open_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking public.transport_broadcast_bookings%rowtype;
  v_has_booking boolean;
  v_winner public.transport_trips%rowtype;
  v_pending integer;
  v_sent integer;
  v_status text;
  v_accepted jsonb := null;
  v_radii numeric[] := public.transport_broadcast_radii();
  v_distance double precision;
begin
  select * into v_booking from public.transport_broadcast_bookings where open_booking_id = p_open_booking_id;
  v_has_booking := found;

  select count(*) filter (where trip.status in ('requested', 'waiting_operator', 'pending_confirmation')),
         count(*)
    into v_pending, v_sent
  from public.transport_trips trip
  where trip.open_booking_id = p_open_booking_id;

  select * into v_winner
  from public.transport_trips trip
  where trip.open_booking_id = p_open_booking_id
    and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
  order by trip.updated_at
  limit 1;

  if v_winner.id is not null then
    v_status := 'accepted';
    select
      public.transport_open_booking_distance_km(v_winner.pickup_latitude, v_winner.pickup_longitude, location.lat, location.lng)
      into v_distance
    from public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    join public.transport_operator_locations location on location.operator_id = operator.user_id
    where fleet.id = v_winner.fleet_id
      and location.last_seen_at > now() - interval '10 minutes'
      and v_winner.pickup_latitude is not null
      and v_winner.pickup_longitude is not null;

    select jsonb_build_object(
      'trip_id', v_winner.id,
      'status', v_winner.status,
      'fleet_id', v_winner.fleet_id,
      'operator_name', nullif(btrim(coalesce(operator.full_name, '')), ''),
      'fleet_name', nullif(btrim(coalesce(to_jsonb(fleet) ->> 'fleet_name', '')), ''),
      'fleet_type', lower(coalesce(fleet.fleet_type::text, '')),
      'vehicle', nullif(btrim(concat_ws(' ', to_jsonb(fleet) ->> 'color', to_jsonb(fleet) ->> 'make', to_jsonb(fleet) ->> 'model')), ''),
      'plate_number', nullif(btrim(coalesce(to_jsonb(fleet) ->> 'plate_number', '')), ''),
      'distance_km', case when v_distance is null then null else round(v_distance::numeric, 1) end,
      'eta_minutes', case when v_distance is null then null else greatest(1, ceil(
        v_distance / (case lower(coalesce(fleet.fleet_type::text, ''))
          when 'motorcycle' then 25 when 'tricycle' then 18 when 'car' then 22 else 20 end) * 60 + 2
      ))::integer end,
      'fare_amount', v_winner.fare_amount,
      'fare_currency', v_winner.fare_currency
    )
      into v_accepted
    from public.transport_fleets fleet
    left join public.transport_operators operator on operator.id = fleet.operator_id
    where fleet.id = v_winner.fleet_id;
  elsif v_has_booking then
    v_status := v_booking.status;
    -- Settled as accepted, but the winning trip has since been cancelled.
    if v_status = 'accepted' then v_status := 'cancelled'; end if;
  elsif v_pending > 0 then
    v_status := 'searching';
  elsif exists (
    select 1 from public.transport_trips trip
    where trip.open_booking_id = p_open_booking_id
      and (trip.status = 'withdrawn' or (trip.status = 'cancelled' and trip.ended_by = 'passenger'))
  ) then
    v_status := 'cancelled';
  else
    v_status := 'expired';
  end if;

  return jsonb_build_object(
    'open_booking_id', p_open_booking_id,
    'mode', case when v_has_booking then 'broadcast' else 'legacy' end,
    'status', v_status,
    'wave', case when v_has_booking then v_booking.wave end,
    'max_wave', case when v_has_booking then v_booking.max_wave end,
    'radius_km', case when v_has_booking then v_booking.radius_km end,
    'max_radius_km', v_radii[array_length(v_radii, 1)],
    'notified_count', case when v_has_booking then greatest(v_booking.notified_count, v_sent) else v_sent end,
    'pending_count', v_pending,
    'created_at', case when v_has_booking then v_booking.created_at end,
    'wave_started_at', case when v_has_booking then v_booking.wave_started_at end,
    'wave_expires_at', case when v_has_booking then v_booking.wave_expires_at end,
    'seconds_left', case when v_has_booking and v_status = 'searching'
      then greatest(0, ceil(extract(epoch from (v_booking.wave_expires_at - now()))))::integer end,
    'server_now', now(),
    'accepted', v_accepted,
    'message', case v_status
      when 'expired' then 'No operator accepted your request. Try again or raise your fare.'
      when 'cancelled' then 'This request was cancelled.'
      else null end
  );
end;
$$;

revoke all on function public.transport_broadcast_snapshot(uuid) from public, anon, authenticated;

-- Moves a broadcast booking along: settles it when someone accepted, opens
-- the next wave when the current one is over (or every open request was
-- declined), expires it after the last wave. Idempotent; safe to call often.
create or replace function public.transport_broadcast_advance(p_open_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.transport_broadcast_bookings%rowtype;
  v_radii numeric[] := public.transport_broadcast_radii();
  v_winner uuid;
  v_pending integer;
  v_sent integer := 0;
  v_next integer;
begin
  perform public.transport_open_booking_lock(p_open_booking_id);

  select * into v_booking
  from public.transport_broadcast_bookings
  where open_booking_id = p_open_booking_id
  for update;
  if not found then
    return;
  end if;

  select trip.id into v_winner
  from public.transport_trips trip
  where trip.open_booking_id = p_open_booking_id
    and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
  order by trip.updated_at
  limit 1;

  if v_booking.status = 'searching' and v_winner is not null then
    update public.transport_broadcast_bookings
       set status = 'accepted', accepted_trip_id = v_winner, ended_at = now(), updated_at = now()
     where open_booking_id = p_open_booking_id;
    v_booking.status := 'accepted';
  end if;

  -- Settled bookings: tidy any request a concurrent writer left open.
  if v_booking.status <> 'searching' then
    update public.transport_trips trip
       set status = case v_booking.status when 'accepted' then 'taken' when 'cancelled' then 'withdrawn' else 'expired' end,
           ended_by = 'system',
           updated_at = now()
     where trip.id in (
       select open_request.id
       from public.transport_trips open_request
       where open_request.open_booking_id = p_open_booking_id
         and open_request.status in ('requested', 'waiting_operator', 'pending_confirmation')
       for update skip locked
     );
    return;
  end if;

  select count(*) into v_pending
  from public.transport_trips trip
  where trip.open_booking_id = p_open_booking_id
    and trip.status in ('requested', 'waiting_operator', 'pending_confirmation');

  -- The current wave is still running.
  if now() < v_booking.wave_expires_at - interval '1 second' and v_pending > 0 then
    return;
  end if;

  -- Last wave over: the booking expires.
  if v_booking.wave >= v_booking.max_wave then
    update public.transport_broadcast_bookings
       set status = 'expired', ended_at = now(), updated_at = now()
     where open_booking_id = p_open_booking_id;
    update public.transport_trips trip
       set status = 'expired', ended_by = 'system', updated_at = now()
     where trip.id in (
       select open_request.id
       from public.transport_trips open_request
       where open_request.open_booking_id = p_open_booking_id
         and open_request.status in ('requested', 'waiting_operator', 'pending_confirmation')
       for update skip locked
     );
    return;
  end if;

  -- Next wave: the next ring that reaches someone new (empty rings skipped).
  v_next := v_booking.wave;
  loop
    v_next := v_next + 1;
    update public.transport_broadcast_bookings
       set wave = v_next,
           radius_km = v_radii[v_next],
           wave_started_at = now(),
           wave_expires_at = now() + interval '45 seconds',
           updated_at = now()
     where open_booking_id = p_open_booking_id
     returning * into v_booking;
    v_sent := public.transport_broadcast_send_wave(p_open_booking_id);
    exit when v_sent > 0 or v_next >= v_booking.max_wave;
  end loop;

  -- Nobody new and nobody left to answer: nothing to wait for.
  if v_sent = 0 and v_pending = 0 then
    update public.transport_broadcast_bookings
       set status = 'expired', ended_at = now(), updated_at = now()
     where open_booking_id = p_open_booking_id;
    return;
  end if;

  update public.transport_broadcast_bookings
     set notified_count = notified_count + v_sent
   where open_booking_id = p_open_booking_id;

  -- Earlier operators keep their request for the new wave too.
  update public.transport_trips trip
     set broadcast_expires_at = v_booking.wave_expires_at + interval '15 seconds'
   where trip.id in (
     select open_request.id
     from public.transport_trips open_request
     where open_request.open_booking_id = p_open_booking_id
       and open_request.status in ('requested', 'waiting_operator', 'pending_confirmation')
     for update skip locked
   );
end;
$$;

revoke all on function public.transport_broadcast_advance(uuid) from public, anon, authenticated;

create or replace function public.create_transport_broadcast_booking(
  p_trip_type text,
  p_fleet_type text,
  p_pickup_label text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_destination_label text,
  p_destination_lat double precision default null,
  p_destination_lng double precision default null,
  p_offer_amount numeric default null,
  p_currency text default null,
  p_country_iso text default null,
  p_country_name text default null,
  p_passenger_name text default null,
  p_contact_phone text default null,
  p_package_description text default null,
  p_trip_note text default null,
  p_passenger_count integer default 1,
  p_estimated_distance_km numeric default null,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip_type text := lower(trim(coalesce(p_trip_type, '')));
  v_fleet_type text := lower(trim(coalesce(p_fleet_type, '')));
  v_country text := upper(trim(coalesce(p_country_iso, '')));
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_group uuid := gen_random_uuid();
  v_radii numeric[] := public.transport_broadcast_radii();
  v_wave integer := 0;
  v_found integer := 0;
  v_name text;
  v_title text;
  v_passengers integer := greatest(1, coalesce(p_passenger_count, 1));
  v_max_passengers integer;
  v_template uuid;
  v_sent integer;
begin
  if v_uid is null then
    raise exception 'Sign in to book transport.';
  end if;
  if v_trip_type not in ('ride', 'delivery') then
    raise exception 'Choose ride or delivery.';
  end if;
  if v_fleet_type in ('van', 'taxi') then v_fleet_type := 'car'; end if;
  if v_fleet_type in ('bike', 'motorbike') then v_fleet_type := 'motorcycle'; end if;
  if v_fleet_type not in ('motorcycle', 'tricycle', 'car') then
    raise exception 'Choose a vehicle type.';
  end if;
  if nullif(trim(coalesce(p_pickup_label, '')), '') is null or p_pickup_lat is null or p_pickup_lng is null then
    raise exception 'Set your pickup point on the map so nearby operators can be found.';
  end if;
  if abs(p_pickup_lat) > 90 or abs(p_pickup_lng) > 180 then
    raise exception 'The pickup point is not valid.';
  end if;
  if nullif(trim(coalesce(p_destination_label, '')), '') is null then
    raise exception 'Add a drop-off point before sending.';
  end if;
  if p_offer_amount is null or p_offer_amount <= 0 then
    raise exception 'Add the fare you are offering.';
  end if;
  if length(v_currency) <> 3 then
    raise exception 'The fare currency is missing.';
  end if;
  if length(v_country) <> 2 then
    raise exception 'Choose your country in Settings before booking.';
  end if;
  if v_trip_type = 'delivery' and nullif(trim(coalesce(p_package_description, '')), '') is null then
    raise exception 'Describe the package before sending.';
  end if;

  if v_trip_type = 'ride' then
    v_max_passengers := case v_fleet_type when 'motorcycle' then 1 when 'tricycle' then 3 else 4 end;
    if v_passengers > v_max_passengers then
      raise exception 'Too many passengers for this vehicle.';
    end if;
  else
    v_passengers := 1;
  end if;

  if p_scheduled_at is not null
    and (p_scheduled_at < now() - interval '5 minutes' or p_scheduled_at > now() + interval '30 days') then
    raise exception 'Choose a pickup time within the next 30 days.';
  end if;

  -- Same abuse guard as open bookings: five per passenger every ten minutes.
  if (
    select count(distinct trip.open_booking_id)
    from public.transport_trips trip
    where trip.passenger_id = v_uid
      and trip.open_booking_id is not null
      and trip.created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Too many open bookings. Please wait a few minutes and try again.';
  end if;

  -- First ring that reaches anyone available.
  -- (A FOR loop variable would not outlive the loop, hence WHILE.)
  while v_wave < array_length(v_radii, 1) loop
    v_wave := v_wave + 1;
    select count(*) into v_found
    from public.transport_broadcast_candidates(v_uid, v_trip_type, v_fleet_type, v_country, p_pickup_lat, p_pickup_lng, v_radii[v_wave], null, 30);
    exit when v_found > 0;
  end loop;

  if v_found = 0 then
    -- Nobody available within 30 km: nothing is created. The app then falls
    -- back to create_transport_open_booking (wider reach tiers).
    return jsonb_build_object(
      'open_booking_id', null, 'notified_count', 0, 'radius_km', null,
      'reach', 'none', 'mode', 'broadcast', 'trip_ids', '[]'::jsonb
    );
  end if;

  select coalesce(
    nullif(trim(coalesce(p_passenger_name, '')), ''),
    nullif(trim(coalesce(account.raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(trim(coalesce(account.raw_user_meta_data ->> 'full_name', '')), ''),
    'Passenger'
  )
    into v_name
  from auth.users account
  where account.id = v_uid;

  v_title := case
    when v_trip_type = 'delivery' then 'Open delivery request'
    when v_passengers > 1 then 'Open ride request - ' || v_passengers || ' passengers'
    else 'Open ride request'
  end;

  perform public.transport_open_booking_lock(v_group);

  -- The booking row exists before any request, so the triggers know this is
  -- a broadcast booking from the first insert.
  insert into public.transport_broadcast_bookings (
    open_booking_id, passenger_id, trip_type, fleet_type, country_iso, pickup_lat, pickup_lng,
    status, wave, max_wave, radius_km, wave_started_at, wave_expires_at
  ) values (
    v_group, v_uid, v_trip_type, v_fleet_type, v_country, p_pickup_lat, p_pickup_lng,
    'searching', v_wave, array_length(v_radii, 1), v_radii[v_wave], now(), now() + interval '45 seconds'
  );

  -- The first request doubles as the template for later waves.
  with nearest as (
    select candidate.fleet_id
    from public.transport_broadcast_candidates(v_uid, v_trip_type, v_fleet_type, v_country, p_pickup_lat, p_pickup_lng, v_radii[v_wave], null, 30) candidate
    order by candidate.distance_km
    limit 1
  )
  insert into public.transport_trips (
    passenger_id, passenger_name, fleet_id, trip_type, trip_mode, title,
    pickup_label, pickup_latitude, pickup_longitude,
    destination_label, destination_latitude, destination_longitude,
    contact_phone, package_description, trip_note, country, country_iso,
    booking_method, estimated_distance_km, fare_amount, fare_currency,
    scheduled_at, status, open_booking_id, broadcast_expires_at
  )
  select
    v_uid, coalesce(v_name, 'Passenger'), nearest.fleet_id, v_trip_type, v_trip_type, v_title,
    trim(p_pickup_label), p_pickup_lat, p_pickup_lng,
    trim(p_destination_label), p_destination_lat, p_destination_lng,
    nullif(trim(coalesce(p_contact_phone, '')), ''),
    case when v_trip_type = 'delivery' then nullif(trim(coalesce(p_package_description, '')), '') else null end,
    nullif(trim(coalesce(p_trip_note, '')), ''),
    coalesce(nullif(trim(coalesce(p_country_name, '')), ''), v_country), v_country,
    'distance', p_estimated_distance_km, round(p_offer_amount, 2), v_currency,
    p_scheduled_at, 'requested', v_group, now() + interval '60 seconds'
  from nearest
  returning id into v_template;

  update public.transport_broadcast_bookings
     set template_trip_id = v_template
   where open_booking_id = v_group;

  -- Everyone else in the ring (the template's operator is excluded), within
  -- the wave cap of 30.
  v_sent := 1 + public.transport_broadcast_send_wave(v_group, 29);

  update public.transport_broadcast_bookings
     set notified_count = v_sent
   where open_booking_id = v_group;

  return jsonb_build_object(
    'open_booking_id', v_group,
    'notified_count', v_sent,
    'radius_km', v_radii[v_wave],
    'reach', 'broadcast',
    'mode', 'broadcast',
    'wave', v_wave,
    'max_wave', array_length(v_radii, 1),
    'wave_expires_at', now() + interval '45 seconds',
    'trip_ids', (
      select coalesce(jsonb_agg(trip.id order by trip.created_at, trip.id), '[]'::jsonb)
      from public.transport_trips trip
      where trip.open_booking_id = v_group
    )
  );
end;
$$;

revoke all on function public.create_transport_broadcast_booking(
  text, text, text, double precision, double precision, text, double precision, double precision,
  numeric, text, text, text, text, text, text, text, integer, numeric, timestamptz
) from public, anon;
grant execute on function public.create_transport_broadcast_booking(
  text, text, text, double precision, double precision, text, double precision, double precision,
  numeric, text, text, text, text, text, text, text, integer, numeric, timestamptz
) to authenticated;

-- Passenger: current state of their booking. Opens the next wave / expires
-- the booking when it is due, so polling alone drives the waves.
create or replace function public.transport_broadcast_booking_status(p_open_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to book transport.';
  end if;
  if p_open_booking_id is null or not exists (
    select 1 from public.transport_trips trip
    where trip.open_booking_id = p_open_booking_id and trip.passenger_id = v_uid
  ) then
    raise exception 'This booking was not found.';
  end if;

  if exists (
    select 1 from public.transport_broadcast_bookings booking
    where booking.open_booking_id = p_open_booking_id
      and (booking.status = 'searching' or exists (
        select 1 from public.transport_trips trip
        where trip.open_booking_id = p_open_booking_id
          and trip.status in ('requested', 'waiting_operator', 'pending_confirmation')
      ))
  ) then
    perform public.transport_broadcast_advance(p_open_booking_id);
  end if;

  return public.transport_broadcast_snapshot(p_open_booking_id);
end;
$$;

revoke all on function public.transport_broadcast_booking_status(uuid) from public, anon;
grant execute on function public.transport_broadcast_booking_status(uuid) to authenticated;

-- Passenger: "search a wider area now" (also called when the wave timer ends).
-- Never widens before the current wave is over.
create or replace function public.expand_transport_broadcast_booking(p_open_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.transport_broadcast_booking_status(p_open_booking_id);
end;
$$;

revoke all on function public.expand_transport_broadcast_booking(uuid) from public, anon;
grant execute on function public.expand_transport_broadcast_booking(uuid) to authenticated;

-- Passenger cancels while searching: every open request is withdrawn at once
-- (no one is notified). After an operator accepted, the trip itself is
-- cancelled from the trip screen as before.
create or replace function public.cancel_transport_broadcast_booking(p_open_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to book transport.';
  end if;
  if p_open_booking_id is null or not exists (
    select 1 from public.transport_trips trip
    where trip.open_booking_id = p_open_booking_id and trip.passenger_id = v_uid
  ) then
    raise exception 'This booking was not found.';
  end if;

  perform public.transport_open_booking_lock(p_open_booking_id);

  if not exists (
    select 1 from public.transport_trips trip
    where trip.open_booking_id = p_open_booking_id
      and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
  ) then
    update public.transport_broadcast_bookings
       set status = 'cancelled', ended_at = now(), updated_at = now()
     where open_booking_id = p_open_booking_id
       and status = 'searching';
    update public.transport_trips trip
       set status = 'withdrawn', ended_by = 'passenger', updated_at = now()
     where trip.open_booking_id = p_open_booking_id
       and trip.passenger_id = v_uid
       and trip.status in ('requested', 'waiting_operator', 'pending_confirmation');
  end if;

  return public.transport_broadcast_snapshot(p_open_booking_id);
end;
$$;

revoke all on function public.cancel_transport_broadcast_booking(uuid) from public, anon;
grant execute on function public.cancel_transport_broadcast_booking(uuid) to authenticated;

-- Operator: accept an open (broadcast or older) request. The booking lock is
-- taken before the trip row is locked, so concurrent accepts never deadlock:
-- exactly one wins; the others get reason 'taken'. Never raises for a request
-- that is gone; returns { ok, status, reason, message, trip }.
create or replace function public.accept_transport_broadcast_request(
  p_trip_id uuid,
  p_fare_amount numeric default null,
  p_fare_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.transport_trips%rowtype;
  v_group uuid;
  v_booking_status text;
  v_reason text := null;
begin
  if v_uid is null then
    raise exception 'Sign in to accept trips.';
  end if;

  select trip.open_booking_id into v_group
  from public.transport_trips trip
  join public.transport_fleets fleet on fleet.id = trip.fleet_id
  join public.transport_operators operator on operator.id = fleet.operator_id
  where trip.id = p_trip_id
    and operator.user_id = v_uid;
  if not found then
    raise exception 'This request was not sent to your fleet.';
  end if;
  if v_group is null then
    raise exception 'This is not an open request.';
  end if;

  perform public.transport_open_booking_lock(v_group);

  select * into v_trip from public.transport_trips where id = p_trip_id for update;

  if v_trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused') then
    return jsonb_build_object('ok', true, 'status', v_trip.status, 'reason', null, 'message', null, 'trip', to_jsonb(v_trip));
  end if;

  select booking.status into v_booking_status
  from public.transport_broadcast_bookings booking
  where booking.open_booking_id = v_group;

  if v_trip.status = 'taken' or exists (
    select 1 from public.transport_trips sibling
    where sibling.open_booking_id = v_group
      and sibling.id <> v_trip.id
      and sibling.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
  ) then
    v_reason := 'taken';
  elsif v_trip.status = 'withdrawn' or v_booking_status = 'cancelled'
    or (v_trip.status = 'cancelled' and v_trip.ended_by = 'passenger') then
    v_reason := 'withdrawn';
  elsif v_trip.status = 'expired' or v_booking_status = 'expired'
    or (v_trip.broadcast_expires_at is not null and v_trip.broadcast_expires_at < now()) then
    v_reason := 'expired';
  elsif v_trip.status not in ('requested', 'waiting_operator', 'pending_confirmation') then
    v_reason := 'unavailable';
  end if;

  if v_reason is not null then
    -- Settle this operator's copy so it leaves their queue now.
    if v_trip.status in ('requested', 'waiting_operator', 'pending_confirmation') then
      update public.transport_trips
         set status = case v_reason when 'taken' then 'taken' when 'withdrawn' then 'withdrawn' else 'expired' end,
             ended_by = 'system',
             updated_at = now()
       where id = v_trip.id
       returning * into v_trip;
    end if;
    return jsonb_build_object(
      'ok', false,
      'status', v_trip.status,
      'reason', v_reason,
      'message', case v_reason
        when 'taken' then 'Another operator accepted this trip.'
        when 'withdrawn' then 'The passenger cancelled this request.'
        when 'expired' then 'This request has expired.'
        else 'This request is no longer available.' end,
      'trip', null
    );
  end if;

  update public.transport_trips
     set status = 'accepted',
         fare_amount = case when p_fare_amount is not null and p_fare_amount > 0 then round(p_fare_amount, 2) else fare_amount end,
         fare_currency = case when p_fare_amount is not null and p_fare_amount > 0
           then coalesce(nullif(upper(btrim(coalesce(p_fare_currency, ''))), ''), fare_currency) else fare_currency end,
         updated_at = now()
   where id = v_trip.id
   returning * into v_trip;

  return jsonb_build_object('ok', true, 'status', v_trip.status, 'reason', null, 'message', null, 'trip', to_jsonb(v_trip));
end;
$$;

revoke all on function public.accept_transport_broadcast_request(uuid, numeric, text) from public, anon;
grant execute on function public.accept_transport_broadcast_request(uuid, numeric, text) to authenticated;

-- Background step (pg_cron, when installed): widen or expire bookings whose
-- wave is over, and close requests that outlived their booking.
create or replace function public.transport_broadcast_tick()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
  v_count integer := 0;
begin
  for v_group in
    select booking.open_booking_id
    from public.transport_broadcast_bookings booking
    where booking.status = 'searching'
      and booking.wave_expires_at < now()
    order by booking.wave_expires_at
    limit 200
  loop
    perform public.transport_broadcast_advance(v_group);
    v_count := v_count + 1;
  end loop;

  for v_group in
    select distinct trip.open_booking_id
    from public.transport_trips trip
    where trip.broadcast_expires_at < now() - interval '1 minute'
      and trip.status in ('requested', 'waiting_operator', 'pending_confirmation')
    limit 200
  loop
    perform public.transport_broadcast_advance(v_group);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.transport_broadcast_tick() from public, anon, authenticated;

-- Claim trigger (same trigger, same messages for older open bookings).
-- Broadcast bookings: an operator's decline is recorded as 'declined';
-- accepting a taken / withdrawn / expired request is refused with a clear
-- message; the winner check runs under the booking lock.
create or replace function public.transport_open_booking_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast boolean;
  v_booking_status text;
begin
  if new.open_booking_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  select booking.status into v_booking_status
  from public.transport_broadcast_bookings booking
  where booking.open_booking_id = new.open_booking_id;
  v_broadcast := found;

  if v_broadcast
    and new.status = 'cancelled'
    and coalesce(new.ended_by, '') = 'operator'
    and old.status in ('requested', 'waiting_operator', 'pending_confirmation') then
    new.status := 'declined';
    return new;
  end if;

  if new.status not in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused') then
    return new;
  end if;

  -- Moving along an already-won trip needs no check.
  if old.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused') then
    return new;
  end if;

  if old.status in ('taken', 'withdrawn', 'cancelled', 'completed', 'expired', 'declined') then
    if v_broadcast then
      raise exception '%', case old.status
        when 'taken' then 'Another operator accepted this trip.'
        when 'withdrawn' then 'The passenger cancelled this request.'
        when 'expired' then 'This request has expired.'
        else 'This request is no longer available.' end;
    end if;
    raise exception 'This open booking is no longer available.';
  end if;

  perform public.transport_open_booking_lock(new.open_booking_id);

  if exists (
    select 1
    from public.transport_trips sibling
    where sibling.open_booking_id = new.open_booking_id
      and sibling.id <> new.id
      and sibling.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
  ) then
    if v_broadcast then
      raise exception 'Another operator accepted this trip.';
    end if;
    raise exception 'Another operator already took this open booking.';
  end if;

  if v_broadcast then
    -- Re-read under the lock: a cancel or expiry may have just committed.
    select booking.status into v_booking_status
    from public.transport_broadcast_bookings booking
    where booking.open_booking_id = new.open_booking_id;
    if v_booking_status = 'cancelled' then
      raise exception 'The passenger cancelled this request.';
    end if;
    if v_booking_status = 'expired'
      or (new.broadcast_expires_at is not null and new.broadcast_expires_at < now()) then
      raise exception 'This request has expired.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transport_open_booking_claim_trigger on public.transport_trips;
create trigger transport_open_booking_claim_trigger
before update of status on public.transport_trips
for each row execute function public.transport_open_booking_claim();

-- Settle trigger (same trigger). Older open bookings: unchanged (others
-- become 'taken' / 'withdrawn' and get a short alert). Broadcast bookings: the
-- booking is marked accepted / cancelled, other open requests flip at once
-- (rows locked by a concurrent writer are skipped and tidied by the next
-- status call), and nobody is alerted.
create or replace function public.transport_open_booking_settle_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_status text;
  v_title text;
  v_body text;
  v_broadcast boolean;
begin
  if new.open_booking_id is null or new.status is not distinct from old.status then
    return null;
  end if;

  v_broadcast := exists (
    select 1 from public.transport_broadcast_bookings booking
    where booking.open_booking_id = new.open_booking_id
  );

  if new.status = 'accepted' then
    v_next_status := 'taken';
    v_title := 'Open request taken';
    v_body := 'Another operator accepted this open request first.';
  elsif new.status = 'cancelled'
    and coalesce(new.ended_by, '') = 'passenger'
    and old.status in ('requested', 'waiting_operator', 'pending_confirmation') then
    v_next_status := 'withdrawn';
    v_title := 'Open request withdrawn';
    v_body := 'The passenger cancelled this open request.';
  else
    return null;
  end if;

  if v_broadcast then
    update public.transport_broadcast_bookings
       set status = case v_next_status when 'taken' then 'accepted' else 'cancelled' end,
           accepted_trip_id = case v_next_status when 'taken' then new.id else accepted_trip_id end,
           ended_at = now(),
           updated_at = now()
     where open_booking_id = new.open_booking_id
       and status = 'searching';

    update public.transport_trips sibling
       set status = v_next_status,
           ended_by = 'system',
           updated_at = now()
     where sibling.id in (
       select open_request.id
       from public.transport_trips open_request
       where open_request.open_booking_id = new.open_booking_id
         and open_request.id <> new.id
         and open_request.status in ('requested', 'waiting_operator', 'pending_confirmation')
       for update skip locked
     );
    return null;
  end if;

  with settled as (
    update public.transport_trips sibling
       set status = v_next_status,
           ended_by = 'system',
           updated_at = now()
     where sibling.open_booking_id = new.open_booking_id
       and sibling.id <> new.id
       and sibling.status in ('requested', 'waiting_operator', 'pending_confirmation')
    returning sibling.id, sibling.fleet_id
  )
  insert into public.transport_operator_alerts (operator_id, fleet_id, alert_type, title, body, action_label, action_target)
  select fleet.operator_id, settled.fleet_id, 'system', v_title, v_body, 'View requests', 'trip:' || settled.id::text
  from settled
  join public.transport_fleets fleet on fleet.id = settled.fleet_id;

  return null;
end;
$$;

drop trigger if exists transport_open_booking_settle_group_trigger on public.transport_trips;
create trigger transport_open_booking_settle_group_trigger
after update of status on public.transport_trips
for each row
when (new.open_booking_id is not null)
execute function public.transport_open_booking_settle_group();

-- pg_cron (optional): every minute. Skipped quietly when pg_cron is absent or
-- the role may not schedule jobs; the app's polling drives the waves anyway.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $cron$select cron.unschedule(jobid) from cron.job where jobname = 'urride-broadcast-tick'$cron$;
      execute $cron$select cron.schedule('urride-broadcast-tick', '* * * * *', 'select public.transport_broadcast_tick()')$cron$;
    exception when others then
      raise notice 'urride-broadcast-tick was not scheduled: %', sqlerrm;
    end;
  end if;
end;
$$;

commit;
