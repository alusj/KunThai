-- Complete passenger saved operators, require identifiable fleet media, and
-- keep the original account phone available to UrRide and UrMall profiles.
begin;

create table if not exists public.transport_saved_operators (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.transport_fleets(id) on delete cascade,
  saved_as text not null default 'Saved operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (passenger_id, fleet_id)
);

create unique index if not exists transport_saved_operators_passenger_fleet_idx
  on public.transport_saved_operators(passenger_id, fleet_id);
create index if not exists transport_saved_operators_passenger_updated_idx
  on public.transport_saved_operators(passenger_id, updated_at desc);

alter table public.transport_saved_operators enable row level security;

drop policy if exists "passengers read saved transport operators" on public.transport_saved_operators;
create policy "passengers read saved transport operators"
on public.transport_saved_operators for select to authenticated
using (passenger_id = auth.uid());

drop policy if exists "passengers save transport operators" on public.transport_saved_operators;
create policy "passengers save transport operators"
on public.transport_saved_operators for insert to authenticated
with check (passenger_id = auth.uid());

drop policy if exists "passengers update saved transport operators" on public.transport_saved_operators;
create policy "passengers update saved transport operators"
on public.transport_saved_operators for update to authenticated
using (passenger_id = auth.uid())
with check (passenger_id = auth.uid());

drop policy if exists "passengers remove saved transport operators" on public.transport_saved_operators;
create policy "passengers remove saved transport operators"
on public.transport_saved_operators for delete to authenticated
using (passenger_id = auth.uid());

revoke all on public.transport_saved_operators from public, anon;
grant select, insert, update, delete on public.transport_saved_operators to authenticated;

-- Backfill public contact rows that were created before account-phone
-- prefilling was consistent. Auth remains the authoritative fallback.
update public.transport_operators operator
set phone = coalesce(
  nullif(btrim(account.raw_user_meta_data->>'phone_number'), ''),
  nullif(btrim(account.phone), '')
)
from auth.users account
where account.id = operator.user_id
  and nullif(btrim(operator.phone), '') is null
  and coalesce(
    nullif(btrim(account.raw_user_meta_data->>'phone_number'), ''),
    nullif(btrim(account.phone), '')
  ) is not null;

update public.marketplace_businesses business
set phone = coalesce(
  nullif(btrim(account.raw_user_meta_data->>'phone_number'), ''),
  nullif(btrim(account.phone), '')
)
from auth.users account
where account.id = business.user_id
  and nullif(btrim(business.phone), '') is null
  and coalesce(
    nullif(btrim(account.raw_user_meta_data->>'phone_number'), ''),
    nullif(btrim(account.phone), '')
  ) is not null;

do $$ begin
  alter table public.transport_operators
    add constraint transport_operators_phone_required
    check (phone is not null and length(btrim(phone)) > 0) not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_phone_required
    check (phone is not null and length(btrim(phone)) > 0) not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.marketplace_businesses
    add constraint marketplace_businesses_phone_required
    check (phone is not null and length(btrim(phone)) > 0) not valid;
exception when duplicate_object then null;
end $$;

-- Passenger-safe contact lookup avoids losing the phone when RLS hides the
-- nested operator row. It exposes only visible fleet contact information.
create or replace function public.get_public_transport_fleet_contacts(fleet_ids uuid[])
returns table (
  fleet_id uuid,
  operator_id uuid,
  operator_name text,
  operator_phone text
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
    )
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  left join auth.users account on account.id = operator.user_id
  where auth.uid() is not null
    and fleet.id = any(coalesce(fleet_ids, '{}'::uuid[]))
    and fleet.is_visible_to_passengers = true;
$$;

revoke all on function public.get_public_transport_fleet_contacts(uuid[]) from public, anon;
grant execute on function public.get_public_transport_fleet_contacts(uuid[]) to authenticated;

create or replace function public.get_transport_trip_operator_contacts(trip_ids uuid[])
returns table (
  trip_id uuid,
  operator_name text,
  operator_phone text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    trip.id,
    operator.full_name,
    coalesce(
      nullif(btrim(operator.phone), ''),
      nullif(btrim(account.raw_user_meta_data->>'phone_number'), ''),
      nullif(btrim(account.phone), '')
    )
  from public.transport_trips trip
  join public.transport_fleets fleet on fleet.id = trip.fleet_id
  join public.transport_operators operator on operator.id = fleet.operator_id
  left join auth.users account on account.id = operator.user_id
  where trip.id = any(coalesce(trip_ids, '{}'::uuid[]))
    and trip.passenger_id = auth.uid();
$$;

revoke all on function public.get_transport_trip_operator_contacts(uuid[]) from public, anon;
grant execute on function public.get_transport_trip_operator_contacts(uuid[]) to authenticated;

-- Fleet images identify the arriving vehicle and are never optional. Existing
-- legacy rows remain usable until their image field is deliberately changed.
create or replace function public.require_transport_fleet_images()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.public_fleet_photos is distinct from old.public_fleet_photos then
    if jsonb_typeof(coalesce(new.public_fleet_photos, '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(new.public_fleet_photos, '[]'::jsonb)) < 4 then
      raise exception 'Front, back, left-side, and right-side fleet images are required.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transport_fleets_require_images on public.transport_fleets;
create trigger transport_fleets_require_images
before insert or update of public_fleet_photos on public.transport_fleets
for each row execute function public.require_transport_fleet_images();

drop trigger if exists transport_company_fleets_require_images on public.transport_company_fleets;
create trigger transport_company_fleets_require_images
before insert or update of public_fleet_photos on public.transport_company_fleets
for each row execute function public.require_transport_fleet_images();

-- Only verification documents are optional. Fleet-image labels no longer show
-- "if available", and their required status remains explicit.
update public.kunthai_document_requirements
set inline_note = '', required = true, updated_at = now()
where surface = 'urride' and requirement_group = 'fleet_image';

update public.kunthai_document_requirements
set required = false, updated_at = now()
where (surface = 'urride' and requirement_group in ('company', 'operator'))
   or (surface = 'urmall' and requirement_group = 'seller');

commit;
