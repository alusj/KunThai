-- UrRide open bookings (2026-09-27).
--
-- A passenger chooses ride or delivery, a vehicle type and the fare they offer;
-- the booking is not addressed to any fleet. The server finds the NEAREST
-- online, available operators of that type (live positions in
-- transport_operator_locations, widening 3 -> 7 -> 15 -> 30 km, at most five,
-- one per operator) and sends each a normal transport_trips request, all
-- sharing one open_booking_id. The first operator to accept wins; the other
-- requests become 'taken' at once. A passenger cancelling any request of the
-- group withdraws the whole open booking.
--
-- 'taken' / 'withdrawn' are outside every status list the apps read (active
-- trips, history, operator queues), so settled requests simply disappear, and
-- transport_notify_trip_changes() sends no passenger notification for them.

begin;

alter table public.transport_trips
  add column if not exists open_booking_id uuid;

create index if not exists transport_trips_open_booking_idx
  on public.transport_trips (open_booking_id)
  where open_booking_id is not null;

-- Great-circle distance in kilometres.
create or replace function public.transport_open_booking_distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371.0 * 2 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

create or replace function public.create_transport_open_booking(
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
  v_radius numeric;
  v_used_radius numeric := null;
  v_fleet_ids uuid[] := '{}';
  v_trip_ids uuid[] := '{}';
  v_name text;
  v_title text;
  v_passengers integer := greatest(1, least(coalesce(p_passenger_count, 1), 8));
begin
  if v_uid is null then
    raise exception 'Sign in to book transport.';
  end if;
  if v_trip_type not in ('ride', 'delivery') then
    raise exception 'Choose ride or delivery.';
  end if;
  -- Delivery vans are car fleets.
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

  -- Abuse guard: at most five open bookings per passenger every ten minutes.
  if (
    select count(distinct trip.open_booking_id)
    from public.transport_trips trip
    where trip.passenger_id = v_uid
      and trip.open_booking_id is not null
      and trip.created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Too many open bookings. Please wait a few minutes and try again.';
  end if;

  foreach v_radius in array array[3, 7, 15, 30]::numeric[] loop
    select coalesce(array_agg(nearest.fleet_id order by nearest.distance_km), '{}'::uuid[])
      into v_fleet_ids
    from (
      select per_operator.fleet_id, per_operator.distance_km
      from (
        select distinct on (operator.id)
          fleet.id as fleet_id,
          public.transport_open_booking_distance_km(p_pickup_lat, p_pickup_lng, location.lat, location.lng) as distance_km
        from public.transport_fleets fleet
        join public.transport_operators operator on operator.id = fleet.operator_id
        join public.transport_operator_locations location on location.operator_id = operator.user_id
        -- fleet_type / service_category (and on some deployments active_status)
        -- are enums: compare as text so '' never has to be cast to the enum.
        where lower(coalesce(fleet.fleet_type::text, '')) = v_fleet_type
          and lower(coalesce(fleet.active_status::text, '')) = 'active'
          and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
          and upper(coalesce(fleet.country_iso::text, '')) = v_country
          and (
            case when v_trip_type = 'ride'
              then lower(coalesce(fleet.service_category::text, 'transport')) in ('transport', 'both', 'ride only', 'ride and delivery')
              else lower(coalesce(fleet.service_category::text, '')) in ('delivery', 'both', 'delivery only', 'ride and delivery')
            end
          )
          and operator.user_id is distinct from v_uid
          and location.status::text = 'online'
          and location.available = true
          and location.last_seen_at > now() - interval '10 minutes'
          -- An operator already on a job cannot accept another one.
          and not exists (
            select 1
            from public.transport_trips busy
            join public.transport_fleets busy_fleet on busy_fleet.id = busy.fleet_id
            where busy_fleet.operator_id = operator.id
              and busy.status::text in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
          )
        order by operator.id, distance_km
      ) per_operator
      where per_operator.distance_km <= v_radius
      order by per_operator.distance_km
      limit 5
    ) nearest;

    if coalesce(array_length(v_fleet_ids, 1), 0) > 0 then
      v_used_radius := v_radius;
      exit;
    end if;
  end loop;

  if coalesce(array_length(v_fleet_ids, 1), 0) = 0 then
    return jsonb_build_object('open_booking_id', null, 'notified_count', 0, 'radius_km', null, 'trip_ids', '[]'::jsonb);
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

  with inserted as (
    insert into public.transport_trips (
      passenger_id,
      passenger_name,
      fleet_id,
      trip_type,
      trip_mode,
      title,
      pickup_label,
      pickup_latitude,
      pickup_longitude,
      destination_label,
      destination_latitude,
      destination_longitude,
      contact_phone,
      package_description,
      trip_note,
      country,
      country_iso,
      booking_method,
      estimated_distance_km,
      fare_amount,
      fare_currency,
      scheduled_at,
      status,
      open_booking_id
    )
    select
      v_uid,
      coalesce(v_name, 'Passenger'),
      target.fleet_id,
      v_trip_type,
      v_trip_type,
      v_title,
      trim(p_pickup_label),
      p_pickup_lat,
      p_pickup_lng,
      trim(p_destination_label),
      p_destination_lat,
      p_destination_lng,
      nullif(trim(coalesce(p_contact_phone, '')), ''),
      case when v_trip_type = 'delivery' then nullif(trim(coalesce(p_package_description, '')), '') else null end,
      nullif(trim(coalesce(p_trip_note, '')), ''),
      coalesce(nullif(trim(coalesce(p_country_name, '')), ''), v_country),
      v_country,
      'distance',
      p_estimated_distance_km,
      round(p_offer_amount, 2),
      v_currency,
      p_scheduled_at,
      'requested',
      v_group
    from unnest(v_fleet_ids) as target(fleet_id)
    returning id
  )
  select coalesce(array_agg(inserted.id), '{}'::uuid[]) into v_trip_ids from inserted;

  return jsonb_build_object(
    'open_booking_id', v_group,
    'notified_count', coalesce(array_length(v_trip_ids, 1), 0),
    'radius_km', v_used_radius,
    'trip_ids', to_jsonb(v_trip_ids)
  );
end;
$$;

revoke all on function public.create_transport_open_booking(
  text, text, text, double precision, double precision, text, double precision, double precision,
  numeric, text, text, text, text, text, text, text, integer, numeric, timestamptz
) from public, anon;
grant execute on function public.create_transport_open_booking(
  text, text, text, double precision, double precision, text, double precision, double precision,
  numeric, text, text, text, text, text, text, text, integer, numeric, timestamptz
) to authenticated;

-- First operator to accept wins. The advisory lock serialises concurrent
-- accepts of the same open booking; the loser gets a clear message.
create or replace function public.transport_open_booking_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.open_booking_id is null
    or new.status is not distinct from old.status
    or new.status not in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused') then
    return new;
  end if;

  -- Moving along an already-won trip needs no check.
  if old.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused') then
    return new;
  end if;

  if old.status in ('taken', 'withdrawn', 'cancelled', 'completed') then
    raise exception 'This open booking is no longer available.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.open_booking_id::text, 0));

  if exists (
    select 1
    from public.transport_trips sibling
    where sibling.open_booking_id = new.open_booking_id
      and sibling.id <> new.id
      and sibling.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
  ) then
    raise exception 'Another operator already took this open booking.';
  end if;

  return new;
end;
$$;

drop trigger if exists transport_open_booking_claim_trigger on public.transport_trips;
create trigger transport_open_booking_claim_trigger
before update of status on public.transport_trips
for each row execute function public.transport_open_booking_claim();

-- Settles the rest of the group: after an accept they become 'taken'; after
-- the passenger cancels one request they become 'withdrawn'. The operators
-- concerned get a short alert.
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
begin
  if new.open_booking_id is null or new.status is not distinct from old.status then
    return null;
  end if;

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

commit;
