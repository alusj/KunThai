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
  -- Provisioning an assignment is not an operator request to go on duty.
  -- Preserve only this same operator's runtime availability, never stale company metadata.
  select case when fleet.active_status = 'active' then 'active' else 'offline' end
  into runtime_active_status from public.transport_fleets fleet
  where fleet.company_fleet_id = company_fleet.id and fleet.operator_id = operator_uuid;
  runtime_active_status := coalesce(runtime_active_status, 'offline');
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

  -- A company's runtime row is identified only by company_fleet_id.
  -- Reusing an operator's same-plate solo/other-company row would transfer
  -- its history and dispatch access to this company.

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


-- Let authorized company staff submit fleets and invitations without becoming owners.
create policy "delegated staff can create company fleets"
on public.transport_company_fleets for insert to authenticated
with check (public.transport_company_user_has_permission(company_id, 'manage_fleets', auth.uid()));

create policy "delegated staff can update company fleets"
on public.transport_company_fleets for update to authenticated
using (public.transport_company_user_has_permission(company_id, 'manage_fleets', auth.uid()))
with check (public.transport_company_user_has_permission(company_id, 'manage_fleets', auth.uid()));

create policy "delegated staff can create company invites"
on public.transport_company_operator_invites for insert to authenticated
with check (
  status = 'pending'
  and public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid())
  and exists (select 1 from public.transport_company_fleets fleet
    where fleet.id = company_fleet_id and fleet.company_id = transport_company_operator_invites.company_id)
);
