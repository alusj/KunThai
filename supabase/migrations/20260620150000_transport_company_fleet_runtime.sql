-- Company fleets must remain separate from an operator's personal fleet while
-- still having a transport_fleets runtime row for passenger discovery/bookings.

alter table if exists public.transport_company_fleets
  add column if not exists operator_id uuid references public.transport_operators(id) on delete set null,
  add column if not exists transport_fleet_id uuid references public.transport_fleets(id) on delete set null,
  add column if not exists is_visible_to_passengers boolean not null default false;

alter table if exists public.transport_fleets
  add column if not exists company_id uuid references public.transport_companies(id) on delete set null,
  add column if not exists company_fleet_id uuid references public.transport_company_fleets(id) on delete set null,
  add column if not exists fleet_code text;

update public.transport_company_fleets
set fleet_code = 'KTF-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where nullif(btrim(fleet_code), '') is null;

with duplicate_codes as (
  select
    id,
    row_number() over (partition by upper(btrim(fleet_code)) order by created_at, id) as duplicate_rank
  from public.transport_company_fleets
)
update public.transport_company_fleets as fleet
set fleet_code = 'KTF-' || upper(substr(replace(fleet.id::text, '-', ''), 1, 10))
from duplicate_codes as duplicate
where duplicate.id = fleet.id
  and duplicate.duplicate_rank > 1;

create unique index if not exists transport_company_fleets_global_code_unique_idx
  on public.transport_company_fleets (upper(btrim(fleet_code)));

create unique index if not exists transport_fleets_company_fleet_unique_idx
  on public.transport_fleets (company_fleet_id)
  where company_fleet_id is not null;

create index if not exists transport_company_fleets_operator_idx
  on public.transport_company_fleets (operator_id, company_id);

create or replace function public.transport_company_assign_unique_fleet_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  candidate text;
begin
  candidate := upper(btrim(coalesce(new.fleet_code, '')));

  if candidate = '' or exists (
    select 1
    from public.transport_company_fleets other
    where upper(btrim(other.fleet_code)) = candidate
      and other.id is distinct from new.id
  ) then
    loop
      candidate := 'KTF-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
      exit when not exists (
        select 1 from public.transport_company_fleets other
        where upper(btrim(other.fleet_code)) = candidate
      );
    end loop;
  end if;

  new.fleet_code := candidate;
  return new;
end;
$$;

drop trigger if exists transport_company_fleets_unique_code_trigger on public.transport_company_fleets;
create trigger transport_company_fleets_unique_code_trigger
before insert or update of fleet_code on public.transport_company_fleets
for each row execute function public.transport_company_assign_unique_fleet_code();

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
  runtime_country_iso := case lower(btrim(coalesce(company_record.country, '')))
    when 'sierra leone' then 'SL'
    when 'ghana' then 'GH'
    when 'nigeria' then 'NG'
    when 'liberia' then 'LR'
    when 'the gambia' then 'GM'
    when 'gambia' then 'GM'
    when 'guinea' then 'GN'
    when 'guinea-bissau' then 'GW'
    when 'senegal' then 'SN'
    when 'côte d''ivoire' then 'CI'
    when 'cote d''ivoire' then 'CI'
    when 'ivory coast' then 'CI'
    else 'SL'
  end;
  runtime_currency := case runtime_country_iso
    when 'GH' then 'GHS'
    when 'NG' then 'NGN'
    when 'LR' then 'LRD'
    when 'GM' then 'GMD'
    when 'GN' then 'GNF'
    when 'GW' then 'XOF'
    when 'SN' then 'XOF'
    when 'CI' then 'XOF'
    else 'SLE'
  end;

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
      company_record.country,
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

revoke all on function public.transport_company_provision_runtime_fleet(uuid, uuid) from public;

create or replace function public.transport_company_sync_accepted_operator_fleet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted'
    and new.company_fleet_id is not null
    and new.operator_id is not null then
    perform public.transport_company_provision_runtime_fleet(new.company_fleet_id, new.operator_id);
  end if;
  return new;
end;
$$;

drop trigger if exists transport_company_sync_accepted_operator_fleet_trigger on public.transport_company_operator_invites;
create trigger transport_company_sync_accepted_operator_fleet_trigger
after insert or update of status, operator_id, company_fleet_id on public.transport_company_operator_invites
for each row execute function public.transport_company_sync_accepted_operator_fleet();

create or replace function public.transport_company_sync_runtime_fleet_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.operator_id is not null then
    perform public.transport_company_provision_runtime_fleet(new.id, new.operator_id);
  end if;
  return new;
end;
$$;

drop trigger if exists transport_company_sync_runtime_fleet_details_trigger on public.transport_company_fleets;
create trigger transport_company_sync_runtime_fleet_details_trigger
after update of service_category, fleet_type, fleet_name, plate_number, make, model,
  manufacture_year, color, operating_area, home_base_location, documents,
  safety_answers, verification_status
on public.transport_company_fleets
for each row execute function public.transport_company_sync_runtime_fleet_details();

create or replace function public.transport_company_mirror_runtime_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_fleet_id is not null then
    update public.transport_company_fleets
    set
      transport_fleet_id = new.id,
      operator_id = new.operator_id,
      active_status = new.active_status,
      is_visible_to_passengers = new.is_visible_to_passengers,
      updated_at = now()
    where id = new.company_fleet_id;
  end if;
  return new;
end;
$$;

drop trigger if exists transport_company_mirror_runtime_availability_trigger on public.transport_fleets;
create trigger transport_company_mirror_runtime_availability_trigger
after update of active_status, is_visible_to_passengers on public.transport_fleets
for each row execute function public.transport_company_mirror_runtime_availability();

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
    raise exception 'Only the assigned company operator can change this fleet availability.';
  end if;

  if runtime_id is null then
    runtime_id := public.transport_company_provision_runtime_fleet(company_fleet_uuid, assigned_operator_id);
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

revoke all on function public.set_transport_company_operator_availability(uuid, boolean) from public;
grant execute on function public.set_transport_company_operator_availability(uuid, boolean) to authenticated;

-- Backfill accepted operator assignments and their passenger runtime rows.
do $$
declare
  assignment record;
begin
  for assignment in
    select distinct on (invite.company_fleet_id)
      invite.company_fleet_id,
      invite.operator_id
    from public.transport_company_operator_invites invite
    where invite.status = 'accepted'
      and invite.company_fleet_id is not null
      and invite.operator_id is not null
    order by invite.company_fleet_id, invite.updated_at desc nulls last, invite.created_at desc
  loop
    perform public.transport_company_provision_runtime_fleet(assignment.company_fleet_id, assignment.operator_id);
  end loop;
end;
$$;

drop policy if exists "passengers can read registered fleets" on public.transport_fleets;
drop policy if exists "passengers can read visible fleets" on public.transport_fleets;
create policy "passengers can read visible fleets"
on public.transport_fleets
for select
to anon, authenticated
using (is_visible_to_passengers = true);

drop function if exists public.get_public_transport_company_affiliations(uuid[]);
create function public.get_public_transport_company_affiliations(operator_ids uuid[])
returns table (
  operator_id uuid,
  transport_fleet_id uuid,
  company_fleet_id uuid,
  fleet_code text,
  company_id uuid,
  company_name text,
  company_code text,
  company_type text,
  company_city text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    fleet.operator_id,
    fleet.transport_fleet_id,
    fleet.id as company_fleet_id,
    fleet.fleet_code,
    company.id as company_id,
    company.company_name,
    company.company_code,
    company.company_type,
    company.city as company_city
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

revoke all on function public.get_public_transport_company_affiliations(uuid[]) from public;
grant execute on function public.get_public_transport_company_affiliations(uuid[]) to anon, authenticated;
