-- UrRide company fleet management (2026-10-07 audit, high list).
--
-- 1. "Remove operator" and "Delete fleet" run as one checked database action.
--    Before, a fleet manager or admin got "Fleet has been deleted" while row
--    security silently skipped the delete (and half of the operator removal).
--    The owner and anyone with the manage_fleets permission may use them.
-- 2. One operator per company fleet: once a fleet has an accepted operator,
--    nobody else can be invited to it or accept an older invite until that
--    operator is removed. Two accepted operators made the passenger-facing
--    vehicle switch between them.

create or replace function public.manage_transport_company_fleet(
  p_company_fleet_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fleet public.transport_company_fleets%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage company fleets.';
  end if;
  if p_action not in ('removeOperator', 'delete') then
    raise exception 'Unsupported fleet action.';
  end if;

  select * into v_fleet from public.transport_company_fleets
  where id = p_company_fleet_id for update;
  if v_fleet.id is null then
    raise exception 'This fleet no longer exists. Refresh Fleet HQ.';
  end if;
  if not public.transport_company_user_has_permission(v_fleet.company_id, 'manage_fleets', auth.uid()) then
    raise exception 'Only the company owner or a fleet manager can manage this fleet.';
  end if;

  -- The passenger-facing vehicle goes offline for both actions.
  update public.transport_fleets
  set active_status = 'offline', is_visible_to_passengers = false, updated_at = v_now
  where company_fleet_id = p_company_fleet_id;

  update public.transport_company_operator_invites
  set status = 'revoked', updated_at = v_now
  where company_fleet_id = p_company_fleet_id and status in ('pending', 'accepted');

  if p_action = 'removeOperator' then
    update public.transport_company_fleets
    set operator_id = null,
        operators = (
          select coalesce(jsonb_agg(
            case when lower(coalesce(entry ->> 'status', '')) in ('pending', 'accepted', 'accepted_pending_documents')
              then entry || jsonb_build_object('status', 'revoked', 'updatedAt', v_now)
              else entry end
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_fleet.operators, '[]'::jsonb)) entry
        ),
        is_visible_to_passengers = false,
        updated_at = v_now
    where id = p_company_fleet_id;
  else
    delete from public.transport_company_fleets where id = p_company_fleet_id;
  end if;

  return jsonb_build_object('ok', true, 'action', p_action, 'companyFleetId', p_company_fleet_id);
end;
$$;

revoke all on function public.manage_transport_company_fleet(uuid, text) from public, anon;
grant execute on function public.manage_transport_company_fleet(uuid, text) to authenticated;

create or replace function public.guard_one_operator_per_company_fleet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_fleet_id is null or new.status not in ('pending', 'accepted') then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.company_fleet_id is not distinct from old.company_fleet_id then
    return new;
  end if;

  -- Serialise invites and acceptances for the same fleet.
  perform 1 from public.transport_company_fleets where id = new.company_fleet_id for update;

  if exists (
    select 1 from public.transport_company_operator_invites other
    where other.company_fleet_id = new.company_fleet_id
      and other.id <> new.id
      and other.status = 'accepted'
      and not (
        (other.operator_user_id is not null and other.operator_user_id = new.operator_user_id)
        or (other.operator_id is not null and other.operator_id = new.operator_id)
      )
  ) then
    raise exception 'This fleet already has an operator. Remove them from the fleet before assigning someone else.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_one_operator_per_company_fleet_trigger on public.transport_company_operator_invites;
create trigger guard_one_operator_per_company_fleet_trigger
before insert or update on public.transport_company_operator_invites
for each row execute function public.guard_one_operator_per_company_fleet();
