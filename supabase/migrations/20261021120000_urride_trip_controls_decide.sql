-- UrRide: trip controls decide who gets open and broadcast bookings, 2026-10-21.
--
-- transport_open_booking_eligible_fleets() picked operators for a ride or a
-- delivery from transport_fleets.service_category (the registration choice),
-- so the dashboard's "Accept rides" / "Accept deliveries" switches did
-- nothing: an operator who turned rides off still got ride requests, and one
-- who registered for rides could not take deliveries by turning them on.
-- Now accepts_ride / accepts_delivery decide (both NOT NULL; the category is
-- only a fallback). The app's passenger lists use the same rule
-- (src/components/services/fleetServiceOffer.js).
--
-- Same function as production otherwise (pg_get_functiondef, 2026-10-21).
-- Function only; re-runnable.

begin;

create or replace function public.transport_open_booking_eligible_fleets(p_uid uuid, p_trip_type text, p_fleet_type text, p_country text)
 RETURNS TABLE(fleet_id uuid, operator_id uuid, operator_user_id uuid, is_active boolean, last_active_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- The operator's trip controls decide (Accept rides / Accept deliveries
    -- on the dashboard), not the category chosen at registration.
    and (
      case when p_trip_type = 'ride'
        then coalesce(fleet.accepts_ride, lower(coalesce(fleet.service_category::text, 'transport')) in ('transport', 'both', 'ride only', 'ride and delivery'))
        else coalesce(fleet.accepts_delivery, lower(coalesce(fleet.service_category::text, '')) in ('delivery', 'both', 'delivery only', 'ride and delivery'))
      end
    )
    and operator.user_id is distinct from p_uid
    -- Admin enforcement: suspended or trip-restricted operators/companies.
    and not public.kunthai_enforcement_blocks('transport_operator', operator.id, 'trips')
    and (fleet.company_id is null or not public.kunthai_enforcement_blocks('transport_company', fleet.company_id, 'trips'))
    -- An operator already on a job cannot accept another one.
    and not exists (
      select 1
      from public.transport_trips busy
      join public.transport_fleets busy_fleet on busy_fleet.id = busy.fleet_id
      where busy_fleet.operator_id = operator.id
        and busy.status::text in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
    );
$function$
;

commit;
