-- Operator memberships remain unique per (company_id, user_id), never globally.
-- Keep the access unlock on the user, even if their operator/fleet is deleted.
begin;

create table public.transport_operator_company_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  solo_started_at timestamptz,
  unlocked_at timestamptz,
  unlock_reason text check (unlock_reason in ('grandfathered', 'company_first', 'paid')),
  credits_paid integer not null default 0 check (credits_paid in (0, 150)),
  first_invite_id uuid references public.transport_company_operator_invites(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.transport_operator_company_access enable row level security;
revoke all on public.transport_operator_company_access from public, anon, authenticated;
grant select on public.transport_operator_company_access to authenticated;
create policy "Operators read own company access" on public.transport_operator_company_access
  for select to authenticated using (user_id = auth.uid());

insert into public.transport_operator_company_access (user_id, solo_started_at)
select operator.user_id, min(fleet.created_at)
from public.transport_operators operator
join public.transport_fleets fleet on fleet.operator_id = operator.id
where fleet.company_id is null and fleet.company_fleet_id is null and operator.user_id is not null
group by operator.user_id;

insert into public.transport_operator_company_access (user_id, unlocked_at, unlock_reason)
select distinct user_id, now(), 'grandfathered'
from (
  select coalesce(invite.operator_user_id, operator.user_id) as user_id
  from public.transport_company_operator_invites invite
  left join public.transport_operators operator on operator.id = invite.operator_id
  where invite.status = 'accepted'
  union
  select member.user_id from public.transport_company_members member
  where member.operator_id is not null and member.role <> 'owner'
    and member.status in ('active', 'suspended')
) existing where user_id is not null
on conflict (user_id) do update set unlocked_at = excluded.unlocked_at, unlock_reason = excluded.unlock_reason;

create or replace function public.transport_remember_solo_operator()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if new.company_id is null and new.company_fleet_id is null then
    select user_id into v_user from public.transport_operators where id = new.operator_id;
    if v_user is not null then
      insert into public.transport_operator_company_access (user_id, solo_started_at)
      values (v_user, now()) on conflict (user_id) do update
      set solo_started_at = coalesce(transport_operator_company_access.solo_started_at, excluded.solo_started_at);
    end if;
  end if;
  return new;
end;
$$;
create trigger transport_remember_solo_operator_trigger
after insert or update of operator_id, company_id, company_fleet_id on public.transport_fleets
for each row execute function public.transport_remember_solo_operator();

create or replace function public.get_transport_operator_company_access()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_access public.transport_operator_company_access; v_solo boolean; v_balance integer;
begin
  if auth.uid() is null then raise exception 'Sign in to check company access.'; end if;
  select * into v_access from public.transport_operator_company_access where user_id = auth.uid();
  v_solo := v_access.solo_started_at is not null or exists (
    select 1 from public.transport_fleets fleet join public.transport_operators operator on operator.id = fleet.operator_id
    where operator.user_id = auth.uid() and fleet.company_id is null and fleet.company_fleet_id is null
  );
  select balance into v_balance from public.visibility_credit_wallets where user_id = auth.uid();
  return jsonb_build_object('feeRequired', v_solo and v_access.unlocked_at is null,
    'unlocked', v_access.unlocked_at is not null, 'feeCredits', 150, 'balance', coalesce(v_balance, 0));
end;
$$;

-- Existing direct-update clients cannot bypass the charge or accept for someone else.
create or replace function public.transport_guard_company_invite_acceptance()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_access public.transport_operator_company_access;
begin
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
  if exists (select 1 from public.transport_company_fleets where id = new.company_fleet_id and lower(service_category) = 'rental') then
    raise exception 'Rental fleets are managed by the company and cannot have assigned operators.';
  end if;
  select coalesce(new.operator_user_id, operator.user_id) into v_user
  from (select 1) stub left join public.transport_operators operator on operator.id = new.operator_id;
  if v_user is null then raise exception 'Link your operator profile before accepting this invitation.'; end if;
  if tg_op = 'INSERT' or old.status <> 'accepted' then
    if auth.uid() is distinct from v_user then raise exception 'Only the invited operator may accept this invitation.'; end if;
  end if;
  select * into v_access from public.transport_operator_company_access where user_id = v_user for update;
  if v_access.unlocked_at is null then
    if v_access.solo_started_at is not null or exists (
      select 1 from public.transport_fleets fleet join public.transport_operators operator on operator.id = fleet.operator_id
      where operator.user_id = v_user and fleet.company_id is null and fleet.company_fleet_id is null
    ) then
      raise exception 'Confirm the one-time 150 Visibility Credit company access fee before accepting.';
    end if;
    insert into public.transport_operator_company_access (user_id, unlocked_at, unlock_reason, first_invite_id)
    values (v_user, now(), 'company_first', case when tg_op = 'UPDATE' then new.id else null end)
    on conflict (user_id) do update set unlocked_at = excluded.unlocked_at, unlock_reason = excluded.unlock_reason;
  end if;
  return new;
end;
$$;
create trigger transport_guard_company_invite_acceptance_trigger
before insert or update on public.transport_company_operator_invites
for each row execute function public.transport_guard_company_invite_acceptance();

-- Updating documents on an already accepted invite must not undo a company's
-- suspension/removal. The same user can keep a separate membership per company.
create or replace function public.transport_company_sync_operator_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_joining boolean;
begin
  if new.status <> 'accepted' then return new; end if;
  v_user := new.operator_user_id;
  if v_user is null then select user_id into v_user from public.transport_operators where id = new.operator_id; end if;
  if v_user is null then return new; end if;
  v_joining := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then v_joining := old.status <> 'accepted'; end if;
  insert into public.transport_company_members (company_id, user_id, operator_id, public_id, full_name, role, status, service_status, joined_at, updated_at)
  values (new.company_id, v_user, new.operator_id, new.operator_public_id, new.operator_name, 'operator', 'active', 'active', coalesce(new.responded_at, now()), now())
  on conflict (company_id, user_id) do update set
    operator_id = coalesce(excluded.operator_id, transport_company_members.operator_id),
    public_id = coalesce(nullif(excluded.public_id, ''), transport_company_members.public_id),
    full_name = coalesce(nullif(excluded.full_name, ''), transport_company_members.full_name),
    status = case when v_joining and transport_company_members.role <> 'owner' then 'active' else transport_company_members.status end,
    service_status = case when v_joining and transport_company_members.role <> 'owner' then 'active' else transport_company_members.service_status end,
    joined_at = coalesce(transport_company_members.joined_at, excluded.joined_at), updated_at = now();
  return new;
end;
$$;

create or replace function public.transport_company_provision_runtime_fleet(
  company_fleet_uuid uuid,
  operator_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company_fleet public.transport_company_fleets%rowtype;
  company_record public.transport_companies%rowtype;
  runtime_fleet_id uuid;
  runtime_service_category public.transport_service_category;
  runtime_fleet_type public.transport_fleet_type;
  runtime_verification public.transport_verification_status;
  runtime_active_status text;
  runtime_visible boolean;
  runtime_country_iso text;
  runtime_country text;
  runtime_currency text;
begin
  if company_fleet_uuid is null or operator_uuid is null then
    return null;
  end if;

  select * into company_fleet
  from public.transport_company_fleets
  where id = company_fleet_uuid
  for update;

  if not found then
    return null;
  end if;

  select * into company_record
  from public.transport_companies
  where id = company_fleet.company_id;

  runtime_service_category := case company_fleet.service_category
    when 'Ride only' then 'transport'::public.transport_service_category
    when 'Delivery only' then 'delivery'::public.transport_service_category
    else 'both'::public.transport_service_category
  end;
  runtime_fleet_type := case company_fleet.fleet_type
    when 'Motorbike' then 'motorcycle'::public.transport_fleet_type
    when 'Tricycle' then 'tricycle'::public.transport_fleet_type
    else 'car'::public.transport_fleet_type
  end;
  runtime_verification := case company_fleet.verification_status
    when 'verified' then 'verified'::public.transport_verification_status
    when 'rejected' then 'not_verified'::public.transport_verification_status
    when 'suspended' then 'not_verified'::public.transport_verification_status
    else 'verification_pending'::public.transport_verification_status
  end;
  runtime_active_status := case when company_fleet.active_status = 'active' then 'active' else 'offline' end;
  runtime_visible := coalesce(company_fleet.is_visible_to_passengers, false) and runtime_active_status = 'active';
  runtime_country_iso := public.kunthai_resolve_country_iso(
    coalesce(nullif(company_record.country_iso, ''), nullif(company_record.country, ''))
  );
  runtime_country := coalesce(nullif(company_record.country, ''), runtime_country_iso, 'SL');
  runtime_currency := public.kunthai_resolve_currency(
    runtime_country_iso,
    nullif(company_record.currency, '')
  );

  select fleet.id into runtime_fleet_id
  from public.transport_fleets fleet
  where fleet.company_fleet_id = company_fleet.id
  limit 1;

  -- A company's runtime row is identified only by company_fleet_id.
  -- Reusing an operator's same-plate solo/other-company row would transfer
  -- its history and dispatch access to this company.

  if runtime_fleet_id is null then
    insert into public.transport_fleets (
      operator_id,
      service_category,
      fleet_type,
      fleet_name,
      plate_number,
      make,
      model,
      manufacture_year,
      color,
      operating_area,
      home_base_location,
      safety_answers,
      verification_status,
      active_status,
      is_visible_to_passengers,
      accepts_ride,
      accepts_delivery,
      country,
      country_iso,
      currency,
      company_id,
      company_fleet_id,
      fleet_code,
      updated_at
    ) values (
      operator_uuid,
      runtime_service_category,
      runtime_fleet_type,
      coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), 'NO-PLATE'),
      company_fleet.make,
      company_fleet.model,
      company_fleet.manufacture_year,
      company_fleet.color,
      coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      coalesce(company_fleet.safety_answers, '{}'::jsonb),
      runtime_verification,
      runtime_active_status,
      runtime_visible,
      company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      runtime_country,
      runtime_country_iso,
      runtime_currency,
      company_fleet.company_id,
      company_fleet.id,
      company_fleet.fleet_code,
      now()
    )
    returning id into runtime_fleet_id;
  else
    update public.transport_fleets
    set
      operator_id = operator_uuid,
      service_category = runtime_service_category,
      fleet_type = runtime_fleet_type,
      fleet_name = coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      plate_number = coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), plate_number),
      make = company_fleet.make,
      model = company_fleet.model,
      manufacture_year = company_fleet.manufacture_year,
      color = company_fleet.color,
      operating_area = coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      home_base_location = coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      safety_answers = coalesce(company_fleet.safety_answers, '{}'::jsonb),
      verification_status = runtime_verification,
      active_status = runtime_active_status,
      is_visible_to_passengers = runtime_visible,
      accepts_ride = company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      accepts_delivery = company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      country = coalesce(nullif(company_record.country, ''), country),
      country_iso = coalesce(nullif(runtime_country_iso, ''), country_iso),
      currency = coalesce(nullif(runtime_currency, ''), currency),
      company_id = company_fleet.company_id,
      company_fleet_id = company_fleet.id,
      fleet_code = company_fleet.fleet_code,
      updated_at = now()
    where id = runtime_fleet_id;
  end if;

  update public.transport_company_fleets
  set
    operator_id = operator_uuid,
    transport_fleet_id = runtime_fleet_id,
    updated_at = now()
  where id = company_fleet.id;

  return runtime_fleet_id;
end;
$$;

create or replace function public.transport_company_sync_accepted_operator_fleet()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_joining boolean;
begin
  if new.status = 'accepted' and new.company_fleet_id is not null and new.operator_id is not null then
    v_joining := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then v_joining := old.status <> 'accepted' or old.operator_id is distinct from new.operator_id; end if;
    if v_joining then
      update public.transport_company_fleets set active_status = 'offline', is_visible_to_passengers = false
      where id = new.company_fleet_id;
    end if;
    perform public.transport_company_provision_runtime_fleet(new.company_fleet_id, new.operator_id);
  end if;
  return new;
end;
$$;

alter table public.visibility_credit_transactions drop constraint if exists visibility_credit_transactions_transaction_type_check;
alter table public.visibility_credit_transactions add constraint visibility_credit_transactions_transaction_type_check
check (transaction_type in ('invite_reward', 'boost_spend', 'admin_adjustment', 'refund', 'starter_bonus',
  'credit_transfer_sent', 'credit_transfer_received', 'purchase', 'subscription_spend', 'subscription_refund', 'operator_company_access'));

create or replace function public.accept_transport_company_operator_invite(
  p_invite_id uuid, p_documents jsonb default '{}'::jsonb, p_confirm_fee boolean default false
)
returns public.transport_company_operator_invites
language plpgsql security definer set search_path = public as $$
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
    if v_solo then
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
    end if;
    update public.transport_operator_company_access set unlocked_at = now(), unlock_reason = case when v_fee = 150 then 'paid' else 'company_first' end,
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
$$;

-- Activation is an explicit selection of ONE fleet, whether solo or company.
-- Locking the operator serializes two devices attempting to go active together.
create or replace function public.transport_guard_operator_work_context()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if new.operator_id is null or (new.active_status <> 'active' and not coalesce(new.is_visible_to_passengers, false)) then return new; end if;
  select user_id into v_user from public.transport_operators where id = new.operator_id for update;
  if new.company_id is not null and not exists (
    select 1 from public.transport_company_members member where member.company_id = new.company_id and member.user_id = v_user
      and member.status = 'active' and member.service_status = 'active'
  ) then raise exception 'Your company membership is not active. Contact the company administrator.'; end if;
  if new.company_id is not null and not exists (
    select 1 from public.transport_operator_company_access where user_id = v_user and unlocked_at is not null
  ) then raise exception 'Accept the company invitation and complete company access before going active.'; end if;
  if exists (
    select 1 from public.transport_trips trip join public.transport_fleets fleet on fleet.id = trip.fleet_id
    where fleet.operator_id = new.operator_id and fleet.id <> new.id
      and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
  ) then raise exception 'Complete your ongoing trip before making another company or solo fleet active.'; end if;
  update public.transport_fleets set active_status = 'offline', is_visible_to_passengers = false, updated_at = now()
  where operator_id = new.operator_id and id <> new.id and (active_status = 'active' or is_visible_to_passengers);
  return new;
end;
$$;
create trigger transport_guard_operator_work_context_trigger
before insert or update of active_status, is_visible_to_passengers, operator_id, company_id on public.transport_fleets
for each row execute function public.transport_guard_operator_work_context();

create or replace function public.set_transport_operator_availability(p_fleet_id uuid, p_active boolean, p_pause_reason text default '')
returns public.transport_fleets language plpgsql security definer set search_path = public as $$
declare v_operator uuid; v_fleet public.transport_fleets;
begin
  if auth.uid() is null then raise exception 'Sign in to update fleet availability.'; end if;
  select id into v_operator from public.transport_operators where user_id = auth.uid() for update;
  if v_operator is null then raise exception 'Your operator profile is unavailable.'; end if;
  update public.transport_fleets set active_status = case when p_active then 'active' else 'offline' end,
    is_visible_to_passengers = p_active, pause_reason = case when p_active then '' else coalesce(p_pause_reason, '') end,
    last_active_at = now(), updated_at = now()
  where id = p_fleet_id and operator_id = v_operator returning * into v_fleet;
  if not found then raise exception 'Only the assigned operator can change this fleet availability.'; end if;
  return v_fleet;
end;
$$;

-- Both entry points lock the operator BEFORE a fleet/invite row. Otherwise
-- concurrent solo/company toggles can lock each other's fleet while waiting
-- for the operator lock taken by the availability guard.
create or replace function public.set_transport_company_operator_availability(company_fleet_uuid uuid, active boolean)
returns setof public.transport_fleets language plpgsql security definer set search_path = public as $$
declare v_operator uuid; v_runtime uuid; v_company_fleet public.transport_company_fleets;
begin
  if auth.uid() is null then raise exception 'Sign in to update fleet availability.'; end if;
  select id into v_operator from public.transport_operators where user_id = auth.uid() for update;
  if v_operator is null then raise exception 'Your operator profile is unavailable.'; end if;
  select * into v_company_fleet from public.transport_company_fleets where id = company_fleet_uuid;
  if not found or lower(v_company_fleet.service_category) = 'rental' then
    raise exception 'This fleet is not available for operator service.';
  end if;
  if v_company_fleet.operator_id is distinct from v_operator and not exists (
    select 1 from public.transport_company_operator_invites invite where invite.company_fleet_id = company_fleet_uuid
      and invite.status = 'accepted' and (invite.operator_user_id = auth.uid() or invite.operator_id = v_operator)
  ) then raise exception 'Only the assigned company operator can change this fleet availability.'; end if;
  v_runtime := v_company_fleet.transport_fleet_id;
  if v_runtime is null or v_company_fleet.operator_id is distinct from v_operator then
    update public.transport_company_operator_invites set operator_id = v_operator, operator_user_id = auth.uid(), updated_at = now()
    where company_fleet_id = company_fleet_uuid and status = 'accepted'
      and (operator_user_id = auth.uid() or operator_id = v_operator)
      and (operator_id is null or operator_user_id is null);
    v_runtime := public.transport_company_provision_runtime_fleet(company_fleet_uuid, v_operator);
  end if;
  if v_runtime is null then raise exception 'This company fleet could not be prepared. Contact the company administrator.'; end if;
  return query select * from public.set_transport_operator_availability(v_runtime, active, '');
end;
$$;

-- Pending requests from a former company/solo fleet cannot become a second
-- simultaneous job after the operator has selected another active fleet.
create or replace function public.transport_guard_operator_trip_context()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_operator uuid; v_active text;
begin
  if new.status not in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused') then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused') then
      if new.fleet_id is distinct from old.fleet_id then raise exception 'An ongoing trip cannot be moved to another fleet.'; end if;
      return new;
    end if;
  end if;
  select fleet.operator_id, fleet.active_status into v_operator, v_active from public.transport_fleets fleet where fleet.id = new.fleet_id;
  perform 1 from public.transport_operators where id = v_operator for update;
  -- Re-read after the operator lock, in case availability changed while waiting.
  select active_status into v_active from public.transport_fleets where id = new.fleet_id;
  if v_active is distinct from 'active' then raise exception 'Make this assigned fleet active before accepting a new trip.'; end if;
  if exists (select 1 from public.transport_trips trip join public.transport_fleets fleet on fleet.id = trip.fleet_id
    where fleet.operator_id = v_operator and fleet.id <> new.fleet_id and trip.id <> new.id
      and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')) then
    raise exception 'Complete your ongoing trip before accepting work for another company or solo fleet.';
  end if;
  return new;
end;
$$;
create trigger transport_guard_operator_trip_context_trigger
before insert or update of status, fleet_id on public.transport_trips
for each row execute function public.transport_guard_operator_trip_context();

-- A company may only see/manage its own runtime fleets and their trips. An
-- operator's memberships in other companies do not grant cross-company access.
drop policy if exists "company managers can read operator fleets" on public.transport_fleets;
create policy "company managers can read operator fleets" on public.transport_fleets for select to authenticated
using (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()));
drop policy if exists "company booking viewers can read operator fleet summaries" on public.transport_fleets;
create policy "company booking viewers can read operator fleet summaries" on public.transport_fleets for select to authenticated
using (public.transport_company_user_has_permission(company_id, 'view_all_bookings', auth.uid()));
drop policy if exists "company managers can suspend operator fleets" on public.transport_fleets;
create policy "company managers can suspend operator fleets" on public.transport_fleets for update to authenticated
using (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()))
with check (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()));
drop policy if exists "company managers can read operator trips" on public.transport_trips;
create policy "company managers can read operator trips" on public.transport_trips for select to authenticated
using (exists (select 1 from public.transport_fleets fleet where fleet.id = transport_trips.fleet_id
  and (public.transport_company_user_has_permission(fleet.company_id, 'view_all_bookings', auth.uid())
    or public.transport_company_user_has_permission(fleet.company_id, 'manage_operators', auth.uid()))));
-- These rows have no company/fleet attribution and must remain private to their owner.
drop policy if exists "company managers can read operator transactions" on public.transport_operator_transactions;
drop policy if exists "company managers can read operator alerts" on public.transport_operator_alerts;

revoke all on function public.transport_remember_solo_operator() from public, anon, authenticated;
revoke all on function public.transport_company_provision_runtime_fleet(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transport_guard_company_invite_acceptance() from public, anon, authenticated;
revoke all on function public.transport_guard_operator_work_context() from public, anon, authenticated;
revoke all on function public.transport_guard_operator_trip_context() from public, anon, authenticated;
revoke all on function public.set_transport_operator_availability(uuid, boolean, text) from public, anon;
revoke all on function public.set_transport_company_operator_availability(uuid, boolean) from public, anon;
revoke all on function public.get_transport_operator_company_access() from public, anon;
revoke all on function public.accept_transport_company_operator_invite(uuid, jsonb, boolean) from public, anon;
grant execute on function public.get_transport_operator_company_access() to authenticated;
grant execute on function public.accept_transport_company_operator_invite(uuid, jsonb, boolean) to authenticated;
grant execute on function public.set_transport_operator_availability(uuid, boolean, text) to authenticated;
grant execute on function public.set_transport_company_operator_availability(uuid, boolean) to authenticated;

commit;
