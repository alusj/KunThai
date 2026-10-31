-- UrRide: company, fleet and operator verified separately, seen together
-- (2026-10-31).
--
-- Each of the three keeps its own verification case and status, as before.
--
--  1. admin_transport_verification_links(case) lists, for any UrRide
--     verification case (operator, operator document, company fleet, solo
--     fleet, company), the company, fleets and operators connected to it,
--     each with its status and its latest verification case. The admin
--     console shows them on the case, so a reviewer sees "this operator drives
--     this fleet for this company" and opens each check from one place.
--  2. get_public_transport_fleet_contacts also returns the operator's and the
--     fleet's own verification status (a company fleet's status lives on
--     transport_company_fleets). Passengers see an operator as verified only
--     when both are verified; one without the other reads "Verification
--     pending" (passengerVerificationStatus in transportFleetService.js).
--
-- Safe to run more than once.

begin;

create or replace function public.admin_transport_verification_links(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_case public.admin_cases;
  v_seed_operators uuid[] := '{}';
  v_seed_company_fleets uuid[] := '{}';
  v_seed_solo_fleets uuid[] := '{}';
  v_seed_companies uuid[] := '{}';
  v_operators uuid[];
  v_company_fleets uuid[];
  v_solo_fleets uuid[];
  v_companies uuid[];
begin
  if not public.admin_has_permission('verification.view', 'transport') then
    raise exception 'Not authorized';
  end if;

  select * into v_case from public.admin_cases where id = p_case_id;
  if v_case.id is null or v_case.resource_id is null then return null; end if;

  if v_case.resource_type = 'transport_operator_verification' then
    v_seed_operators := array[v_case.resource_id];
  elsif v_case.resource_type = 'transport_document_verification' then
    select coalesce(array_agg(document.operator_id), '{}') into v_seed_operators
    from public.transport_operator_documents document
    where document.id = v_case.resource_id and document.operator_id is not null;
  elsif v_case.resource_type = 'transport_fleet_verification' then
    v_seed_company_fleets := array[v_case.resource_id];
  elsif v_case.resource_type = 'transport_solo_fleet_verification' then
    v_seed_solo_fleets := array[v_case.resource_id];
  elsif v_case.resource_type = 'transport_company_verification' then
    v_seed_companies := array[v_case.resource_id];
  else
    return null;
  end if;

  -- Companies: the case's own, the company of a company fleet, and any company
  -- the operator drives for or is an active member of.
  select coalesce(array_agg(distinct company_id), '{}') into v_companies
  from (
    select unnest(v_seed_companies) as company_id
    union select fleet.company_id from public.transport_company_fleets fleet where fleet.id = any(v_seed_company_fleets)
    union select fleet.company_id from public.transport_company_fleets fleet where fleet.operator_id = any(v_seed_operators) and fleet.archived_at is null
    union select fleet.company_id from public.transport_fleets fleet where fleet.id = any(v_seed_solo_fleets || '{}'::uuid[]) and fleet.company_id is not null
    union select member.company_id from public.transport_company_members member
      where member.operator_id = any(v_seed_operators) and member.status = 'active'
  ) found
  where company_id is not null;

  -- Company fleets: the case's own, the operator's, the one behind a runtime
  -- fleet, and every fleet of a company case.
  select coalesce(array_agg(distinct fleet_id), '{}') into v_company_fleets
  from (
    select unnest(v_seed_company_fleets) as fleet_id
    union select fleet.id from public.transport_company_fleets fleet where fleet.operator_id = any(v_seed_operators) and fleet.archived_at is null
    union select fleet.company_fleet_id from public.transport_fleets fleet
      where (fleet.id = any(v_seed_solo_fleets) or fleet.operator_id = any(v_seed_operators)) and fleet.company_fleet_id is not null
    union (select fleet.id from public.transport_company_fleets fleet
      where fleet.company_id = any(v_seed_companies) and fleet.archived_at is null
      order by fleet.created_at desc limit 40)
  ) found
  where fleet_id is not null;

  -- Solo fleets (the operator's own vehicle, not a company's).
  select coalesce(array_agg(distinct fleet_id), '{}') into v_solo_fleets
  from (
    select fleet.id as fleet_id from public.transport_fleets fleet
    where fleet.id = any(v_seed_solo_fleets) and fleet.company_fleet_id is null
    union select fleet.id from public.transport_fleets fleet
    where fleet.operator_id = any(v_seed_operators) and fleet.company_fleet_id is null and fleet.company_id is null
  ) found;

  -- Operators: the case's own and whoever drives the fleets above.
  select coalesce(array_agg(distinct operator_id), '{}') into v_operators
  from (
    select unnest(v_seed_operators) as operator_id
    union select fleet.operator_id from public.transport_company_fleets fleet where fleet.id = any(v_company_fleets)
    union select fleet.operator_id from public.transport_fleets fleet where fleet.company_fleet_id = any(v_company_fleets)
    union select fleet.operator_id from public.transport_fleets fleet where fleet.id = any(v_solo_fleets)
  ) found
  where operator_id is not null;

  return jsonb_build_object(
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', company.id,
        'name', company.company_name,
        'code', company.company_code,
        'status', company.verification_status,
        'resourceType', 'transport_company_verification',
        'caseId', latest.id,
        'caseStatus', latest.status
      ) order by company.company_name)
      from public.transport_companies company
      left join lateral (
        select item.id, item.status from public.admin_cases item
        where item.resource_type = 'transport_company_verification' and item.resource_id = company.id
        order by item.created_at desc limit 1
      ) latest on true
      where company.id = any(v_companies)
    ), '[]'::jsonb),
    'fleets', coalesce((
      select jsonb_agg(row_data order by row_data ->> 'name')
      from (
        select jsonb_build_object(
          'id', fleet.id,
          'kind', 'company',
          'name', coalesce(nullif(btrim(fleet.fleet_name), ''), concat_ws(' ', fleet.make, fleet.model), 'Fleet'),
          'plate', fleet.plate_number,
          'code', fleet.fleet_code,
          'status', fleet.verification_status,
          'companyId', fleet.company_id,
          'operatorId', coalesce(fleet.operator_id, runtime.operator_id),
          'resourceType', 'transport_fleet_verification',
          'caseId', latest.id,
          'caseStatus', latest.status
        ) as row_data
        from public.transport_company_fleets fleet
        left join public.transport_fleets runtime on runtime.company_fleet_id = fleet.id
        left join lateral (
          select item.id, item.status from public.admin_cases item
          where item.resource_type = 'transport_fleet_verification' and item.resource_id = fleet.id
          order by item.created_at desc limit 1
        ) latest on true
        where fleet.id = any(v_company_fleets)
        union all
        select jsonb_build_object(
          'id', fleet.id,
          'kind', 'solo',
          'name', coalesce(nullif(btrim(fleet.fleet_name), ''), concat_ws(' ', fleet.make, fleet.model), 'Fleet'),
          'plate', fleet.plate_number,
          'code', fleet.fleet_code,
          'status', fleet.verification_status,
          'companyId', null,
          'operatorId', fleet.operator_id,
          'resourceType', 'transport_solo_fleet_verification',
          'caseId', latest.id,
          'caseStatus', latest.status
        )
        from public.transport_fleets fleet
        left join lateral (
          select item.id, item.status from public.admin_cases item
          where item.resource_type = 'transport_solo_fleet_verification' and item.resource_id = fleet.id
          order by item.created_at desc limit 1
        ) latest on true
        where fleet.id = any(v_solo_fleets)
      ) rows
    ), '[]'::jsonb),
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', operator.id,
        'name', operator.full_name,
        'code', coalesce(nullif(btrim(operator.display_code), ''), case when operator.operator_code is not null then 'KT-' || operator.operator_code::text end),
        'status', operator.verification_status,
        'resourceType', 'transport_operator_verification',
        'caseId', latest.id,
        'caseStatus', latest.status
      ) order by operator.full_name)
      from public.transport_operators operator
      left join lateral (
        select item.id, item.status from public.admin_cases item
        where item.resource_type = 'transport_operator_verification' and item.resource_id = operator.id
        order by item.created_at desc limit 1
      ) latest on true
      where operator.id = any(v_operators)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_transport_verification_links(uuid) from public, anon;
grant execute on function public.admin_transport_verification_links(uuid) to authenticated;

-- Same as 20261014130000_urride_public_fleet_operator_city.sql plus the two
-- verification statuses.
drop function if exists public.get_public_transport_fleet_contacts(uuid[]);

create function public.get_public_transport_fleet_contacts(fleet_ids uuid[])
returns table (
  fleet_id uuid,
  operator_id uuid,
  operator_name text,
  operator_phone text,
  operator_code text,
  operator_city text,
  operator_verification_status text,
  fleet_verification_status text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    fleet.id,
    operator.id,
    operator.full_name,
    coalesce(
      nullif(btrim(operator.phone), ''),
      nullif(btrim(account.raw_user_meta_data->>'phone_number'), ''),
      nullif(btrim(account.phone), '')
    ),
    coalesce(
      nullif(btrim(operator.display_code), ''),
      case when nullif(btrim(operator.operator_code::text), '') is not null then 'KT-' || btrim(operator.operator_code::text) end
    ),
    nullif(btrim(coalesce(operator.city, '')), ''),
    operator.verification_status::text,
    coalesce(company_fleet.verification_status::text, fleet.verification_status::text)
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  left join public.transport_company_fleets company_fleet on company_fleet.id = fleet.company_fleet_id
  left join auth.users account on account.id = operator.user_id
  where auth.uid() is not null
    and fleet.id = any(coalesce(fleet_ids, '{}'::uuid[]))
    and fleet.is_visible_to_passengers = true;
$$;

revoke all on function public.get_public_transport_fleet_contacts(uuid[]) from public, anon;
grant execute on function public.get_public_transport_fleet_contacts(uuid[]) to authenticated;

commit;
