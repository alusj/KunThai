-- One KunThai account per Facebook person, whichever way they sign in.
--
-- The phone has two Facebook sign-in routes. With tracking allowed the
-- facebook-native-signin edge function finds or creates the account; with
-- Limited Login (iPhone, tracking not allowed) the sign-in service does it
-- itself from Facebook's identity token, and it only recognises an account
-- by its Facebook identity row. An account the edge function created had no
-- such row, so a later Limited Login made a second account for the same
-- person. The edge function now records the Facebook identity on every
-- account it creates or matches by email. Service role only.

create or replace function public.kunthai_link_facebook_identity(
  p_user_id uuid,
  p_facebook_id text,
  p_identity jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked boolean := false;
begin
  if p_user_id is null or coalesce(btrim(p_facebook_id), '') = '' then
    return false;
  end if;

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    p_facebook_id,
    p_user_id,
    coalesce(p_identity, '{}'::jsonb) || jsonb_build_object('sub', p_facebook_id),
    'facebook',
    now(), now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  get diagnostics v_linked = row_count;
  return v_linked;
end;
$$;

revoke all on function public.kunthai_link_facebook_identity(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.kunthai_link_facebook_identity(uuid, text, jsonb) to service_role;
