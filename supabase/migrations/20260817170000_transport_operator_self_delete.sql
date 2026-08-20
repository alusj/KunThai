-- Direct self-service deletion of a user's UrRide operator account, mirroring
-- public.delete_my_marketplace_business. Previously UrRide deletion only opened
-- an admin case (request_account_deletion); this lets the owner delete their own
-- operator account immediately. Deleting the transport_operators row cascades to
-- the operator's fleets and their trips (all FKs to transport_operators /
-- transport_fleets are ON DELETE CASCADE or SET NULL, verified), so no orphan
-- rows and no FK failures. Scoped to auth.uid(), so a user can only delete their
-- own operator account.
create or replace function public.delete_my_transport_operator()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to manage your UrRide account.' using errcode = '28000';
  end if;

  delete from public.transport_operators
  where user_id = uid;
end;
$$;

revoke all on function public.delete_my_transport_operator() from public, anon;
grant execute on function public.delete_my_transport_operator() to authenticated;
