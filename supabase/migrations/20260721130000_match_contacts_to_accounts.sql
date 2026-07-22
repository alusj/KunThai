-- Contact import: given phone numbers from the user's own address book, return
-- which ones already belong to a KunThai account. Privacy rules:
--   * signed-in registered users only (guests rejected),
--   * at most 100 numbers per call,
--   * input numbers are matched in-query and never written anywhere,
--   * only registered, non-deactivated accounts with that exact number match,
--   * the response carries only public profile fields.

create or replace function public.match_contacts_to_kunthai_accounts(
  p_phones text[],
  p_country_hint text default null
)
returns table (
  user_id uuid,
  public_user_id text,
  display_name text,
  username text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.kunthai_user_is_guest(auth.uid()) then
    raise exception 'Sign in to import contacts.';
  end if;

  if coalesce(array_length(p_phones, 1), 0) = 0 then
    return;
  end if;

  if array_length(p_phones, 1) > 100 then
    raise exception 'Import up to 100 numbers at a time.';
  end if;

  return query
  select distinct
    identity.user_id,
    identity.public_user_id,
    identity.display_name,
    coalesce(nullif(prof.username, ''), '') as username,
    coalesce(nullif(prof.avatar_url, ''), '') as avatar_url
  from unnest(p_phones) as raw(phone)
  join public.kunthai_account_identities identity
    on identity.normalized_phone is not null
   and identity.normalized_phone = public.normalize_kunthai_phone(raw.phone, p_country_hint)
  left join public.explore_profiles prof on prof.user_id = identity.user_id
  where identity.user_id <> auth.uid()
    and not public.kunthai_user_is_guest(identity.user_id)
    and prof.deactivated_at is null;
end;
$$;

revoke all on function public.match_contacts_to_kunthai_accounts(text[], text) from public, anon;
grant execute on function public.match_contacts_to_kunthai_accounts(text[], text) to authenticated;
