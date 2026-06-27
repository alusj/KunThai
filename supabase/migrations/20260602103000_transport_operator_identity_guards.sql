update public.transport_fleets
set
  plate_number = upper(regexp_replace(btrim(plate_number), '[[:space:]]+', ' ', 'g')),
  updated_at = now()
where plate_number is not null
  and plate_number <> upper(regexp_replace(btrim(plate_number), '[[:space:]]+', ' ', 'g'));

with ranked_operators as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.transport_operators
  where user_id is not null
),
archived_operators as (
  update public.transport_operators operator
  set
    user_id = null,
    account_status = 'duplicate_archived',
    verification_note = concat_ws(
      ' ',
      nullif(operator.verification_note, ''),
      'Archived by KunThai identity guard because this auth user already has a newer operator profile.'
    ),
    updated_at = now()
  from ranked_operators ranked
  where operator.id = ranked.id
    and ranked.duplicate_rank > 1
  returning operator.id
)
update public.transport_fleets fleet
set
  is_visible_to_passengers = false,
  active_status = 'offline',
  updated_at = now()
from archived_operators archived
where fleet.operator_id = archived.id;

with ranked_operator_fleets as (
  select
    id,
    row_number() over (
      partition by operator_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.transport_fleets
  where is_visible_to_passengers = true
),
hidden_operator_duplicates as (
  update public.transport_fleets fleet
  set
    is_visible_to_passengers = false,
    active_status = 'offline',
    updated_at = now()
  from ranked_operator_fleets ranked
  where fleet.id = ranked.id
    and ranked.duplicate_rank > 1
  returning fleet.id
)
select count(*) from hidden_operator_duplicates;

with ranked_plate_fleets as (
  select
    id,
    row_number() over (
      partition by upper(regexp_replace(btrim(plate_number), '[[:space:]]+', ' ', 'g'))
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.transport_fleets
  where is_visible_to_passengers = true
    and nullif(btrim(plate_number), '') is not null
    and upper(btrim(plate_number)) <> 'NO-PLATE'
),
hidden_plate_duplicates as (
  update public.transport_fleets fleet
  set
    is_visible_to_passengers = false,
    active_status = 'offline',
    updated_at = now()
  from ranked_plate_fleets ranked
  where fleet.id = ranked.id
    and ranked.duplicate_rank > 1
  returning fleet.id
)
select count(*) from hidden_plate_duplicates;

create unique index if not exists transport_operators_user_id_unique_idx
  on public.transport_operators (user_id)
  where user_id is not null;

create unique index if not exists transport_fleets_one_visible_per_operator_idx
  on public.transport_fleets (operator_id)
  where is_visible_to_passengers = true;

create unique index if not exists transport_fleets_visible_plate_unique_idx
  on public.transport_fleets (
    upper(regexp_replace(btrim(plate_number), '[[:space:]]+', ' ', 'g'))
  )
  where is_visible_to_passengers = true
    and nullif(btrim(plate_number), '') is not null
    and upper(btrim(plate_number)) <> 'NO-PLATE';

drop view if exists public.passenger_visible_transport_fleets;

create view public.passenger_visible_transport_fleets as
select
  f.id,
  o.display_code as operator_code,
  o.full_name as operator_name,
  f.service_category,
  f.fleet_type,
  f.fleet_name,
  f.plate_number,
  f.operating_area,
  f.home_base_location,
  f.delivery_body_type,
  f.verification_status,
  f.active_status,
  f.current_location_name,
  f.last_known_location_name,
  f.last_active_at,
  f.rating,
  f.completed_jobs,
  f.base_fare,
  f.price_per_km,
  f.price_per_hour,
  f.price_hint,
  f.created_at
from public.transport_fleets f
join public.transport_operators o on o.id = f.operator_id
where f.is_visible_to_passengers = true
  and o.user_id is not null
  and coalesce(o.account_status, '') <> 'duplicate_archived';
