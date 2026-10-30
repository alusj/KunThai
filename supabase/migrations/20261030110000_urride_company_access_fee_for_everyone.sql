-- Every operator pays the one-time 150 Visibility Credit company access fee
-- (2026-10-30). It used to be only for solo operators (people who once ran
-- their own vehicle); a new operator joined their first company for free.
-- Now anyone accepting their first company invitation pays it once, new or
-- solo. People who already have access (paid, grandfathered or joined free
-- before today) keep it and never pay.
--
-- get_transport_operator_company_access    feeRequired = no access yet
-- accept_transport_company_operator_invite charges the fee for anyone without access
-- transport_guard_company_invite_acceptance no free unlock on a direct accept
begin;

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
  if not exists (select 1 from public.transport_company_fleets where id = v_invite.company_fleet_id and company_id = v_invite.company_id and lower(service_category) <> 'rental') then
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

CREATE OR REPLACE FUNCTION public.get_transport_operator_company_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_access public.transport_operator_company_access; v_solo boolean; v_balance integer;
begin
  if auth.uid() is null then raise exception 'Sign in to check company access.'; end if;
  select * into v_access from public.transport_operator_company_access where user_id = auth.uid();
  v_solo := v_access.solo_started_at is not null or exists (
    select 1 from public.transport_fleets fleet join public.transport_operators operator on operator.id = fleet.operator_id
    where operator.user_id = auth.uid() and fleet.company_id is null and fleet.company_fleet_id is null
  );
  select balance into v_balance from public.visibility_credit_wallets where user_id = auth.uid();
  return jsonb_build_object('feeRequired', v_access.unlocked_at is null,
    'unlocked', v_access.unlocked_at is not null, 'feeCredits', 150, 'balance', coalesce(v_balance, 0));
end;
$function$;

CREATE OR REPLACE FUNCTION public.transport_guard_company_invite_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid; v_access public.transport_operator_company_access;
begin
  -- Account or company deletion in progress: cascaded clean-up, not an edit.
  if public.account_deletion_in_progress() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if public.transport_company_invite_is_for_user(old.id, auth.uid()) then
      if not (
        (old.status = 'pending' and new.status in ('pending', 'accepted', 'rejected'))
        or (old.status = 'accepted' and new.status in ('accepted', 'revoked'))
        or (old.status in ('rejected', 'revoked', 'cancelled') and new.status = old.status)
      ) then
        raise exception 'This invitation cannot be reopened by its recipient. Ask the company for a new invitation.';
      end if;
      if new.operator_user_id is not null and new.operator_user_id is distinct from auth.uid() then
        raise exception 'The recipient of this invitation cannot be changed.';
      end if;
    end if;
    if public.transport_company_invite_is_for_user(old.id, auth.uid()) and (
      new.company_id is distinct from old.company_id or new.company_fleet_id is distinct from old.company_fleet_id
      or (old.operator_user_id is not null and new.operator_user_id is distinct from old.operator_user_id)
      or (new.operator_id is not null and not exists (select 1 from public.transport_operators where id = new.operator_id and user_id = auth.uid()))
    ) then raise exception 'The company and recipient of an invitation cannot be changed by its recipient.'; end if;
  end if;
  if new.status <> 'accepted' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'accepted' then return new; end if;
  if exists (select 1 from public.transport_company_fleets where id = new.company_fleet_id and lower(service_category) = 'rental') then
    raise exception 'Rental fleets are managed by the company and cannot have assigned operators.';
  end if;
  select coalesce(new.operator_user_id, operator.user_id) into v_user
  from (select 1) stub left join public.transport_operators operator on operator.id = new.operator_id;
  if v_user is null then raise exception 'Link your operator profile before accepting this invitation.'; end if;
  if auth.uid() is distinct from v_user then raise exception 'Only the invited operator may accept this invitation.'; end if;
  select * into v_access from public.transport_operator_company_access where user_id = v_user for update;
  -- The one-time fee is paid in accept_transport_company_operator_invite,
  -- which unlocks access before it accepts; nothing else accepts for free.
  if v_access.unlocked_at is null then
    raise exception 'Confirm the one-time 150 Visibility Credit company access fee before accepting.';
  end if;
  return new;
end;
$function$;

commit;
