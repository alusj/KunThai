-- UrRide parcel hand-over: codes, tracking and the operator's Delivered, 2026-10-22.
--
-- A delivery (trip_type 'delivery') now runs:
--   accepted     The sender sees "Rider on the way to pick up" with the rider's
--                live position and a 4-digit pickup code.
--   in_progress  The rider enters the pickup code ("Item collected"). The
--                sender can track the parcel and send the receiver a link.
--   completed    The rider enters the receiver's 4-digit drop-off code
--                ("Delivered"). The job closes (ended_by 'operator') and the
--                sender can review, save or report the operator.
--
-- 1. transport_trips.receiver_phone (optional, entered by the sender).
-- 2. transport_parcel_handovers: one row per delivery with the two codes and a
--    tracking token. No client can read it directly; access is only through
--    the functions below. A trigger creates the row when a delivery is
--    inserted or accepted; transport_parcel_tracking() also creates it late.
-- 3. transport_parcel_tracking(trip)          sender: codes, link token, the
--                                             rider's live position.
--    transport_parcel_collect(trip, code)     operator: pickup code -> in_progress.
--    transport_parcel_deliver(trip, code)     operator: drop-off code -> completed.
--    transport_public_parcel_tracking(token)  anyone with the link (receiver).
--    A wrong code returns {ok:false}; five wrong codes lock that step for ten
--    minutes.
--
-- The passenger notifications for these steps are in
-- 20261022120000_urride_parcel_collected.sql (apply that one too).
-- Re-runnable.

begin;

alter table public.transport_trips
  add column if not exists receiver_phone text;

create table if not exists public.transport_parcel_handovers (
  trip_id uuid primary key references public.transport_trips(id) on delete cascade,
  pickup_code text not null,
  dropoff_code text not null,
  tracking_token text not null unique,
  pickup_failed_attempts int not null default 0,
  dropoff_failed_attempts int not null default 0,
  last_failed_at timestamptz,
  collected_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.transport_parcel_handovers enable row level security;
revoke all on table public.transport_parcel_handovers from anon, authenticated;

create or replace function public.transport_parcel_random_code()
returns text
language sql
volatile
as $$
  select lpad((floor(random() * 10000))::int::text, 4, '0');
$$;

create or replace function public.transport_parcel_ensure_handover(p_trip_id uuid)
returns public.transport_parcel_handovers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.transport_parcel_handovers;
begin
  insert into public.transport_parcel_handovers (trip_id, pickup_code, dropoff_code, tracking_token)
  values (
    p_trip_id,
    public.transport_parcel_random_code(),
    public.transport_parcel_random_code(),
    replace(gen_random_uuid()::text, '-', '')
  )
  on conflict (trip_id) do nothing;

  select * into v_row from public.transport_parcel_handovers where trip_id = p_trip_id;
  return v_row;
end;
$$;

revoke all on function public.transport_parcel_ensure_handover(uuid) from public, anon, authenticated;

create or replace function public.transport_parcel_create_handover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.trip_type, new.trip_mode) = 'delivery'
     and new.status in ('requested', 'waiting_operator', 'pending_confirmation', 'accepted') then
    perform public.transport_parcel_ensure_handover(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists transport_parcel_create_handover_trigger on public.transport_trips;
create trigger transport_parcel_create_handover_trigger
after insert or update of status on public.transport_trips
for each row execute function public.transport_parcel_create_handover();

-- Deliveries already on the road get their codes now.
insert into public.transport_parcel_handovers (trip_id, pickup_code, dropoff_code, tracking_token)
select trip.id,
       public.transport_parcel_random_code(),
       public.transport_parcel_random_code(),
       replace(gen_random_uuid()::text, '-', '')
from public.transport_trips trip
where coalesce(trip.trip_type, trip.trip_mode) = 'delivery'
  and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
on conflict (trip_id) do nothing;

-- The rider's best known position: the live operator location (kept fresh by
-- the app and, in the background, by native pings) or the trip's own last
-- progress point, whichever is newer.
create or replace function public.transport_parcel_rider_position(p_trip public.transport_trips)
returns table (lat double precision, lng double precision, located_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select fix.lat, fix.lng, fix.located_at
  from (
    select location.lat::double precision as lat, location.lng::double precision as lng, location.last_seen_at as located_at
    from public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    join public.transport_operator_locations location on location.operator_id = operator.user_id
    where fleet.id = p_trip.fleet_id
      and location.lat is not null and location.lng is not null
    union all
    select p_trip.last_location_latitude::double precision, p_trip.last_location_longitude::double precision, p_trip.last_location_at
    where p_trip.last_location_latitude is not null and p_trip.last_location_longitude is not null
  ) fix
  order by fix.located_at desc nulls last
  limit 1;
$$;

revoke all on function public.transport_parcel_rider_position(public.transport_trips) from public, anon, authenticated;

create or replace function public.transport_parcel_tracking(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.transport_trips;
  v_handover public.transport_parcel_handovers;
  v_lat double precision;
  v_lng double precision;
  v_at timestamptz;
  v_live boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to track this parcel.' using errcode = '42501';
  end if;

  select * into v_trip from public.transport_trips where id = p_trip_id;
  if v_trip.id is null or v_trip.passenger_id is distinct from auth.uid() then
    raise exception 'Parcel not found.' using errcode = '42501';
  end if;
  if coalesce(v_trip.trip_type, v_trip.trip_mode) <> 'delivery' then
    raise exception 'This trip is not a delivery.';
  end if;

  v_handover := public.transport_parcel_ensure_handover(v_trip.id);
  v_live := v_trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused');
  if v_live then
    select rider.lat, rider.lng, rider.located_at into v_lat, v_lng, v_at
    from public.transport_parcel_rider_position(v_trip) rider;
  end if;

  return jsonb_build_object(
    'status', v_trip.status,
    'pickup_code', case when v_trip.status in ('accepted', 'arrived', 'start_requested') then v_handover.pickup_code end,
    'dropoff_code', case when v_live then v_handover.dropoff_code end,
    'tracking_token', v_handover.tracking_token,
    'receiver_phone', v_trip.receiver_phone,
    'collected_at', coalesce(v_handover.collected_at, v_trip.started_at),
    'delivered_at', coalesce(v_handover.delivered_at, v_trip.completed_at),
    'rider_lat', v_lat,
    'rider_lng', v_lng,
    'rider_located_at', v_at
  );
end;
$$;

-- Shared by collect and deliver: the operator assigned to the trip, a wrong
-- code counted (not raised, so the count is kept), five misses lock the step
-- for ten minutes.
create or replace function public.transport_parcel_check_code(
  p_trip public.transport_trips,
  p_step text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handover public.transport_parcel_handovers;
  v_failed int;
  v_expected text;
begin
  if not exists (
    select 1
    from public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    where fleet.id = p_trip.fleet_id
      and operator.user_id = auth.uid()
  ) then
    raise exception 'Only the assigned operator can update this delivery.' using errcode = '42501';
  end if;

  v_handover := public.transport_parcel_ensure_handover(p_trip.id);
  v_failed := case when p_step = 'pickup' then v_handover.pickup_failed_attempts else v_handover.dropoff_failed_attempts end;
  if v_handover.last_failed_at < now() - interval '10 minutes' then
    v_failed := 0;
  end if;
  if v_failed >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  v_expected := case when p_step = 'pickup' then v_handover.pickup_code else v_handover.dropoff_code end;
  if regexp_replace(coalesce(p_code, ''), '\D', '', 'g') = v_expected then
    return jsonb_build_object('ok', true);
  end if;

  update public.transport_parcel_handovers
  set pickup_failed_attempts = case when p_step = 'pickup' then v_failed + 1 else pickup_failed_attempts end,
      dropoff_failed_attempts = case when p_step = 'dropoff' then v_failed + 1 else dropoff_failed_attempts end,
      last_failed_at = now()
  where trip_id = p_trip.id;

  return jsonb_build_object('ok', false, 'reason', case when v_failed + 1 >= 5 then 'locked' else 'wrong_code' end, 'attempts_left', greatest(0, 4 - v_failed));
end;
$$;

revoke all on function public.transport_parcel_check_code(public.transport_trips, text, text) from public, anon, authenticated;

create or replace function public.transport_parcel_collect(p_trip_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.transport_trips;
  v_check jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update this delivery.' using errcode = '42501';
  end if;
  select * into v_trip from public.transport_trips where id = p_trip_id for update;
  if v_trip.id is null or coalesce(v_trip.trip_type, v_trip.trip_mode) <> 'delivery' then
    raise exception 'Delivery not found.';
  end if;
  if v_trip.status not in ('accepted', 'arrived', 'start_requested') then
    return jsonb_build_object('ok', false, 'reason', 'wrong_status', 'status', v_trip.status);
  end if;

  v_check := public.transport_parcel_check_code(v_trip, 'pickup', p_code);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;

  update public.transport_parcel_handovers
  set collected_at = now(), pickup_failed_attempts = 0
  where trip_id = v_trip.id;

  update public.transport_trips
  set status = 'in_progress',
      started_at = now(),
      paused_at = null,
      updated_at = now()
  where id = v_trip.id;

  return jsonb_build_object('ok', true, 'status', 'in_progress');
end;
$$;

create or replace function public.transport_parcel_deliver(p_trip_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.transport_trips;
  v_check jsonb;
  v_paused_seconds int;
  v_elapsed_seconds numeric;
  v_units numeric;
  v_fare numeric;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update this delivery.' using errcode = '42501';
  end if;
  select * into v_trip from public.transport_trips where id = p_trip_id for update;
  if v_trip.id is null or coalesce(v_trip.trip_type, v_trip.trip_mode) <> 'delivery' then
    raise exception 'Delivery not found.';
  end if;
  if v_trip.status not in ('in_progress', 'paused') then
    return jsonb_build_object('ok', false, 'reason', 'wrong_status', 'status', v_trip.status);
  end if;

  v_check := public.transport_parcel_check_code(v_trip, 'dropoff', p_code);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;

  -- Same fare rule as the passenger's End trip (endTransportTrip in
  -- bookingService.js): metered when the booking has a rate, never under the
  -- base fare; otherwise the agreed fare stays.
  v_paused_seconds := coalesce(v_trip.paused_seconds, 0)
    + case when v_trip.paused_at is not null then greatest(0, extract(epoch from now() - v_trip.paused_at))::int else 0 end;
  v_elapsed_seconds := greatest(0, extract(epoch from now() - coalesce(v_trip.started_at, now())) - v_paused_seconds);
  v_units := case when v_trip.booking_method = 'time'
    then v_elapsed_seconds / 3600.0
    else coalesce(v_trip.distance_covered_meters, 0) / 1000.0 end;
  v_fare := case when coalesce(v_trip.rate_snapshot, 0) > 0
    then greatest(coalesce(v_trip.base_fare_snapshot, 0), v_trip.rate_snapshot * v_units)
    else v_trip.fare_amount end;

  update public.transport_parcel_handovers
  set delivered_at = now(), dropoff_failed_attempts = 0
  where trip_id = v_trip.id;

  update public.transport_trips
  set status = 'completed',
      ended_by = 'operator',
      fare_amount = v_fare,
      paused_at = null,
      paused_seconds = v_paused_seconds,
      updated_at = now()
  where id = v_trip.id;

  return jsonb_build_object('ok', true, 'status', 'completed');
end;
$$;

-- The receiver's link. Shows only what the receiver needs: the route, the
-- rider's first name and vehicle, the rider's position while the parcel is
-- on its way, and the drop-off code to give the rider.
create or replace function public.transport_public_parcel_tracking(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_handover public.transport_parcel_handovers;
  v_trip public.transport_trips;
  v_rider text;
  v_fleet_type text;
  v_plate text;
  v_lat double precision;
  v_lng double precision;
  v_at timestamptz;
  v_live boolean;
begin
  if coalesce(length(p_token), 0) < 16 then
    return null;
  end if;
  select * into v_handover from public.transport_parcel_handovers where tracking_token = p_token;
  if v_handover.trip_id is null then
    return null;
  end if;
  select * into v_trip from public.transport_trips where id = v_handover.trip_id;

  select split_part(coalesce(nullif(btrim(operator.full_name), ''), 'Rider'), ' ', 1), fleet.fleet_type::text, fleet.plate_number
    into v_rider, v_fleet_type, v_plate
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  where fleet.id = v_trip.fleet_id;

  v_live := v_trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused');
  if v_live then
    select rider.lat, rider.lng, rider.located_at into v_lat, v_lng, v_at
    from public.transport_parcel_rider_position(v_trip) rider;
  end if;

  return jsonb_build_object(
    'status', v_trip.status,
    'title', v_trip.title,
    'pickup_label', v_trip.pickup_label,
    'destination_label', v_trip.destination_label,
    'rider_name', v_rider,
    'fleet_type', v_fleet_type,
    'plate_number', v_plate,
    'dropoff_code', case when v_live then v_handover.dropoff_code end,
    'collected_at', coalesce(v_handover.collected_at, v_trip.started_at),
    'delivered_at', coalesce(v_handover.delivered_at, v_trip.completed_at),
    'rider_lat', v_lat,
    'rider_lng', v_lng,
    'rider_located_at', v_at
  );
end;
$$;

revoke all on function public.transport_parcel_tracking(uuid) from public, anon;
revoke all on function public.transport_parcel_collect(uuid, text) from public, anon;
revoke all on function public.transport_parcel_deliver(uuid, text) from public, anon;
grant execute on function public.transport_parcel_tracking(uuid) to authenticated;
grant execute on function public.transport_parcel_collect(uuid, text) to authenticated;
grant execute on function public.transport_parcel_deliver(uuid, text) to authenticated;
grant execute on function public.transport_public_parcel_tracking(text) to anon, authenticated;

commit;
