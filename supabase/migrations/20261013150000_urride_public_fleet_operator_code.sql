-- Passengers cannot read other users' transport_operators rows, so the nested
-- operator in the fleet list comes back empty and the client used to invent an
-- ID from the fleet UUID (e.g. KT-685B8) instead of the operator's real KT code
-- (e.g. KT-85774). The passenger-safe contact lookup now returns the real code.
drop function if exists public.get_public_transport_fleet_contacts(uuid[]);

create function public.get_public_transport_fleet_contacts(fleet_ids uuid[])
returns table (
  fleet_id uuid,
  operator_id uuid,
  operator_name text,
  operator_phone text,
  operator_code text
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
    )
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  left join auth.users account on account.id = operator.user_id
  where auth.uid() is not null
    and fleet.id = any(coalesce(fleet_ids, '{}'::uuid[]))
    and fleet.is_visible_to_passengers = true;
$$;

revoke all on function public.get_public_transport_fleet_contacts(uuid[]) from public, anon;
grant execute on function public.get_public_transport_fleet_contacts(uuid[]) to authenticated;
