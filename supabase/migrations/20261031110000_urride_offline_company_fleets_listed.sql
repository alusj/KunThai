-- Offline company operators stay in Book a ride and Send delivery (2026-10-31).
--
-- A company vehicle's runtime row (transport_fleets) has
-- is_visible_to_passengers = company listing AND online, so going offline
-- turned it off and the passenger lists (which show offline operators with
-- their last seen) dropped company operators while keeping solo ones. The
-- affiliation lookup now also says whether the company itself lists the
-- vehicle (company_listed: visible to passengers and not archived), so the
-- app keeps an offline company vehicle listed and hides only the ones the
-- company hid or archived. Live and nearby lists still show online only.
begin;

drop function if exists public.get_public_transport_company_affiliations(uuid[]);

create function public.get_public_transport_company_affiliations(operator_ids uuid[])
returns table(
  operator_id uuid, transport_fleet_id uuid, company_fleet_id uuid, fleet_code text,
  company_id uuid, company_name text, company_code text, company_type text, company_city text,
  company_listed boolean
)
language sql stable security definer set search_path = public as $$
  select
    fleet.operator_id,
    fleet.transport_fleet_id,
    fleet.id as company_fleet_id,
    fleet.fleet_code,
    company.id as company_id,
    company.company_name,
    company.company_code,
    company.company_type,
    company.city as company_city,
    coalesce(fleet.is_visible_to_passengers, false) and fleet.archived_at is null as company_listed
  from public.transport_company_fleets fleet
  join public.transport_companies company on company.id = fleet.company_id
  join public.transport_company_members member
    on member.company_id = fleet.company_id
   and member.operator_id = fleet.operator_id
  where fleet.operator_id = any(operator_ids)
    and fleet.transport_fleet_id is not null
    and member.status = 'active'
    and member.service_status = 'active';
$$;

grant execute on function public.get_public_transport_company_affiliations(uuid[]) to anon, authenticated, service_role;

commit;
