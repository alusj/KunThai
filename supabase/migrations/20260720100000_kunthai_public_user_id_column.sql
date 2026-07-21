-- Persist each account's KunThai public ID (KTU-XXXX-XXXX-XXXX) on the canonical
-- identity row instead of deriving it on every read. The value is a pure function
-- of the immutable auth user UUID, so it is stored as a GENERATED column and can
-- never drift from the derivation used across the app.

-- The derivation is genuinely immutable (string math on the UUID, no table access).
-- Marking it immutable lets it back a generated column and an index.
create or replace function public.kunthai_public_user_id_from_uuid(input_user_id uuid)
returns text
language sql
immutable
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

-- Attach the KunThai ID to the user's canonical identity row.
alter table public.kunthai_account_identities
  add column if not exists public_user_id text
  generated always as (public.kunthai_public_user_id_from_uuid(user_id)) stored;

create unique index if not exists kunthai_account_identities_public_user_id_uidx
  on public.kunthai_account_identities (public_user_id)
  where public_user_id is not null and public_user_id <> '';

comment on column public.kunthai_account_identities.public_user_id is
  'Stored KunThai public ID (KTU-XXXX-XXXX-XXXX), generated from the account UUID.';

-- Resolve a KunThai ID to its account using the indexed stored column instead of
-- scanning and re-deriving the code for every auth.users row.
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
  matched_user_id uuid;
begin
  if requested_id = '' then
    return;
  end if;

  if left(requested_id, 3) <> 'KTU' and length(requested_id) >= 4 then
    requested_id := 'KTU' || requested_id;
  end if;

  -- Fast path: indexed lookup on the stored public ID (compare ignoring dashes).
  select identity.user_id
  into matched_user_id
  from public.kunthai_account_identities identity
  where upper(regexp_replace(identity.public_user_id, '[^A-Za-z0-9]', '', 'g')) = requested_id
  limit 1;

  if matched_user_id is null then
    return;
  end if;

  return query
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
  where users.id = matched_user_id
  limit 1;
end;
$$;

revoke all on function public.lookup_kunthai_account_by_public_id(text) from public;
grant execute on function public.lookup_kunthai_account_by_public_id(text) to authenticated;
grant execute on function public.kunthai_public_user_id_from_uuid(uuid) to authenticated;
