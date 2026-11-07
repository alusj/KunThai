-- An UrRide verification case shows the verification of everything linked
-- to it (2026-10-29).
--
-- An operator, a vehicle and a company are each verified through their own
-- case, and each decision changes only its own record. Reviewing one, an
-- admin now sees the others:
--   - operator case: the operator's vehicles and their company;
--   - vehicle case (solo or company): the vehicle's operator and company;
--   - company case: the company's vehicles and operators;
--   - document case: the operator / vehicle the document belongs to.
-- Each linked record comes with its verification status and its latest
-- verification case (number and status), so the console can open it.
--
-- Read only. Same access as viewing the case (cases.view in its sector).
-- Safe to run more than once.

begin;

create or replace function public.admin_case_linked_verification(case_uuid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.admin_cases;
  v_source jsonb;
  v_operators uuid[] := '{}'::uuid[];
  v_solo uuid[] := '{}'::uuid[];
  v_company_fleets uuid[] := '{}'::uuid[];
  v_company uuid;
  v_anchor uuid;
begin
  select * into v_case from public.admin_cases where id = case_uuid;
  if v_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.view', v_case.sector) then raise exception 'Not authorized'; end if;
  if v_case.resource_type not in ('transport_operator_verification', 'transport_solo_fleet_verification',
       'transport_fleet_verification', 'transport_company_verification', 'transport_document_verification') then
    return null;
  end if;

  v_source := coalesce(v_case.metadata -> 'source', '{}'::jsonb);
  v_anchor := v_case.resource_id;

  -- 1. The case's own record.
  if v_case.resource_type = 'transport_operator_verification' then
    v_operators := array[v_case.resource_id];
  elsif v_case.resource_type = 'transport_solo_fleet_verification' then
    v_solo := array[v_case.resource_id];
  elsif v_case.resource_type = 'transport_fleet_verification' then
    v_company_fleets := array[v_case.resource_id];
  elsif v_case.resource_type = 'transport_company_verification' then
    v_company := v_case.resource_id;
  else
    -- A document belongs to an operator and sometimes one vehicle.
    v_anchor := null;
    v_operators := array_remove(array[coalesce(
      public.explore_try_uuid(v_source ->> 'operator_id'),
      case when v_case.metadata -> 'owner' ->> 'kind' = 'operator' then public.explore_try_uuid(v_case.metadata -> 'owner' ->> 'id') end)], null);
    if public.explore_try_uuid(v_source ->> 'fleet_id') is not null then
      v_solo := array[public.explore_try_uuid(v_source ->> 'fleet_id')];
    end if;
  end if;

  -- 2. Vehicles lead to their operator and company.
  select coalesce(array_agg(distinct fleet.operator_id) filter (where fleet.operator_id is not null), '{}'),
         (array_agg(fleet.company_id) filter (where fleet.company_id is not null))[1],
         coalesce(array_agg(distinct fleet.company_fleet_id) filter (where fleet.company_fleet_id is not null), '{}')
    into v_operators, v_company, v_company_fleets
  from (
    select operator_id, company_id, company_fleet_id from public.transport_fleets where id = any(v_solo)
    union all select unnest(v_operators), null::uuid, null::uuid
    union all select null::uuid, v_company, null::uuid
    union all select null::uuid, null::uuid, unnest(v_company_fleets)
  ) fleet;

  select v_operators || coalesce(array_agg(distinct cf.operator_id) filter (where cf.operator_id is not null), '{}'),
         coalesce(v_company, (array_agg(cf.company_id))[1])
    into v_operators, v_company
  from public.transport_company_fleets cf where cf.id = any(v_company_fleets);

  -- 3. Operators lead to their vehicles (own and company-assigned) and company.
  if v_case.resource_type in ('transport_operator_verification', 'transport_document_verification') then
    select v_solo || coalesce(array_agg(fleet.id), '{}') into v_solo
    from public.transport_fleets fleet
    where fleet.operator_id = any(v_operators) and fleet.company_fleet_id is null;
    select v_company_fleets || coalesce(array_agg(cf.id), '{}'), coalesce(v_company, (array_agg(cf.company_id))[1])
      into v_company_fleets, v_company
    from public.transport_company_fleets cf where cf.operator_id = any(v_operators);
    if v_company is null then
      select member.company_id into v_company
      from public.transport_company_members member
      join public.transport_operators operator on operator.user_id = member.user_id
      where operator.id = any(v_operators) and member.status = 'active'
      order by member.created_at desc limit 1;
    end if;
  end if;

  -- 4. A company case lists the company's vehicles and operators.
  if v_case.resource_type = 'transport_company_verification' then
    select coalesce(array_agg(cf.id), '{}'),
           coalesce(array_agg(distinct cf.operator_id) filter (where cf.operator_id is not null), '{}')
      into v_company_fleets, v_operators
    from (select id, operator_id from public.transport_company_fleets
          where company_id = v_company and archived_at is null
          order by created_at desc limit 25) cf;
    select v_operators || coalesce(array_agg(distinct operator.id), '{}') into v_operators
    from public.transport_company_members member
    join public.transport_operators operator on operator.user_id = member.user_id
    where member.company_id = v_company and member.status = 'active';
  end if;

  return jsonb_build_object(
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', operator.id, 'name', operator.full_name, 'code', operator.operator_code::text,
        'verificationStatus', operator.verification_status, 'accountStatus', operator.account_status,
        'current', operator.id = v_anchor,
        'case', public.admin_latest_verification_case('transport_operator_verification', operator.id))
        order by operator.full_name)
      from (select distinct unnest(v_operators) as id limit 25) ids
      join public.transport_operators operator on operator.id = ids.id), '[]'::jsonb),
    'vehicles', coalesce((
      select jsonb_agg(vehicle order by vehicle ->> 'name') from (
        select jsonb_build_object(
          'id', fleet.id, 'kind', 'solo', 'name', fleet.fleet_name, 'plate', fleet.plate_number,
          'verificationStatus', fleet.verification_status, 'current', fleet.id = v_anchor,
          'case', public.admin_latest_verification_case('transport_solo_fleet_verification', fleet.id)) as vehicle
        from public.transport_fleets fleet
        where fleet.id = any(v_solo) and fleet.company_fleet_id is null
        union all
        select jsonb_build_object(
          'id', cf.id, 'kind', 'company', 'name', cf.fleet_name, 'plate', cf.plate_number,
          'verificationStatus', cf.verification_status, 'current', cf.id = v_anchor,
          'case', public.admin_latest_verification_case('transport_fleet_verification', cf.id))
        from public.transport_company_fleets cf
        where cf.id = any(v_company_fleets)
      ) vehicles), '[]'::jsonb),
    'company', (
      select jsonb_build_object(
        'id', company.id, 'name', company.company_name, 'code', company.company_code,
        'verificationStatus', company.verification_status, 'current', company.id = v_anchor,
        'case', public.admin_latest_verification_case('transport_company_verification', company.id))
      from public.transport_companies company where company.id = v_company)
  );
end;
$$;

-- The newest verification case for one record: { id, number, status }.
create or replace function public.admin_latest_verification_case(p_resource_type text, p_resource_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', admin_case.id, 'number', admin_case.case_number, 'status', admin_case.status)
  from public.admin_cases admin_case
  where admin_case.resource_type = p_resource_type and admin_case.resource_id = p_resource_id
  order by admin_case.created_at desc
  limit 1;
$$;

revoke all on function public.admin_latest_verification_case(text, uuid) from public, anon, authenticated;
revoke all on function public.admin_case_linked_verification(uuid) from public, anon;
grant execute on function public.admin_case_linked_verification(uuid) to authenticated;

commit;
