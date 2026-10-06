-- Distance from a passenger to specific fleets, for the Book a Ride / Send
-- Delivery category lists ("Active, closest, then offline").
--
-- Same position rules as transport_top_rated_nearby: the operator's live
-- position (online/busy, seen within 10 minutes) or their last known position
-- from the past 3 hours. Fleets with neither get no row, so the app shows no
-- distance rather than a made-up one. Coordinates never leave the database;
-- only a distance rounded to 0.1 km is returned.

create or replace function public.transport_fleet_distances(
  p_lat double precision,
  p_lng double precision,
  p_fleet_ids uuid[]
)
returns table (fleet_id uuid, distance_km numeric, location_source text)
language sql
stable
security definer
set search_path = public
as $$
  select
    fleet.id,
    round(public.transport_open_booking_distance_km(p_lat, p_lng, location.lat, location.lng)::numeric, 1),
    case
      when location.status in ('online', 'busy') and location.last_seen_at > now() - interval '10 minutes' then 'live'
      else 'recent'
    end
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
    and location.lng between -180 and 180;
$$;

revoke all on function public.transport_fleet_distances(double precision, double precision, uuid[]) from public;
grant execute on function public.transport_fleet_distances(double precision, double precision, uuid[]) to anon, authenticated;
