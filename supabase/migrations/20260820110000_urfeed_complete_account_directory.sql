-- Keep the UrFeed people directory complete across every KunThai dashboard.
-- Older accounts that first entered UrMall or UrRide can predate the client
-- path that creates explore_profiles, so backfill those identities and keep
-- future dashboard landings synchronized. Guest and incomplete accounts stay
-- out of the directory.

-- Repair the shared guest-identity trigger before the backfill below inserts
-- profiles. Older deployments referenced NEW.user_id and NEW.owner_user_id in
-- one CASE expression; PostgreSQL resolves fields against the actual trigger
-- row type, so the unused owner_user_id branch still failed for
-- explore_profiles with SQLSTATE 42703.
create or replace function public.kunthai_reject_guest_explore_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_user_id uuid;
begin
  identity_user_id := nullif(
    to_jsonb(new) ->> (
      case
        when tg_table_name = 'explore_profiles' then 'user_id'
        when tg_table_name = 'explore_spaces' then 'owner_user_id'
        else ''
      end
    ),
    ''
  )::uuid;

  if public.kunthai_user_is_guest(identity_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Guest sessions cannot create an Explore identity.';
  end if;

  return new;
end;
$$;

revoke all on function public.kunthai_reject_guest_explore_identity()
from public, anon, authenticated;

create or replace function public.kunthai_sync_dashboard_explore_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_dashboard_ready boolean;
  v_social_links jsonb;
begin
  v_dashboard_ready := not coalesce(new.is_anonymous, false)
    and lower(coalesce(v_metadata ->> 'onboarding_complete', '')) in ('true', 't', '1', 'yes')
    and lower(btrim(coalesce(v_metadata ->> 'primary_surface', ''))) in ('explore', 'marketplace', 'transport');

  if not v_dashboard_ready then
    return new;
  end if;

  v_social_links := case
    when jsonb_typeof(v_metadata -> 'social_links') = 'array' then v_metadata -> 'social_links'
    else '[]'::jsonb
  end;

  insert into public.explore_profiles (
    user_id,
    display_name,
    username,
    contact_email,
    address,
    avatar_url,
    cover_url,
    bio,
    social_links,
    account_type,
    updated_at
  ) values (
    new.id,
    coalesce(
      nullif(btrim(v_metadata ->> 'display_name'), ''),
      nullif(btrim(v_metadata ->> 'full_name'), ''),
      nullif(btrim(v_metadata ->> 'name'), ''),
      nullif(btrim(v_metadata ->> 'username'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'KunThai member'
    ),
    coalesce(
      nullif(btrim(v_metadata ->> 'username'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'member_' || left(replace(new.id::text, '-', ''), 8)
    ),
    coalesce(nullif(btrim(v_metadata ->> 'contact_email'), ''), new.email, ''),
    coalesce(v_metadata ->> 'address', ''),
    coalesce(
      nullif(btrim(v_metadata ->> 'avatar_url'), ''),
      nullif(btrim(v_metadata ->> 'picture'), ''),
      ''
    ),
    coalesce(nullif(btrim(v_metadata ->> 'cover_url'), ''), 'preset:gradient'),
    coalesce(v_metadata ->> 'bio', ''),
    v_social_links,
    coalesce(nullif(btrim(v_metadata ->> 'account_type'), ''), 'personal'),
    timezone('utc', now())
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.kunthai_sync_dashboard_explore_profile() from public, anon, authenticated;

drop trigger if exists kunthai_dashboard_explore_profile_sync on auth.users;
create trigger kunthai_dashboard_explore_profile_sync
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.kunthai_sync_dashboard_explore_profile();

-- Backfill existing completed accounts without touching auth timestamps or
-- overwriting profiles people have already customized.
insert into public.explore_profiles (
  user_id,
  display_name,
  username,
  contact_email,
  address,
  avatar_url,
  cover_url,
  bio,
  social_links,
  account_type,
  updated_at
)
select
  users.id,
  coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(users.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'KunThai member'
  ),
  coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'member_' || left(replace(users.id::text, '-', ''), 8)
  ),
  coalesce(nullif(btrim(users.raw_user_meta_data ->> 'contact_email'), ''), users.email, ''),
  coalesce(users.raw_user_meta_data ->> 'address', ''),
  coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(btrim(users.raw_user_meta_data ->> 'picture'), ''),
    ''
  ),
  coalesce(nullif(btrim(users.raw_user_meta_data ->> 'cover_url'), ''), 'preset:gradient'),
  coalesce(users.raw_user_meta_data ->> 'bio', ''),
  case
    when jsonb_typeof(users.raw_user_meta_data -> 'social_links') = 'array'
      then users.raw_user_meta_data -> 'social_links'
    else '[]'::jsonb
  end,
  coalesce(nullif(btrim(users.raw_user_meta_data ->> 'account_type'), ''), 'personal'),
  timezone('utc', now())
from auth.users users
where not coalesce(users.is_anonymous, false)
  and lower(coalesce(users.raw_user_meta_data ->> 'onboarding_complete', '')) in ('true', 't', '1', 'yes')
  and lower(btrim(coalesce(users.raw_user_meta_data ->> 'primary_surface', ''))) in ('explore', 'marketplace', 'transport')
on conflict (user_id) do nothing;

-- Paginate the complete eligible directory behind a security-definer boundary
-- so people who blocked the viewer never appear without revealing block rows.
create or replace function public.get_explore_profile_directory(
  p_user_id uuid,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  account_type text,
  verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.user_id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    profile.bio,
    profile.account_type,
    profile.verified
  from public.explore_profiles profile
  where auth.uid() = p_user_id
    and profile.user_id <> p_user_id
    and profile.deactivated_at is null
    and not public.kunthai_user_is_guest(profile.user_id)
    and not exists (
      select 1
      from public.explore_user_blocks block
      where (block.blocker_id = p_user_id and block.blocked_id = profile.user_id)
         or (block.blocker_id = profile.user_id and block.blocked_id = p_user_id)
    )
  order by lower(coalesce(profile.display_name, '')), profile.created_at desc, profile.user_id
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.get_explore_profile_directory(uuid, integer, integer) from public, anon;
grant execute on function public.get_explore_profile_directory(uuid, integer, integer) to authenticated;
