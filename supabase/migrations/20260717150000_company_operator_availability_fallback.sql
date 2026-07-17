-- A company operator could accept an invite without the invite row carrying their
-- operator_id (older client flow), so transport_company_fleets.operator_id stayed
-- null and set_transport_company_operator_availability rejected the assigned
-- operator with "Only the assigned company operator can change this fleet
-- availability." / the dashboard showed "Fleet profile is missing."
-- Fall back to the accepted invite for the signed-in user, link the operator,
-- and provision the runtime fleet on demand.

-- transport_fleets.country is NOT NULL, but transport_companies.country can be
-- empty (the registration form does not force it). Fall back to the resolved
-- country iso so provisioning never fails on a missing company country.
create or replace function public.transport_company_provision_runtime_fleet(
  company_fleet_uuid uuid,
  operator_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company_fleet public.transport_company_fleets%rowtype;
  company_record public.transport_companies%rowtype;
  runtime_fleet_id uuid;
  runtime_service_category public.transport_service_category;
  runtime_fleet_type public.transport_fleet_type;
  runtime_verification public.transport_verification_status;
  runtime_active_status text;
  runtime_visible boolean;
  runtime_country_iso text;
  runtime_country text;
  runtime_currency text;
begin
  if company_fleet_uuid is null or operator_uuid is null then
    return null;
  end if;

  select * into company_fleet
  from public.transport_company_fleets
  where id = company_fleet_uuid
  for update;

  if not found then
    return null;
  end if;

  select * into company_record
  from public.transport_companies
  where id = company_fleet.company_id;

  runtime_service_category := case company_fleet.service_category
    when 'Ride only' then 'transport'::public.transport_service_category
    when 'Delivery only' then 'delivery'::public.transport_service_category
    else 'both'::public.transport_service_category
  end;
  runtime_fleet_type := case company_fleet.fleet_type
    when 'Motorbike' then 'motorcycle'::public.transport_fleet_type
    when 'Tricycle' then 'tricycle'::public.transport_fleet_type
    else 'car'::public.transport_fleet_type
  end;
  runtime_verification := case company_fleet.verification_status
    when 'verified' then 'verified'::public.transport_verification_status
    when 'rejected' then 'not_verified'::public.transport_verification_status
    when 'suspended' then 'not_verified'::public.transport_verification_status
    else 'verification_pending'::public.transport_verification_status
  end;
  runtime_active_status := case when company_fleet.active_status = 'active' then 'active' else 'offline' end;
  runtime_visible := coalesce(company_fleet.is_visible_to_passengers, false) and runtime_active_status = 'active';
  runtime_country_iso := public.kunthai_resolve_country_iso(
    coalesce(nullif(company_record.country_iso, ''), nullif(company_record.country, ''))
  );
  runtime_country := coalesce(nullif(company_record.country, ''), runtime_country_iso, 'SL');
  runtime_currency := public.kunthai_resolve_currency(
    runtime_country_iso,
    nullif(company_record.currency, '')
  );

  select fleet.id into runtime_fleet_id
  from public.transport_fleets fleet
  where fleet.company_fleet_id = company_fleet.id
  limit 1;

  if runtime_fleet_id is null and nullif(btrim(company_fleet.plate_number), '') is not null then
    select fleet.id into runtime_fleet_id
    from public.transport_fleets fleet
    where fleet.operator_id = operator_uuid
      and upper(regexp_replace(btrim(fleet.plate_number), '[[:space:]]+', ' ', 'g')) =
          upper(regexp_replace(btrim(company_fleet.plate_number), '[[:space:]]+', ' ', 'g'))
    order by fleet.updated_at desc nulls last
    limit 1;
  end if;

  if runtime_fleet_id is null then
    insert into public.transport_fleets (
      operator_id,
      service_category,
      fleet_type,
      fleet_name,
      plate_number,
      make,
      model,
      manufacture_year,
      color,
      operating_area,
      home_base_location,
      safety_answers,
      verification_status,
      active_status,
      is_visible_to_passengers,
      accepts_ride,
      accepts_delivery,
      country,
      country_iso,
      currency,
      company_id,
      company_fleet_id,
      fleet_code,
      updated_at
    ) values (
      operator_uuid,
      runtime_service_category,
      runtime_fleet_type,
      coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), 'NO-PLATE'),
      company_fleet.make,
      company_fleet.model,
      company_fleet.manufacture_year,
      company_fleet.color,
      coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      coalesce(company_fleet.safety_answers, '{}'::jsonb),
      runtime_verification,
      runtime_active_status,
      runtime_visible,
      company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      runtime_country,
      runtime_country_iso,
      runtime_currency,
      company_fleet.company_id,
      company_fleet.id,
      company_fleet.fleet_code,
      now()
    )
    returning id into runtime_fleet_id;
  else
    update public.transport_fleets
    set
      operator_id = operator_uuid,
      service_category = runtime_service_category,
      fleet_type = runtime_fleet_type,
      fleet_name = coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      plate_number = coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), plate_number),
      make = company_fleet.make,
      model = company_fleet.model,
      manufacture_year = company_fleet.manufacture_year,
      color = company_fleet.color,
      operating_area = coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      home_base_location = coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      safety_answers = coalesce(company_fleet.safety_answers, '{}'::jsonb),
      verification_status = runtime_verification,
      active_status = runtime_active_status,
      is_visible_to_passengers = runtime_visible,
      accepts_ride = company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      accepts_delivery = company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      country = coalesce(nullif(company_record.country, ''), country),
      country_iso = coalesce(nullif(runtime_country_iso, ''), country_iso),
      currency = coalesce(nullif(runtime_currency, ''), currency),
      company_id = company_fleet.company_id,
      company_fleet_id = company_fleet.id,
      fleet_code = company_fleet.fleet_code,
      updated_at = now()
    where id = runtime_fleet_id;
  end if;

  update public.transport_company_fleets
  set
    operator_id = operator_uuid,
    transport_fleet_id = runtime_fleet_id,
    updated_at = now()
  where id = company_fleet.id;

  return runtime_fleet_id;
end;
$$;

create or replace function public.set_transport_company_operator_availability(
  company_fleet_uuid uuid,
  active boolean
)
returns setof public.transport_fleets
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_operator_id uuid;
  runtime_id uuid;
begin
  select fleet.operator_id, fleet.transport_fleet_id
  into assigned_operator_id, runtime_id
  from public.transport_company_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  where fleet.id = company_fleet_uuid
    and operator.user_id = auth.uid();

  if assigned_operator_id is null then
    select operator.id
    into assigned_operator_id
    from public.transport_operators operator
    where operator.user_id = auth.uid()
      and exists (
        select 1
        from public.transport_company_operator_invites invite
        where invite.company_fleet_id = company_fleet_uuid
          and invite.status = 'accepted'
          and (invite.operator_user_id = auth.uid() or invite.operator_id = operator.id)
      )
    limit 1;
    runtime_id := null;

    if assigned_operator_id is not null then
      update public.transport_company_operator_invites
      set operator_id = assigned_operator_id,
          operator_user_id = auth.uid(),
          updated_at = now()
      where company_fleet_id = company_fleet_uuid
        and status = 'accepted'
        and (operator_user_id = auth.uid() or operator_id = assigned_operator_id)
        and (operator_id is null or operator_user_id is null);
    end if;
  end if;

  if assigned_operator_id is null then
    raise exception 'Only the assigned company operator can change this fleet availability.';
  end if;

  if runtime_id is null then
    runtime_id := public.transport_company_provision_runtime_fleet(company_fleet_uuid, assigned_operator_id);
  end if;

  if runtime_id is null then
    raise exception 'This company fleet could not be prepared for passenger service. Ask the company owner to review the fleet record.';
  end if;

  update public.transport_fleets
  set
    active_status = case when active then 'active' else 'offline' end,
    is_visible_to_passengers = active,
    pause_reason = case when active then '' else pause_reason end,
    last_active_at = now(),
    updated_at = now()
  where id = runtime_id;

  return query select * from public.transport_fleets where id = runtime_id;
end;
$$;
