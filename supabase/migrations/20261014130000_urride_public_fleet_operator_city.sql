-- Passengers see the operator's city / district (2026-10-14).
--
-- RLS hides other users' transport_operators rows from passengers, so a fleet
-- profile showed "City not added" even when the operator had saved one. The
-- passenger-safe contact lookup now also returns the operator's city. Same
-- function as 20261013150000_urride_public_fleet_operator_code.sql plus
-- operator_city; apply after it (or on its own: it replaces the function).
drop function if exists public.get_public_transport_fleet_contacts(uuid[]);

create function public.get_public_transport_fleet_contacts(fleet_ids uuid[])
returns table (
  fleet_id uuid,
  operator_id uuid,
  operator_name text,
  operator_phone text,
  operator_code text,
  operator_city text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    fleet.id,
    operator.id,
    operator.full_name,
    coalesce(
      nullif(btrim(operator.phone), ''),
      nullif(btrim(account.raw_user_meta_data->>'phone_number'), ''),
      nullif(btrim(account.phone), '')
    ),
    coalesce(
      nullif(btrim(operator.display_code), ''),
      case when nullif(btrim(operator.operator_code::text), '') is not null then 'KT-' || btrim(operator.operator_code::text) end
    ),
    nullif(btrim(coalesce(operator.city, '')), '')
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  left join auth.users account on account.id = operator.user_id
  where auth.uid() is not null
    and fleet.id = any(coalesce(fleet_ids, '{}'::uuid[]))
    and fleet.is_visible_to_passengers = true;
$$;

revoke all on function public.get_public_transport_fleet_contacts(uuid[]) from public, anon;
grant execute on function public.get_public_transport_fleet_contacts(uuid[]) to authenticated;
