-- UrRide open bookings, reach + limits (2026-09-27). Apply AFTER
-- 20260927120000_urride_open_bookings.sql.
--
-- Operators publish a live position only while their dashboard is open, so
-- "nearest by GPS" alone often found nobody although operators were active.
-- The request now goes out in tiers, using the first that finds anyone:
--   1. nearby: fresh live position, online and available, 3 -> 7 -> 15 -> 30 km
--   2. active: fleets switched to active (nearest known position first, then
--      most recently active)
--   3. all: every bookable fleet of that vehicle in the country (they get the
--      alert and can accept when they come online)
-- Also: passengers per vehicle (motorbike 1, tricycle 3, taxi 4) and a pickup
-- time that is now or within the next 30 days.

begin;

-- Fleets that may receive an open request, before any reach rule.
create or replace function public.transport_open_booking_eligible_fleets(
  p_uid uuid,
  p_trip_type text,
  p_fleet_type text,
  p_country text
)
returns table (fleet_id uuid, operator_id uuid, operator_user_id uuid, is_active boolean, last_active_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    fleet.id,
    operator.id,
    operator.user_id,
    lower(coalesce(fleet.active_status::text, '')) = 'active',
    fleet.last_active_at
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  -- Enum columns are compared as text so '' never has to be cast to the enum.
  where lower(coalesce(fleet.fleet_type::text, '')) = p_fleet_type
    and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
    and upper(coalesce(fleet.country_iso::text, '')) = p_country
    and (
      case when p_trip_type = 'ride'
        then lower(coalesce(fleet.service_category::text, 'transport')) in ('transport', 'both', 'ride only', 'ride and delivery')
        else lower(coalesce(fleet.service_category::text, '')) in ('delivery', 'both', 'delivery only', 'ride and delivery')
      end
    )
    and operator.user_id is distinct from p_uid
    -- An operator already on a job cannot accept another one.
    and not exists (
      select 1
      from public.transport_trips busy
      join public.transport_fleets busy_fleet on busy_fleet.id = busy.fleet_id
      where busy_fleet.operator_id = operator.id
        and busy.status::text in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
    );
$$;

revoke all on function public.transport_open_booking_eligible_fleets(uuid, text, text, text) from public, anon, authenticated;

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
  v_reach text := null;
  v_fleet_ids uuid[] := '{}';
  v_trip_ids uuid[] := '{}';
  v_name text;
  v_title text;
  v_passengers integer := greatest(1, coalesce(p_passenger_count, 1));
  v_max_passengers integer;
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

  -- Seats per vehicle: motorbike 1, tricycle 3, taxi 4.
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

  -- Tier 1: nearest by fresh live position.
  foreach v_radius in array array[3, 7, 15, 30]::numeric[] loop
    select coalesce(array_agg(nearest.fleet_id order by nearest.distance_km), '{}'::uuid[])
      into v_fleet_ids
    from (
      select per_operator.fleet_id, per_operator.distance_km
      from (
        select distinct on (eligible.operator_id)
          eligible.fleet_id,
          public.transport_open_booking_distance_km(p_pickup_lat, p_pickup_lng, location.lat, location.lng) as distance_km
        from public.transport_open_booking_eligible_fleets(v_uid, v_trip_type, v_fleet_type, v_country) eligible
        join public.transport_operator_locations location on location.operator_id = eligible.operator_user_id
        where eligible.is_active
          and location.status::text = 'online'
          and location.available = true
          and location.last_seen_at > now() - interval '10 minutes'
        order by eligible.operator_id, distance_km
      ) per_operator
      where per_operator.distance_km <= v_radius
      order by per_operator.distance_km
      limit 5
    ) nearest;

    if coalesce(array_length(v_fleet_ids, 1), 0) > 0 then
      v_used_radius := v_radius;
      v_reach := 'nearby';
      exit;
    end if;
  end loop;

  -- Tier 2: fleets switched to active; nearest known position first, then
  -- the most recently active.
  if coalesce(array_length(v_fleet_ids, 1), 0) = 0 then
    select coalesce(array_agg(picked.fleet_id order by picked.distance_km nulls last, picked.last_active_at desc nulls last), '{}'::uuid[])
      into v_fleet_ids
    from (
      select per_operator.*
      from (
        select distinct on (eligible.operator_id)
          eligible.fleet_id,
          eligible.last_active_at,
          case when location.operator_id is null then null
            else public.transport_open_booking_distance_km(p_pickup_lat, p_pickup_lng, location.lat, location.lng)
          end as distance_km
        from public.transport_open_booking_eligible_fleets(v_uid, v_trip_type, v_fleet_type, v_country) eligible
        left join public.transport_operator_locations location on location.operator_id = eligible.operator_user_id
        where eligible.is_active
        order by eligible.operator_id, eligible.last_active_at desc nulls last
      ) per_operator
      order by per_operator.distance_km nulls last, per_operator.last_active_at desc nulls last
      limit 5
    ) picked;
    if coalesce(array_length(v_fleet_ids, 1), 0) > 0 then v_reach := 'active'; end if;
  end if;

  -- Tier 3: every bookable fleet of that vehicle in the country.
  if coalesce(array_length(v_fleet_ids, 1), 0) = 0 then
    select coalesce(array_agg(picked.fleet_id order by picked.last_active_at desc nulls last), '{}'::uuid[])
      into v_fleet_ids
    from (
      select per_operator.*
      from (
        select distinct on (eligible.operator_id) eligible.fleet_id, eligible.last_active_at
        from public.transport_open_booking_eligible_fleets(v_uid, v_trip_type, v_fleet_type, v_country) eligible
        order by eligible.operator_id, eligible.last_active_at desc nulls last
      ) per_operator
      order by per_operator.last_active_at desc nulls last
      limit 5
    ) picked;
    if coalesce(array_length(v_fleet_ids, 1), 0) > 0 then v_reach := 'all'; end if;
  end if;

  if coalesce(array_length(v_fleet_ids, 1), 0) = 0 then
    return jsonb_build_object('open_booking_id', null, 'notified_count', 0, 'radius_km', null, 'reach', null, 'trip_ids', '[]'::jsonb);
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
      passenger_id, passenger_name, fleet_id, trip_type, trip_mode, title,
      pickup_label, pickup_latitude, pickup_longitude,
      destination_label, destination_latitude, destination_longitude,
      contact_phone, package_description, trip_note, country, country_iso,
      booking_method, estimated_distance_km, fare_amount, fare_currency,
      scheduled_at, status, open_booking_id
    )
    select
      v_uid, coalesce(v_name, 'Passenger'), target.fleet_id, v_trip_type, v_trip_type, v_title,
      trim(p_pickup_label), p_pickup_lat, p_pickup_lng,
      trim(p_destination_label), p_destination_lat, p_destination_lng,
      nullif(trim(coalesce(p_contact_phone, '')), ''),
      case when v_trip_type = 'delivery' then nullif(trim(coalesce(p_package_description, '')), '') else null end,
      nullif(trim(coalesce(p_trip_note, '')), ''),
      coalesce(nullif(trim(coalesce(p_country_name, '')), ''), v_country), v_country,
      'distance', p_estimated_distance_km, round(p_offer_amount, 2), v_currency,
      p_scheduled_at, 'requested', v_group
    from unnest(v_fleet_ids) as target(fleet_id)
    returning id
  )
  select coalesce(array_agg(inserted.id), '{}'::uuid[]) into v_trip_ids from inserted;

  return jsonb_build_object(
    'open_booking_id', v_group,
    'notified_count', coalesce(array_length(v_trip_ids, 1), 0),
    'radius_km', v_used_radius,
    'reach', v_reach,
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

commit;
