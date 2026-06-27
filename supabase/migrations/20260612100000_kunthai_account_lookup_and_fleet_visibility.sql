create or replace function public.kunthai_public_user_id_from_uuid(input_user_id uuid)
returns text
language sql
stable
as $$
  with normalized as (
    select upper(regexp_replace(coalesce(input_user_id::text, ''), '[^A-Za-z0-9]', '', 'g')) as body
  )
  select case
    when length(body) >= 12 then 'KTU-' || substring(body from 1 for 4) || '-' || substring(body from 5 for 4) || '-' || right(body, 4)
    when body <> '' then 'KTU-' || body
    else ''
  end
  from normalized;
$$;

create or replace function public.lookup_kunthai_account_by_public_id(input_public_id text)
returns table (
  user_id uuid,
  public_id text,
  full_name text,
  username text,
  phone text,
  city text,
  avatar_url text,
  source text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_id text := upper(regexp_replace(coalesce(input_public_id, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if requested_id = '' then
    return;
  end if;

  if left(requested_id, 3) <> 'KTU' and length(requested_id) >= 4 then
    requested_id := 'KTU' || requested_id;
  end if;

  return query
  select
    account.user_id,
    account.public_id,
    account.full_name,
    account.username,
    account.phone,
    account.city,
    account.avatar_url,
    account.source
  from (
    select
      users.id as user_id,
      public.kunthai_public_user_id_from_uuid(users.id) as public_id,
      coalesce(
        nullif(profiles.display_name, ''),
        nullif(users.raw_user_meta_data->>'display_name', ''),
        nullif(users.raw_user_meta_data->>'full_name', ''),
        nullif(users.raw_user_meta_data->>'name', ''),
        nullif(users.email, ''),
        'KunThai account'
      ) as full_name,
      coalesce(
        nullif(profiles.username, ''),
        nullif(users.raw_user_meta_data->>'username', ''),
        nullif(users.raw_user_meta_data->>'preferred_username', ''),
        nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
        'user'
      ) as username,
      coalesce(
        nullif(users.raw_user_meta_data->>'phone_number', ''),
        nullif(users.raw_user_meta_data->>'phone', ''),
        nullif(users.phone, '')
      ) as phone,
      coalesce(
        nullif(users.raw_user_meta_data->>'city', ''),
        nullif(profiles.address, ''),
        ''
      ) as city,
      coalesce(
        nullif(profiles.avatar_url, ''),
        nullif(users.raw_user_meta_data->>'avatar_url', ''),
        nullif(users.raw_user_meta_data->>'picture', '')
      ) as avatar_url,
      'kunthai_account'::text as source
    from auth.users users
    left join public.explore_profiles profiles on profiles.user_id = users.id
  ) account
  where upper(regexp_replace(account.public_id, '[^A-Za-z0-9]', '', 'g')) = requested_id
  limit 1;
end;
$$;

revoke all on function public.lookup_kunthai_account_by_public_id(text) from public;
grant execute on function public.lookup_kunthai_account_by_public_id(text) to authenticated;
grant execute on function public.kunthai_public_user_id_from_uuid(uuid) to authenticated;

alter table if exists public.transport_fleets
  alter column is_visible_to_passengers set default true;

update public.transport_fleets
set
  is_visible_to_passengers = true,
  updated_at = now()
where is_visible_to_passengers = false;

drop index if exists public.transport_fleets_one_visible_per_operator_idx;

drop policy if exists "passengers can read visible fleets" on public.transport_fleets;
drop policy if exists "passengers can read registered fleets" on public.transport_fleets;
create policy "passengers can read registered fleets"
  on public.transport_fleets for select
  using (true);

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
where o.user_id is not null
  and coalesce(o.account_status, '') <> 'duplicate_archived';
