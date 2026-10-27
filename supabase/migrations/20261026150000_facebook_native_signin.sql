-- Native "Continue with Facebook" (facebook-native-signin edge function).
--
-- The phone's Facebook SDK returns a Facebook access token, which Supabase
-- Auth cannot take directly. The edge function checks it with Facebook, then
-- uses this lookup to find the KunThai account that already belongs to that
-- Facebook person (its Facebook identity from the web sign-in), or else the
-- account with the same Facebook-verified email. Only the service role may
-- call it.

create or replace function public.kunthai_facebook_signin_lookup(p_facebook_id text, p_email text)
returns table (user_id uuid, email text, matched_by text)
language sql
stable
security definer
set search_path = ''
as $$
  (
    select u.id, u.email::text, 'facebook'::text
    from auth.identities i
    join auth.users u on u.id = i.user_id
    where i.provider = 'facebook'
      and i.provider_id = p_facebook_id
      and u.deleted_at is null
    limit 1
  )
  union all
  (
    select u.id, u.email::text, 'email'::text
    from auth.users u
    where coalesce(p_email, '') <> ''
      and lower(u.email) = lower(p_email)
      and u.deleted_at is null
      and not exists (
        select 1 from auth.identities i
        where i.provider = 'facebook' and i.provider_id = p_facebook_id
      )
    limit 1
  );
$$;

revoke all on function public.kunthai_facebook_signin_lookup(text, text) from public, anon, authenticated;
grant execute on function public.kunthai_facebook_signin_lookup(text, text) to service_role;
