-- UrRide Nearby Area: tapping an operator on the map opens their profile (2026-10-24).
--
-- Map markers come from transport_operator_locations, keyed by the operator's
-- auth user id. The profile a shared link opens (#urride-fleet-<id>) is keyed
-- by transport_fleets.id, and passengers may not read transport_operators, so
-- the app cannot join the two itself. This returns the fleet (and company,
-- for a company fleet) behind an operator who is on the live map now, with
-- the same visibility rules as transport_available_operators_nearby.

begin;

create or replace function public.transport_live_operator_profile(p_operator_user_id uuid)
returns table (
  fleet_id uuid,
  company_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select fleet.id as fleet_id, fleet.company_id
  from public.transport_operator_locations location
  join public.transport_operators operator on operator.user_id = location.operator_id
  join public.transport_fleets fleet on fleet.operator_id = operator.id
  where location.operator_id = p_operator_user_id
    and location.last_seen_at > now() - interval '3 hours'
    and lower(coalesce(fleet.active_status::text, '')) = 'active'
    and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
  order by fleet.updated_at desc nulls last
  limit 1;
$$;

revoke all on function public.transport_live_operator_profile(uuid) from public;
grant execute on function public.transport_live_operator_profile(uuid) to anon, authenticated;

commit;
