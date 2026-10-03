-- The server's current time, so time-sensitive safety rules (UrRide late-hour
-- booking warnings) do not depend on a phone's clock being set correctly.
create or replace function public.kunthai_server_now()
returns timestamptz
language sql
stable
as $$ select now() $$;

grant execute on function public.kunthai_server_now() to anon, authenticated;

notify pgrst, 'reload schema';
