-- Security lockdown before the first App Store build.
--
-- 1. send_kunthai_push could be called by anyone through PostgREST (anon key
--    included) and pushed any title/body/link to any user ids. It is only
--    meant for the database's own SECURITY DEFINER triggers, so callers lose
--    EXECUTE. (Moving its secret into Vault is the follow-up migration
--    20261027170000_push_secret_from_vault.sql.)
--
-- 2. nearby_area_admins let any signed-in user insert their own row, which
--    is_nearby_area_admin() then treats as full admin over operator locations,
--    navigation sessions, Nearby places, reports and traffic. Staff access
--    lives in the admin foundation now; this legacy table becomes read-only
--    for users (they can still see their own row, if any).

revoke execute on function public.send_kunthai_push(uuid[], text, text, text, text)
  from public, anon, authenticated;

drop policy if exists "Users can insert own nearby admin record" on public.nearby_area_admins;
drop policy if exists "Users can delete own nearby admin record" on public.nearby_area_admins;

revoke insert, update, delete, truncate, references, trigger
  on table public.nearby_area_admins
  from anon, authenticated;
