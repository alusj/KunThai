-- Fleet HQ: operators and vehicles are added apart (2026-11-10).
--   * "Add operator" invites someone to the team without a vehicle
--     (company_fleet_id null); accepting such an invitation is allowed.
--   * assign_transport_company_operator_vehicle gives a team operator a
--     vehicle without a second invitation.
--   * Removing an operator from a vehicle (or deleting the vehicle) keeps the
--     operator on the team without a vehicle instead of ending their place.

CREATE OR REPLACE FUNCTION public.accept_transport_company_operator_invite(p_invite_id uuid, p_documents jsonb DEFAULT '{}'::jsonb, p_confirm_fee boolean DEFAULT false)
 RETURNS transport_company_operator_invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid(); v_invite public.transport_company_operator_invites;
  v_access public.transport_operator_company_access; v_operator uuid;
  v_fee integer := 0; v_wallet public.visibility_credit_wallets; v_solo boolean;
begin
  if v_user is null then raise exception 'Sign in to accept this invitation.'; end if;
  -- Serialize all acceptance attempts for the same person, including different companies.
  perform pg_advisory_xact_lock(hashtextextended('operator-company-access:' || v_user::text, 0));
  select * into v_invite from public.transport_company_operator_invites where id = p_invite_id for update;
  if not found or not public.transport_company_invite_is_for_user(p_invite_id, v_user) then
    raise exception 'This company invitation is not available to your account.';
  end if;
  if v_invite.status not in ('pending', 'accepted') then raise exception 'This invitation is no longer pending. Ask the company for a new invitation.'; end if;
  select id into v_operator from public.transport_operators where user_id = v_user;
  if v_operator is null then raise exception 'Complete your operator profile before accepting this invitation.'; end if;
  -- An invitation to the team alone has no vehicle: the company assigns one
  -- later (assign_transport_company_operator_vehicle).
  if v_invite.company_fleet_id is not null and not exists (select 1 from public.transport_company_fleets where id = v_invite.company_fleet_id and company_id = v_invite.company_id and lower(service_category) <> 'rental') then
    raise exception 'This company fleet is not available for operator assignment.';
  end if;
  insert into public.transport_operator_company_access (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_access from public.transport_operator_company_access where user_id = v_user for update;
  v_solo := v_access.solo_started_at is not null or exists (
    select 1 from public.transport_fleets where operator_id = v_operator and company_id is null and company_fleet_id is null
  );
  if v_access.unlocked_at is null then
    -- Everyone joining a company pays it once, new operators and solo ones alike.
    if p_confirm_fee is not true then raise exception 'Confirm the one-time 150 Visibility Credit company access fee before accepting.'; end if;
    v_fee := 150;
    insert into public.visibility_credit_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
    select * into v_wallet from public.visibility_credit_wallets where user_id = v_user for update;
    if v_wallet.balance < v_fee then raise exception 'Not enough Visibility Credits. Available: %, required: 150. Top up your wallet and return to this invitation.', v_wallet.balance; end if;
    update public.visibility_credit_wallets set balance = balance - v_fee, lifetime_spent = lifetime_spent + v_fee, updated_at = now()
    where user_id = v_user returning * into v_wallet;
    insert into public.visibility_credit_transactions (user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata)
    values (v_user, -v_fee, v_wallet.balance, 'operator_company_access', 'urride', 'transport_operator_company_access', v_user,
      jsonb_build_object('company_id', v_invite.company_id, 'invite_id', p_invite_id, 'one_time', true));
    update public.transport_operator_company_access set unlocked_at = now(), unlock_reason = 'paid',
      credits_paid = v_fee, first_invite_id = p_invite_id, solo_started_at = case when v_solo then coalesce(solo_started_at, now()) else solo_started_at end
    where user_id = v_user;
  end if;
  -- The existing membership/provisioning/activity triggers run inside this same
  -- transaction. A failed assignment rolls back the debit and durable unlock too.
  update public.transport_company_operator_invites
  set status = 'accepted', operator_id = v_operator, operator_user_id = v_user,
    documents = coalesce(documents, '{}'::jsonb) || coalesce(p_documents, '{}'::jsonb),
    responded_at = coalesce(responded_at, now()), updated_at = now()
  where id = p_invite_id returning * into v_invite;
  return v_invite;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_transport_company_fleet(p_company_fleet_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fleet public.transport_company_fleets%rowtype;
  v_now timestamptz := now();
  v_runtime_id uuid;
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

  -- Invitations still waiting for this vehicle are withdrawn. The operator
  -- who drives it stays on the team without a vehicle (their accepted
  -- invitation loses the vehicle), so the company can assign them another.
  update public.transport_company_operator_invites
  set status = 'revoked', updated_at = v_now
  where company_fleet_id = p_company_fleet_id and status = 'pending';

  update public.transport_company_operator_invites
  set company_fleet_id = null, fleet_code = null, updated_at = v_now
  where company_fleet_id = p_company_fleet_id and status = 'accepted';

  if p_action = 'removeOperator' then
    update public.transport_company_fleets
    set operator_id = null,
        operators = (
          select coalesce(jsonb_agg(entry), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_fleet.operators, '[]'::jsonb)) entry
          where lower(coalesce(entry ->> 'status', '')) not in ('pending', 'accepted', 'accepted_pending_documents')
        ),
        is_visible_to_passengers = false,
        updated_at = v_now
    where id = p_company_fleet_id;
  else
    -- The live vehicle record must not outlive the company fleet as the
    -- operator's "own" vehicle. Without trips it is deleted; with trip
    -- history it stays offline and hidden, still tagged with the company
    -- (company_id) so it is never shown as the operator's personal fleet.
    for v_runtime_id in
      select runtime.id from public.transport_fleets runtime where runtime.company_fleet_id = p_company_fleet_id
    loop
      if exists (select 1 from public.transport_trips trip where trip.fleet_id = v_runtime_id) then
        update public.transport_fleets
        set company_id = coalesce(company_id, v_fleet.company_id), updated_at = v_now
        where id = v_runtime_id;
      else
        delete from public.transport_fleets where id = v_runtime_id;
      end if;
    end loop;
    delete from public.transport_company_fleets where id = p_company_fleet_id;
  end if;

  return jsonb_build_object('ok', true, 'action', p_action, 'companyFleetId', p_company_fleet_id);
end;
$function$;

create or replace function public.assign_transport_company_operator_vehicle(p_company_fleet_id uuid, p_operator_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fleet public.transport_company_fleets%rowtype;
  v_invite public.transport_company_operator_invites%rowtype;
  v_current text;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Sign in to assign operators.'; end if;

  select * into v_fleet from public.transport_company_fleets where id = p_company_fleet_id for update;
  if v_fleet.id is null then raise exception 'This vehicle no longer exists. Refresh Fleet HQ.'; end if;
  if lower(coalesce(v_fleet.service_category, '')) = 'rental' then
    raise exception 'Rental vehicles are managed by the company and cannot have an operator.';
  end if;
  if not (public.transport_company_user_has_permission(v_fleet.company_id, 'manage_operators', auth.uid())
    or public.transport_company_user_has_permission(v_fleet.company_id, 'manage_fleets', auth.uid())) then
    raise exception 'Only the company owner or a manager can assign operators.';
  end if;

  -- The operator must already be on the team: their accepted invitation.
  select invite.* into v_invite
  from public.transport_company_operator_invites invite
  left join public.transport_operators operator on operator.id = invite.operator_id
  where invite.company_id = v_fleet.company_id
    and invite.status = 'accepted'
    and coalesce(invite.operator_user_id, operator.user_id) = p_operator_user_id
  order by invite.updated_at desc
  limit 1
  for update of invite;
  if v_invite.id is null then
    -- Not on the team (or left it): the caller sends a vehicle invitation.
    raise exception 'operator_not_on_team' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.transport_company_members member
    where member.company_id = v_fleet.company_id and member.user_id = p_operator_user_id
      and (member.status <> 'active' or coalesce(member.service_status, 'active') <> 'active')
  ) then
    raise exception 'This operator is suspended or removed. Restore them before assigning a vehicle.';
  end if;

  if v_invite.company_fleet_id = p_company_fleet_id then
    return jsonb_build_object('ok', true, 'inviteId', v_invite.id, 'companyFleetId', p_company_fleet_id, 'unchanged', true);
  end if;
  if v_invite.company_fleet_id is not null then
    select coalesce(nullif(btrim(fleet.fleet_name), ''), nullif(btrim(fleet.plate_number), ''), fleet.fleet_code)
    into v_current from public.transport_company_fleets fleet where fleet.id = v_invite.company_fleet_id;
    raise exception '% already drives %. Remove them from that vehicle first.',
      coalesce(nullif(v_invite.operator_name, ''), 'This operator'), coalesce(v_current, 'another vehicle');
  end if;

  -- Anyone still invited to drive this vehicle is no longer needed.
  update public.transport_company_operator_invites
  set status = 'revoked', updated_at = v_now
  where company_fleet_id = p_company_fleet_id and status = 'pending' and id <> v_invite.id;

  -- Giving the accepted invitation its vehicle runs the usual assignment
  -- triggers: one operator per vehicle, the live vehicle record, the
  -- "Vehicle assigned to you" notice.
  update public.transport_company_operator_invites
  set company_fleet_id = p_company_fleet_id, fleet_code = v_fleet.fleet_code, updated_at = v_now
  where id = v_invite.id;

  return jsonb_build_object('ok', true, 'inviteId', v_invite.id, 'companyFleetId', p_company_fleet_id);
end;
$function$;

revoke all on function public.assign_transport_company_operator_vehicle(uuid, uuid) from public, anon;
grant execute on function public.assign_transport_company_operator_vehicle(uuid, uuid) to authenticated;
