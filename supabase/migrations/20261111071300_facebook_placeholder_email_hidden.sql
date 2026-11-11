-- Sign-in placeholder addresses stay out of KunThai's own tables.
--
-- A Facebook account whose Facebook shares no email gets an internal address,
-- fb_<facebook id>@kunthai.invalid, so the facebook-native-signin edge
-- function can open its session (the sign-in service needs an email for the
-- one-time token; ".invalid" can never receive mail). That address is for
-- auth.users only. The two triggers that copy the account email into public
-- tables (the account identity lookup and the Explore profile) now read it
-- through kunthai_visible_email(), so for them the account has no email,
-- exactly as before. The function bodies are the live ones with only
-- new.email replaced.

create or replace function public.kunthai_visible_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(btrim(coalesce(p_email, ''))) like '%@kunthai.invalid' then null
    else p_email
  end;
$$;

CREATE OR REPLACE FUNCTION public.kunthai_sync_dashboard_explore_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      nullif(split_part(coalesce(public.kunthai_visible_email(new.email), ''), '@', 1), ''),
      'KunThai member'
    ),
    coalesce(
      nullif(btrim(v_metadata ->> 'username'), ''),
      nullif(split_part(coalesce(public.kunthai_visible_email(new.email), ''), '@', 1), ''),
      'member_' || left(replace(new.id::text, '-', ''), 8)
    ),
    coalesce(nullif(btrim(v_metadata ->> 'contact_email'), ''), public.kunthai_visible_email(new.email), ''),
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
$function$;

CREATE OR REPLACE FUNCTION public.sync_kunthai_account_identity_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  next_email text;
  next_phone text;
  next_display_name text;
begin
  next_email := public.normalize_kunthai_email(
    coalesce(
      nullif(public.kunthai_visible_email(new.email), ''),
      nullif(new.raw_user_meta_data->>'contact_email', '')
    )
  );
  next_phone := public.normalize_kunthai_phone(
    coalesce(
      nullif(new.phone, ''),
      nullif(new.raw_user_meta_data->>'phone_number', ''),
      nullif(new.raw_user_meta_data->>'phone', '')
    ),
    coalesce(
      nullif(new.raw_user_meta_data->>'country_code', ''),
      nullif(new.raw_user_meta_data->>'country', '')
    )
  );
  next_display_name := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(split_part(coalesce(public.kunthai_visible_email(new.email), ''), '@', 1), ''),
    'KunThai account'
  );

  insert into public.kunthai_account_identities (
    user_id,
    normalized_email,
    normalized_phone,
    display_name,
    created_at,
    updated_at
  )
  values (
    new.id,
    next_email,
    next_phone,
    next_display_name,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (user_id) do update
  set
    normalized_email = excluded.normalized_email,
    normalized_phone = excluded.normalized_phone,
    display_name = excluded.display_name,
    updated_at = now();

  return new;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'This email or phone number is already linked to another KunThai account.';
end;
$function$;
