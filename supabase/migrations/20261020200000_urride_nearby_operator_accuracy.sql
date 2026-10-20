-- UrRide live discovery: each operator's position accuracy (2026-10-20).
--
-- A parked operator indoors often only has a 300 m cell fix; passengers were
-- shown "210 m away" for two phones side by side. The nearby list now also
-- returns accuracy_m (the operator's last published accuracy, metres), so the
-- app can say "Very close to you" or "About 400 m" instead of a false-precise
-- distance. Otherwise identical to 20261015130000_urride_live_discovery.sql.
-- The return type changes, so the function is dropped and created again.

begin;

drop function if exists public.transport_available_operators_nearby(double precision, double precision, numeric, text, integer, text, boolean);

create function public.transport_available_operators_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km numeric default 15,
  p_fleet_type text default null,
  p_limit integer default 20,
  p_country text default null,
  p_include_recent boolean default false
)
returns table (
  fleet_id uuid,
  fleet_name text,
  fleet_type text,
  service_category text,
  verification_status text,
  distance_km numeric,
  distance_m integer,
  eta_minutes integer,
  last_seen_at timestamptz,
  last_seen_place text,
  availability text,
  accuracy_m integer
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      upper(btrim(coalesce(p_country, ''))) as country,
      nullif(lower(btrim(coalesce(p_fleet_type, ''))), '') as fleet_type,
      least(greatest(coalesce(p_radius_km, 15), 1), 50)::double precision as radius_km,
      least(greatest(coalesce(p_limit, 20), 1), 50) as row_limit,
      coalesce(p_include_recent, false) as include_recent
    where p_lat between -90 and 90
      and p_lng between -180 and 180
      and upper(btrim(coalesce(p_country, ''))) ~ '^[A-Z]{2}$'
  ),
  box as (
    select
      params.*,
      params.radius_km / 111.045 as lat_span,
      params.radius_km / (111.045 * greatest(cos(radians(p_lat)), 0.01)) as lng_span
    from params
  ),
  candidates as (
    select
      fleet.id as fleet_id,
      fleet.fleet_name::text as fleet_name,
      lower(coalesce(fleet.fleet_type::text, '')) as fleet_type,
      fleet.service_category::text as service_category,
      lower(coalesce(fleet.verification_status::text, operator.verification_status::text, '')) as verification_status,
      public.transport_open_booking_distance_km(p_lat, p_lng, location.lat, location.lng) as distance_km,
      location.last_seen_at,
      nullif(left(btrim(coalesce(location.metadata->>'place', '')), 120), '') as last_seen_place,
      case when location.accuracy_meters >= 0 then round(location.accuracy_meters)::integer end as accuracy_m,
      case
        when location.status::text = 'online' and location.last_seen_at > now() - interval '2 minutes' then 'available'
        when location.status::text = 'busy' and location.last_seen_at > now() - interval '2 minutes' then 'busy'
        else 'recent'
      end as availability,
      box.radius_km,
      box.include_recent
    from box
    cross join public.transport_operator_locations location
    join public.transport_operators operator on operator.user_id = location.operator_id
    join public.transport_fleets fleet on fleet.operator_id = operator.id
    where location.last_seen_at > now() - interval '3 hours'
      and location.lat between p_lat - box.lat_span and p_lat + box.lat_span
      and (
        box.lng_span >= 180
        or location.lng between p_lng - box.lng_span and p_lng + box.lng_span
        or location.lng + 360 between p_lng - box.lng_span and p_lng + box.lng_span
        or location.lng - 360 between p_lng - box.lng_span and p_lng + box.lng_span
      )
      and location.lat between -90 and 90
      and location.lng between -180 and 180
      and lower(coalesce(fleet.active_status::text, '')) = 'active'
      and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
      and upper(coalesce(fleet.country_iso::text, '')) = box.country
      and (box.fleet_type is null or lower(coalesce(fleet.fleet_type::text, '')) = box.fleet_type)
  ),
  eligible as (
    select *
    from candidates
    where distance_km <= radius_km
  ),
  live as (
    select * from eligible
    where availability in ('available', 'busy')
    order by distance_km asc, last_seen_at desc
    limit (select row_limit from params)
  ),
  recent as (
    select * from eligible
    where availability = 'recent' and include_recent
    order by distance_km asc, last_seen_at desc
    limit (select row_limit from params)
  ),
  combined as (
    select live.*, 1 as tier from live
    union all
    select recent.*, 2 as tier from recent
  )
  select
    combined.fleet_id,
    combined.fleet_name,
    combined.fleet_type,
    combined.service_category,
    combined.verification_status,
    round(combined.distance_km::numeric, 1) as distance_km,
    (round(combined.distance_km * 100) * 10)::integer as distance_m,
    -- Same rough estimate as the app (topRatedNearby.estimateTravelMinutes):
    -- typical city speed per vehicle type plus 2 minutes to set off.
    greatest(1, ceil(
      combined.distance_km / (case combined.fleet_type
        when 'motorcycle' then 25 when 'tricycle' then 18 when 'car' then 22
        when 'van' then 20 when 'bus' then 18 when 'truck' then 18 else 20 end) * 60 + 2
    ))::integer as eta_minutes,
    combined.last_seen_at,
    combined.last_seen_place,
    combined.availability,
    combined.accuracy_m
  from combined
  order by combined.tier, combined.distance_km asc, combined.last_seen_at desc;
$$;

revoke all on function public.transport_available_operators_nearby(double precision, double precision, numeric, text, integer, text, boolean) from public;
grant execute on function public.transport_available_operators_nearby(double precision, double precision, numeric, text, integer, text, boolean) to anon, authenticated;

commit;
