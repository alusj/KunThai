-- UrRide: the fleet lists read an operator's position like "Available near
-- you" does (2026-10-22).
--
-- The Book a Ride / Send Delivery fleet lists showed "0.7 km away" at the
-- fleet's saved address while "Available near you" showed the same operator
-- "within about 1.8 km" near the place their phone last shared. Both read
-- transport_operator_locations, but the fleet lists had no shared place and no
-- accuracy. transport_fleet_distances now also returns:
--   distance_m       metres, same rounding as transport_available_operators_nearby
--   last_seen_place  where the operator's phone last shared its position
--   accuracy_m       that position's accuracy (metres)
-- so the app words distance and place the same way on every list.
-- Otherwise identical to 20261006130000_transport_fleet_distances.sql. The
-- return type changes, so the function is dropped and created again; the app
-- reads the new columns only when they are there.

begin;

drop function if exists public.transport_fleet_distances(double precision, double precision, uuid[]);

create function public.transport_fleet_distances(
  p_lat double precision,
  p_lng double precision,
  p_fleet_ids uuid[]
)
returns table (
  fleet_id uuid,
  distance_km numeric,
  location_source text,
  distance_m integer,
  last_seen_place text,
  accuracy_m integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    measured.id,
    round(measured.distance_km::numeric, 1),
    measured.location_source,
    (round(measured.distance_km * 100) * 10)::integer,
    measured.last_seen_place,
    measured.accuracy_m
  from (
    select
      fleet.id,
      public.transport_open_booking_distance_km(p_lat, p_lng, location.lat, location.lng) as distance_km,
      case
        when location.status in ('online', 'busy') and location.last_seen_at > now() - interval '10 minutes' then 'live'
        else 'recent'
      end as location_source,
      nullif(left(btrim(coalesce(location.metadata->>'place', '')), 120), '') as last_seen_place,
      case when location.accuracy_meters >= 0 then round(location.accuracy_meters)::integer end as accuracy_m
    from public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    join public.transport_operator_locations location on location.operator_id = operator.user_id
    where fleet.id = any(p_fleet_ids)
      and coalesce(array_length(p_fleet_ids, 1), 0) between 1 and 200
      and p_lat between -90 and 90
      and p_lng between -180 and 180
      and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
      and location.last_seen_at > now() - interval '3 hours'
      and location.lat between -90 and 90
      and location.lng between -180 and 180
  ) measured;
$$;

revoke all on function public.transport_fleet_distances(double precision, double precision, uuid[]) from public;
grant execute on function public.transport_fleet_distances(double precision, double precision, uuid[]) to anon, authenticated;

commit;
