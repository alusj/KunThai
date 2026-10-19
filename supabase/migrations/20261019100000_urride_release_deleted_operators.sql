-- UrRide: an operator whose KunThai account was deleted no longer stays
-- assigned to a company vehicle (2026-10-19).
--
-- Deleting an account clears the person's id on their records (ON DELETE SET
-- NULL) but left their company invitation "accepted". Fleet HQ then kept
-- showing them on the vehicle and in Operators, where nothing could be done
-- (no member, no account): suspend and responsibility failed, and the vehicle
-- could not get a new operator. Now the vehicle is released exactly as
-- "Remove operator from fleet" does: invitation revoked, vehicle offline and
-- hidden, assignment cleared. Existing ghost assignments are released once.
-- Pending invitations are left alone (old ones may be accepted by KunThai ID).
-- Also: a suspended company operator can no longer switch their vehicle on.
begin;

-- Same steps as manage_transport_company_fleet(..., 'removeOperator'),
-- without the caller permission check (only called from triggers below).
create or replace function public.transport_company_fleet_release_operator(p_company_fleet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if p_company_fleet_id is null then return; end if;

  update public.transport_fleets
  set active_status = 'offline', is_visible_to_passengers = false, updated_at = v_now
  where company_fleet_id = p_company_fleet_id;

  update public.transport_company_operator_invites
  set status = 'revoked', updated_at = v_now
  where company_fleet_id = p_company_fleet_id and status = 'accepted';

  update public.transport_company_fleets fleet
  set operator_id = null,
      operators = (
        select coalesce(jsonb_agg(
          case when lower(coalesce(entry ->> 'status', '')) in ('accepted', 'accepted_pending_documents')
            then entry || jsonb_build_object('status', 'revoked', 'updatedAt', v_now)
            else entry end
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(fleet.operators, '[]'::jsonb)) entry
      ),
      is_visible_to_passengers = false,
      updated_at = v_now
  where fleet.id = p_company_fleet_id;
end;
$$;
revoke all on function public.transport_company_fleet_release_operator(uuid) from public, anon, authenticated;

-- The account behind an operator record was deleted.
create or replace function public.transport_operator_account_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_fleet_id uuid;
begin
  if old.user_id is not null and new.user_id is null then
    for v_company_fleet_id in
      select distinct invite.company_fleet_id
      from public.transport_company_operator_invites invite
      where invite.operator_id = new.id and invite.status = 'accepted' and invite.company_fleet_id is not null
    loop
      perform public.transport_company_fleet_release_operator(v_company_fleet_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public.transport_operator_account_removed() from public, anon, authenticated;
drop trigger if exists transport_operator_account_removed on public.transport_operators;
create trigger transport_operator_account_removed
after update of user_id on public.transport_operators
for each row execute function public.transport_operator_account_removed();

-- The invited person's account was deleted (invite.operator_user_id cleared).
create or replace function public.transport_company_invite_account_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.operator_user_id is not null and new.operator_user_id is null
    and new.status = 'accepted' and new.company_fleet_id is not null then
    perform public.transport_company_fleet_release_operator(new.company_fleet_id);
  end if;
  return null;
end;
$$;
revoke all on function public.transport_company_invite_account_removed() from public, anon, authenticated;
drop trigger if exists transport_company_invite_account_removed on public.transport_company_operator_invites;
create trigger transport_company_invite_account_removed
after update of operator_user_id on public.transport_company_operator_invites
for each row execute function public.transport_company_invite_account_removed();

-- A suspended company operator cannot switch their company vehicle back on
-- (set_transport_company_operator_availability did not check). Only the
-- change to Active / visible is refused; other updates to the row go through.
create or replace function public.transport_fleet_suspension_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null or new.operator_id is null then return new; end if;
  if not (
    (lower(coalesce(new.active_status::text, '')) = 'active' and lower(coalesce(old.active_status::text, '')) <> 'active')
    or (coalesce(new.is_visible_to_passengers, false) and not coalesce(old.is_visible_to_passengers, false))
  ) then
    return new;
  end if;
  if exists (
    select 1
    from public.transport_company_members member
    left join public.transport_operators operator on operator.id = new.operator_id
    where member.company_id = new.company_id
      and coalesce(member.service_status, 'active') = 'suspended'
      and (member.operator_id = new.operator_id or (operator.user_id is not null and member.user_id = operator.user_id))
  ) then
    raise exception 'Your service with this company is suspended. Ask the company to restore it.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.transport_fleet_suspension_guard() from public, anon, authenticated;
drop trigger if exists transport_fleet_suspension_guard on public.transport_fleets;
create trigger transport_fleet_suspension_guard
before update of active_status, is_visible_to_passengers on public.transport_fleets
for each row execute function public.transport_fleet_suspension_guard();

-- One-time release of vehicles whose accepted operator has no account left:
-- no user on the invite, none on the operator record, and no account matches
-- the KunThai ID on the invite (KTU-xxxx-xxxx-xxxx: first 8 / last 4 of the id).
do $$
declare
  v_company_fleet_id uuid;
begin
  for v_company_fleet_id in
    select distinct invite.company_fleet_id
    from public.transport_company_operator_invites invite
    left join public.transport_operators operator on operator.id = invite.operator_id
    where invite.status = 'accepted'
      and invite.company_fleet_id is not null
      and invite.operator_user_id is null
      and operator.user_id is null
      and not exists (
        select 1 from auth.users account
        where length(regexp_replace(upper(coalesce(invite.operator_public_id, '')), '[^A-Z0-9]', '', 'g')) = 15
          and upper(replace(account.id::text, '-', '')) like
            substr(regexp_replace(upper(invite.operator_public_id), '[^A-Z0-9]', '', 'g'), 4, 8) || '%'
            || right(regexp_replace(upper(invite.operator_public_id), '[^A-Z0-9]', '', 'g'), 4)
      )
  loop
    perform public.transport_company_fleet_release_operator(v_company_fleet_id);
  end loop;
end;
$$;

commit;
