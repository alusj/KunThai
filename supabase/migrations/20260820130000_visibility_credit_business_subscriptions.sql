-- Visibility Credit subscriptions for UrMall businesses and UrRide companies.
--
-- Important safety rule: a downgrade never deletes, pauses, or suspends an
-- existing product, operator, vehicle, or administrator. Capacity guards in
-- the following migration only reject new additions while usage is at/above
-- the effective plan limit.

alter table public.visibility_credit_transactions
  drop constraint if exists visibility_credit_transactions_transaction_type_check;

alter table public.visibility_credit_transactions
  add constraint visibility_credit_transactions_transaction_type_check
  check (transaction_type in (
    'invite_reward',
    'boost_spend',
    'admin_adjustment',
    'refund',
    'starter_bonus',
    'credit_transfer_sent',
    'credit_transfer_received',
    'purchase',
    'subscription_spend',
    'subscription_refund'
  ));

-- Some installations already have this table because the UrMall admin UI was
-- released before its schema was consolidated into migrations. Keep every
-- statement additive so those installations are not disturbed.
create table if not exists public.marketplace_business_admins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending',
  responsibilities jsonb not null default '{"dashboardAccess":true}'::jsonb,
  admin_name text not null default 'KunThai member',
  admin_code text not null default '',
  business_name text not null default 'UrMall business',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.marketplace_business_admins
  add column if not exists business_id uuid references public.marketplace_businesses(id) on delete cascade,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists status text not null default 'pending',
  add column if not exists responsibilities jsonb not null default '{"dashboardAccess":true}'::jsonb,
  add column if not exists admin_name text not null default 'KunThai member',
  add column if not exists admin_code text not null default '',
  add column if not exists business_name text not null default 'UrMall business',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists marketplace_business_admins_business_user_uidx
  on public.marketplace_business_admins (business_id, user_id);
create index if not exists marketplace_business_admins_user_status_idx
  on public.marketplace_business_admins (user_id, status, created_at desc);

alter table public.marketplace_business_admins enable row level security;

drop policy if exists "UrMall owners manage business admins" on public.marketplace_business_admins;
create policy "UrMall owners manage business admins"
on public.marketplace_business_admins for all to authenticated
using (exists (
  select 1 from public.marketplace_businesses business
  where business.id = business_id and business.user_id = auth.uid()
))
with check (exists (
  select 1 from public.marketplace_businesses business
  where business.id = business_id and business.user_id = auth.uid()
));

drop policy if exists "UrMall admins read own invitations" on public.marketplace_business_admins;
create policy "UrMall admins read own invitations"
on public.marketplace_business_admins for select to authenticated
using (user_id = auth.uid());

drop policy if exists "UrMall admins respond to own invitations" on public.marketplace_business_admins;
create policy "UrMall admins respond to own invitations"
on public.marketplace_business_admins for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "UrMall admins leave own businesses" on public.marketplace_business_admins;
create policy "UrMall admins leave own businesses"
on public.marketplace_business_admins for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.marketplace_business_admins to authenticated;

create or replace function public.kunthai_guard_business_admin_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Owners may manage the whole invitation. Invitees may only accept or
  -- decline a pending invitation; they cannot grant themselves permissions.
  if auth.uid() = old.user_id and not exists (
    select 1 from public.marketplace_businesses business
    where business.id = old.business_id and business.user_id = auth.uid()
  ) then
    if old.status <> 'pending' or new.status not in ('accepted', 'declined') then
      raise exception 'This invitation can only be accepted or declined.';
    end if;
    new.business_id := old.business_id;
    new.user_id := old.user_id;
    new.invited_by := old.invited_by;
    new.responsibilities := old.responsibilities;
    new.admin_name := old.admin_name;
    new.admin_code := old.admin_code;
    new.business_name := old.business_name;
    new.created_at := old.created_at;
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists kunthai_guard_business_admin_self_update on public.marketplace_business_admins;
create trigger kunthai_guard_business_admin_self_update
before update on public.marketplace_business_admins
for each row execute function public.kunthai_guard_business_admin_self_update();

create table if not exists public.kunthai_business_plans (
  surface text not null check (surface in ('urmall', 'urride')),
  plan_code text not null check (plan_code in ('free', 'pro', 'premium')),
  display_name text not null,
  credit_cost integer not null default 0 check (credit_cost >= 0),
  duration_days integer not null default 30 check (duration_days between 1 and 366),
  grace_days integer not null default 7 check (grace_days between 0 and 30),
  product_limit integer check (product_limit is null or product_limit >= 0),
  operator_limit integer check (operator_limit is null or operator_limit >= 0),
  vehicle_limit integer check (vehicle_limit is null or vehicle_limit >= 0),
  admin_limit integer check (admin_limit is null or admin_limit >= 0),
  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (surface, plan_code)
);

insert into public.kunthai_business_plans (
  surface, plan_code, display_name, credit_cost, duration_days, grace_days,
  product_limit, operator_limit, vehicle_limit, admin_limit, features, sort_order
) values
  ('urmall', 'free', 'Free', 0, 30, 7, 10, null, null, 0,
   '["10 active products","Seller dashboard","Customer messages","Store analytics"]'::jsonb, 1),
  ('urmall', 'pro', 'Pro', 30, 30, 7, 50, null, null, 1,
   '["50 active products","1 business admin","Advanced product insights","Priority store tools"]'::jsonb, 2),
  ('urmall', 'premium', 'Premium', 75, 30, 7, null, null, null, 5,
   '["Unlimited active products","Up to 5 business admins","Full business insights","Premium store tools"]'::jsonb, 3),
  ('urride', 'free', 'Free', 0, 30, 7, null, 5, 5, 0,
   '["5 company operators","5 registered vehicles","Fleet workspace","Ride activity"]'::jsonb, 1),
  ('urride', 'pro', 'Pro', 40, 30, 7, null, 15, 15, 1,
   '["15 company operators","15 registered vehicles","1 company admin","Advanced fleet tools"]'::jsonb, 2),
  ('urride', 'premium', 'Premium', 100, 30, 7, null, 50, 50, 5,
   '["50 company operators","50 registered vehicles","Up to 5 company admins","Operator capacity packs"]'::jsonb, 3)
on conflict (surface, plan_code) do update set
  display_name = excluded.display_name,
  credit_cost = excluded.credit_cost,
  duration_days = excluded.duration_days,
  grace_days = excluded.grace_days,
  product_limit = excluded.product_limit,
  operator_limit = excluded.operator_limit,
  vehicle_limit = excluded.vehicle_limit,
  admin_limit = excluded.admin_limit,
  features = excluded.features,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = timezone('utc', now());

create table if not exists public.kunthai_business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('urmall', 'urride')),
  marketplace_business_id uuid references public.marketplace_businesses(id) on delete cascade,
  transport_company_id uuid references public.transport_companies(id) on delete cascade,
  plan_code text not null default 'free',
  status text not null default 'active' check (status in ('active', 'grace', 'expired', 'cancelled')),
  pending_plan_code text,
  auto_renew boolean not null default true,
  payer_user_id uuid references auth.users(id) on delete set null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_ends_at timestamptz,
  operator_pack_count integer not null default 0 check (operator_pack_count >= 0),
  reminder_7_sent boolean not null default false,
  reminder_3_sent boolean not null default false,
  reminder_1_sent boolean not null default false,
  grace_notice_sent boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint kunthai_business_subscriptions_plan_fk
    foreign key (surface, plan_code) references public.kunthai_business_plans(surface, plan_code),
  constraint kunthai_business_subscriptions_entity_check check (
    (surface = 'urmall' and marketplace_business_id is not null and transport_company_id is null)
    or
    (surface = 'urride' and transport_company_id is not null and marketplace_business_id is null)
  ),
  constraint kunthai_business_subscriptions_pending_plan_check check (
    pending_plan_code is null or pending_plan_code in ('free', 'pro', 'premium')
  )
);

create unique index if not exists kunthai_business_subscriptions_urmall_uidx
  on public.kunthai_business_subscriptions (marketplace_business_id)
  where surface = 'urmall';
create unique index if not exists kunthai_business_subscriptions_urride_uidx
  on public.kunthai_business_subscriptions (transport_company_id)
  where surface = 'urride';
create index if not exists kunthai_business_subscriptions_renewal_idx
  on public.kunthai_business_subscriptions (status, current_period_end)
  where plan_code <> 'free';

create table if not exists public.kunthai_business_subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.kunthai_business_subscriptions(id) on delete cascade,
  event_type text not null,
  from_plan_code text,
  to_plan_code text,
  credits integer not null default 0,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists kunthai_business_subscription_events_subscription_idx
  on public.kunthai_business_subscription_events (subscription_id, created_at desc);

alter table public.kunthai_business_plans enable row level security;
alter table public.kunthai_business_subscriptions enable row level security;
alter table public.kunthai_business_subscription_events enable row level security;

drop policy if exists "Anyone reads active KunThai business plans" on public.kunthai_business_plans;
create policy "Anyone reads active KunThai business plans"
on public.kunthai_business_plans for select to anon, authenticated
using (active = true);

grant select on public.kunthai_business_plans to anon, authenticated;

create or replace function public.kunthai_business_user_can_manage(
  p_surface text,
  p_entity_id uuid,
  p_user_id uuid default auth.uid(),
  p_require_billing boolean default false
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_user_id is null or p_entity_id is null then
    return false;
  end if;

  if lower(p_surface) = 'urmall' then
    return exists (
      select 1 from public.marketplace_businesses business
      where business.id = p_entity_id and business.user_id = p_user_id
    ) or exists (
      select 1 from public.marketplace_business_admins admin_row
      where admin_row.business_id = p_entity_id
        and admin_row.user_id = p_user_id
        and admin_row.status = 'accepted'
        and (
          not p_require_billing
          or coalesce((admin_row.responsibilities ->> 'manageBilling')::boolean, false)
        )
    );
  end if;

  if lower(p_surface) = 'urride' then
    return public.transport_company_is_owner(p_entity_id, p_user_id)
      or (
        not p_require_billing
        and public.transport_company_user_has_permission(p_entity_id, 'view_company_hq', p_user_id)
      )
      or public.transport_company_user_has_permission(p_entity_id, 'manage_billing', p_user_id);
  end if;

  return false;
end;
$$;

drop policy if exists "Managers read KunThai business subscriptions" on public.kunthai_business_subscriptions;
create policy "Managers read KunThai business subscriptions"
on public.kunthai_business_subscriptions for select to authenticated
using (public.kunthai_business_user_can_manage(
  surface,
  coalesce(marketplace_business_id, transport_company_id),
  auth.uid(),
  false
));

drop policy if exists "Managers read KunThai business subscription events" on public.kunthai_business_subscription_events;
create policy "Managers read KunThai business subscription events"
on public.kunthai_business_subscription_events for select to authenticated
using (exists (
  select 1 from public.kunthai_business_subscriptions subscription
  where subscription.id = subscription_id
    and public.kunthai_business_user_can_manage(
      subscription.surface,
      coalesce(subscription.marketplace_business_id, subscription.transport_company_id),
      auth.uid(),
      false
    )
));

grant select on public.kunthai_business_subscriptions, public.kunthai_business_subscription_events to authenticated;

create or replace function public.kunthai_business_effective_entitlement(
  p_surface text,
  p_entity_id uuid
)
returns table (
  plan_code text,
  plan_name text,
  product_limit integer,
  operator_limit integer,
  vehicle_limit integer,
  admin_limit integer,
  status text,
  operator_pack_count integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_plan_code text := 'free';
  v_status text := 'active';
  v_pack_count integer := 0;
  v_grace_days integer := 7;
begin
  select * into v_subscription
  from public.kunthai_business_subscriptions subscription
  where subscription.surface = lower(p_surface)
    and coalesce(subscription.marketplace_business_id, subscription.transport_company_id) = p_entity_id
  limit 1;

  if v_subscription.id is not null then
    select plan.grace_days into v_grace_days
    from public.kunthai_business_plans plan
    where plan.surface = v_subscription.surface and plan.plan_code = v_subscription.plan_code;

    if v_subscription.plan_code = 'free' then
      v_plan_code := 'free';
      v_status := coalesce(v_subscription.status, 'active');
    elsif v_subscription.status in ('active', 'grace')
      and (
        v_subscription.current_period_end is null
        or timezone('utc', now()) <= coalesce(
          v_subscription.grace_ends_at,
          v_subscription.current_period_end + make_interval(days => coalesce(v_grace_days, 7))
        )
      ) then
      v_plan_code := v_subscription.plan_code;
      v_status := case
        when v_subscription.current_period_end is not null
          and timezone('utc', now()) > v_subscription.current_period_end then 'grace'
        else v_subscription.status
      end;
      v_pack_count := case when v_subscription.plan_code = 'premium'
        then coalesce(v_subscription.operator_pack_count, 0) else 0 end;
    else
      v_plan_code := 'free';
      v_status := 'expired';
    end if;
  end if;

  return query
  select
    plan.plan_code,
    plan.display_name,
    plan.product_limit,
    case when plan.operator_limit is null then null
      else plan.operator_limit + (v_pack_count * 10) end,
    plan.vehicle_limit,
    plan.admin_limit,
    v_status,
    v_pack_count
  from public.kunthai_business_plans plan
  where plan.surface = lower(p_surface) and plan.plan_code = v_plan_code;
end;
$$;

create or replace function public.kunthai_business_usage(
  p_surface text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_products integer := 0;
  v_operators integer := 0;
  v_vehicles integer := 0;
  v_admins integer := 0;
begin
  if lower(p_surface) = 'urmall' then
    select count(*)::integer into v_products
    from public.marketplace_products product
    where product.business_id = p_entity_id and product.status = 'active';

    select count(*)::integer into v_admins
    from public.marketplace_business_admins admin_row
    where admin_row.business_id = p_entity_id
      and admin_row.status in ('pending', 'accepted');
  elsif lower(p_surface) = 'urride' then
    with operator_identities as (
      select coalesce(
        invite.operator_user_id::text,
        invite.operator_id::text,
        nullif(lower(btrim(invite.operator_public_id)), '')
      ) as identity_key
      from public.transport_company_operator_invites invite
      where invite.company_id = p_entity_id and invite.status in ('pending', 'accepted')
      union
      select coalesce(
        member.user_id::text,
        member.operator_id::text,
        nullif(lower(btrim(member.public_id)), '')
      ) as identity_key
      from public.transport_company_members member
      where member.company_id = p_entity_id
        and member.role = 'operator'
        and member.status in ('pending', 'active')
        and coalesce(member.service_status, 'active') = 'active'
    )
    select count(*)::integer into v_operators
    from operator_identities where identity_key is not null;

    select count(*)::integer into v_vehicles
    from public.transport_company_fleets fleet
    where fleet.company_id = p_entity_id;

    select count(*)::integer into v_admins
    from public.transport_company_members member
    where member.company_id = p_entity_id
      and member.role in ('admin', 'fleet_manager', 'dispatcher')
      and member.status in ('pending', 'active')
      and coalesce(member.service_status, 'active') = 'active';
  end if;

  return jsonb_build_object(
    'products', v_products,
    'operators', v_operators,
    'vehicles', v_vehicles,
    'admins', v_admins
  );
end;
$$;

create or replace function public.get_kunthai_business_subscription(
  p_surface text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_surface text := lower(btrim(coalesce(p_surface, '')));
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_entitlement record;
  v_plans jsonb;
  v_wallet_balance integer := 0;
begin
  if not public.kunthai_business_user_can_manage(v_surface, p_entity_id, auth.uid(), false) then
    raise exception 'You do not have access to this business subscription.';
  end if;

  select * into v_subscription
  from public.kunthai_business_subscriptions subscription
  where subscription.surface = v_surface
    and coalesce(subscription.marketplace_business_id, subscription.transport_company_id) = p_entity_id
  limit 1;

  select * into v_entitlement
  from public.kunthai_business_effective_entitlement(v_surface, p_entity_id);

  select coalesce(jsonb_agg(to_jsonb(plan) order by plan.sort_order), '[]'::jsonb) into v_plans
  from public.kunthai_business_plans plan
  where plan.surface = v_surface and plan.active = true;

  select coalesce(wallet.balance, 0) into v_wallet_balance
  from public.visibility_credit_wallets wallet
  where wallet.user_id = auth.uid();

  return jsonb_build_object(
    'available', true,
    'surface', v_surface,
    'entity_id', p_entity_id,
    'wallet_balance', coalesce(v_wallet_balance, 0),
    'plans', v_plans,
    'usage', public.kunthai_business_usage(v_surface, p_entity_id),
    'entitlement', jsonb_build_object(
      'plan_code', coalesce(v_entitlement.plan_code, 'free'),
      'plan_name', coalesce(v_entitlement.plan_name, 'Free'),
      'status', coalesce(v_entitlement.status, 'active'),
      'product_limit', v_entitlement.product_limit,
      'operator_limit', v_entitlement.operator_limit,
      'vehicle_limit', v_entitlement.vehicle_limit,
      'admin_limit', v_entitlement.admin_limit,
      'operator_pack_count', coalesce(v_entitlement.operator_pack_count, 0)
    ),
    'subscription', case when v_subscription.id is null then jsonb_build_object(
      'plan_code', 'free',
      'status', 'active',
      'auto_renew', false,
      'pending_plan_code', null
    ) else jsonb_build_object(
      'id', v_subscription.id,
      'plan_code', v_subscription.plan_code,
      'status', v_subscription.status,
      'pending_plan_code', v_subscription.pending_plan_code,
      'auto_renew', v_subscription.auto_renew,
      'payer_user_id', v_subscription.payer_user_id,
      'current_period_start', v_subscription.current_period_start,
      'current_period_end', v_subscription.current_period_end,
      'grace_ends_at', coalesce(v_subscription.grace_ends_at, v_subscription.current_period_end + interval '7 days'),
      'operator_pack_count', v_subscription.operator_pack_count
    ) end
  );
end;
$$;

create or replace function public.kunthai_debit_subscription_credits(
  p_user_id uuid,
  p_amount integer,
  p_surface text,
  p_reference_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.visibility_credit_wallets%rowtype;
  v_amount integer := greatest(0, coalesce(p_amount, 0));
begin
  if p_user_id is null then
    raise exception 'A subscription payer is required.';
  end if;

  insert into public.visibility_credit_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_wallet
  from public.visibility_credit_wallets wallet
  where wallet.user_id = p_user_id
  for update;

  if v_wallet.balance < v_amount then
    raise exception 'Not enough Visibility Credits. Available: %, required: %', v_wallet.balance, v_amount;
  end if;

  if v_amount = 0 then
    return v_wallet.balance;
  end if;

  update public.visibility_credit_wallets
  set balance = balance - v_amount,
      lifetime_spent = lifetime_spent + v_amount,
      updated_at = timezone('utc', now())
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface,
    reference_type, reference_id, metadata
  ) values (
    p_user_id, -v_amount, v_wallet.balance, 'subscription_spend', lower(p_surface),
    'business_subscription', p_reference_id, coalesce(p_metadata, '{}'::jsonb)
  );

  return v_wallet.balance;
end;
$$;

revoke all on function public.kunthai_debit_subscription_credits(uuid, integer, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.change_kunthai_business_plan(
  p_surface text,
  p_entity_id uuid,
  p_plan_code text,
  p_auto_renew boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface text := lower(btrim(coalesce(p_surface, '')));
  v_target_code text := lower(btrim(coalesce(p_plan_code, '')));
  v_target public.kunthai_business_plans%rowtype;
  v_current_plan public.kunthai_business_plans%rowtype;
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_from_plan text := 'free';
  v_now timestamptz := timezone('utc', now());
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_charge integer := 0;
  v_current_rank integer := 1;
  v_target_rank integer := 1;
  v_remaining_ratio numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage a subscription.';
  end if;
  if not public.kunthai_business_user_can_manage(v_surface, p_entity_id, auth.uid(), true) then
    raise exception 'Only the owner or a billing administrator can change this plan.';
  end if;

  select * into v_target
  from public.kunthai_business_plans plan
  where plan.surface = v_surface and plan.plan_code = v_target_code and plan.active = true;
  if v_target.plan_code is null then
    raise exception 'Choose a valid business plan.';
  end if;

  select * into v_subscription
  from public.kunthai_business_subscriptions subscription
  where subscription.surface = v_surface
    and coalesce(subscription.marketplace_business_id, subscription.transport_company_id) = p_entity_id
  for update;

  if v_subscription.id is not null then
    v_from_plan := v_subscription.plan_code;
  end if;

  v_current_rank := case v_from_plan when 'premium' then 3 when 'pro' then 2 else 1 end;
  v_target_rank := case v_target_code when 'premium' then 3 when 'pro' then 2 else 1 end;

  if v_subscription.id is not null
    and v_target_code = v_subscription.plan_code
    and v_subscription.status in ('active', 'grace')
    and (v_subscription.current_period_end is null or v_subscription.current_period_end > v_now) then
    update public.kunthai_business_subscriptions
    set auto_renew = p_auto_renew,
        pending_plan_code = null,
        updated_at = v_now
    where id = v_subscription.id;
    return public.get_kunthai_business_subscription(v_surface, p_entity_id);
  end if;

  -- Lower plans start at the next renewal. The current paid entitlement stays
  -- intact until then, so a plan change can never interrupt current work.
  if v_subscription.id is not null
    and v_subscription.plan_code <> 'free'
    and v_subscription.status in ('active', 'grace')
    and v_subscription.current_period_end > v_now
    and v_target_rank < v_current_rank then
    update public.kunthai_business_subscriptions
    set pending_plan_code = v_target_code,
        auto_renew = case when v_target_code = 'free' then false else p_auto_renew end,
        updated_at = v_now
    where id = v_subscription.id;

    insert into public.kunthai_business_subscription_events (
      subscription_id, event_type, from_plan_code, to_plan_code, actor_user_id
    ) values (
      v_subscription.id, 'downgrade_scheduled', v_subscription.plan_code, v_target_code, auth.uid()
    );
    return public.get_kunthai_business_subscription(v_surface, p_entity_id);
  end if;

  if v_target_code = 'free' then
    if v_subscription.id is null then
      insert into public.kunthai_business_subscriptions (
        surface, marketplace_business_id, transport_company_id, plan_code,
        status, auto_renew, payer_user_id
      ) values (
        v_surface,
        case when v_surface = 'urmall' then p_entity_id else null end,
        case when v_surface = 'urride' then p_entity_id else null end,
        'free', 'active', false, auth.uid()
      ) returning * into v_subscription;
    else
      update public.kunthai_business_subscriptions
      set plan_code = 'free', status = 'active', pending_plan_code = null,
          auto_renew = false, current_period_start = null, current_period_end = null,
          grace_ends_at = null, operator_pack_count = 0, updated_at = v_now
      where id = v_subscription.id returning * into v_subscription;
    end if;
    return public.get_kunthai_business_subscription(v_surface, p_entity_id);
  end if;

  -- An upgrade inside an active period is prorated and keeps the same renewal
  -- date. Starting after Free/expiry charges one full 30-day period.
  if v_subscription.id is not null
    and v_subscription.plan_code <> 'free'
    and v_subscription.current_period_end > v_now
    and v_target_rank > v_current_rank then
    select * into v_current_plan
    from public.kunthai_business_plans plan
    where plan.surface = v_surface and plan.plan_code = v_subscription.plan_code;

    v_period_start := coalesce(v_subscription.current_period_start, v_now);
    v_period_end := v_subscription.current_period_end;
    v_remaining_ratio := greatest(0, least(1,
      extract(epoch from (v_period_end - v_now))
      / greatest(1, extract(epoch from (v_period_end - v_period_start)))
    ));
    v_charge := greatest(1, ceil((v_target.credit_cost - coalesce(v_current_plan.credit_cost, 0)) * v_remaining_ratio)::integer);
  else
    v_period_start := v_now;
    v_period_end := v_now + make_interval(days => v_target.duration_days);
    v_charge := v_target.credit_cost;
  end if;

  if v_subscription.id is null then
    insert into public.kunthai_business_subscriptions (
      surface, marketplace_business_id, transport_company_id, plan_code, status,
      auto_renew, payer_user_id, current_period_start, current_period_end,
      grace_ends_at
    ) values (
      v_surface,
      case when v_surface = 'urmall' then p_entity_id else null end,
      case when v_surface = 'urride' then p_entity_id else null end,
      v_target_code, 'active', p_auto_renew, auth.uid(), v_period_start, v_period_end,
      v_period_end + make_interval(days => v_target.grace_days)
    ) returning * into v_subscription;
  else
    update public.kunthai_business_subscriptions
    set plan_code = v_target_code,
        status = 'active',
        pending_plan_code = null,
        auto_renew = p_auto_renew,
        payer_user_id = auth.uid(),
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        grace_ends_at = v_period_end + make_interval(days => v_target.grace_days),
        operator_pack_count = case when v_target_code = 'premium'
          then operator_pack_count else 0 end,
        reminder_7_sent = false,
        reminder_3_sent = false,
        reminder_1_sent = false,
        grace_notice_sent = false,
        updated_at = v_now
    where id = v_subscription.id returning * into v_subscription;
  end if;

  perform public.kunthai_debit_subscription_credits(
    auth.uid(), v_charge, v_surface, v_subscription.id,
    jsonb_build_object('kind', 'plan_change', 'from_plan', v_from_plan, 'to_plan', v_target_code)
  );

  insert into public.kunthai_business_subscription_events (
    subscription_id, event_type, from_plan_code, to_plan_code, credits, actor_user_id
  ) values (
    v_subscription.id,
    case when v_current_rank < v_target_rank then 'upgraded' else 'activated' end,
    v_from_plan, v_target_code, v_charge, auth.uid()
  );

  return public.get_kunthai_business_subscription(v_surface, p_entity_id);
end;
$$;

create or replace function public.set_kunthai_business_auto_renew(
  p_surface text,
  p_entity_id uuid,
  p_auto_renew boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.kunthai_business_user_can_manage(p_surface, p_entity_id, auth.uid(), true) then
    raise exception 'Only the owner or a billing administrator can change renewal settings.';
  end if;

  update public.kunthai_business_subscriptions subscription
  set auto_renew = p_auto_renew,
      pending_plan_code = case
        when p_auto_renew then nullif(subscription.pending_plan_code, 'free')
        else subscription.pending_plan_code
      end,
      updated_at = timezone('utc', now())
  where subscription.surface = lower(p_surface)
    and coalesce(subscription.marketplace_business_id, subscription.transport_company_id) = p_entity_id;

  return public.get_kunthai_business_subscription(lower(p_surface), p_entity_id);
end;
$$;

create or replace function public.buy_kunthai_operator_capacity_pack(
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_pack_cost constant integer := 20;
begin
  if not public.kunthai_business_user_can_manage('urride', p_company_id, auth.uid(), true) then
    raise exception 'Only the owner or a billing administrator can add operator capacity.';
  end if;

  select * into v_subscription
  from public.kunthai_business_subscriptions subscription
  where subscription.surface = 'urride' and subscription.transport_company_id = p_company_id
  for update;

  if v_subscription.id is null
    or v_subscription.plan_code <> 'premium'
    or v_subscription.status not in ('active', 'grace') then
    raise exception 'Operator capacity packs require an active UrRide Premium plan.';
  end if;

  perform public.kunthai_debit_subscription_credits(
    auth.uid(), v_pack_cost, 'urride', v_subscription.id,
    jsonb_build_object('kind', 'operator_capacity_pack', 'operators_added', 10)
  );

  update public.kunthai_business_subscriptions
  set operator_pack_count = operator_pack_count + 1,
      updated_at = timezone('utc', now())
  where id = v_subscription.id;

  insert into public.kunthai_business_subscription_events (
    subscription_id, event_type, from_plan_code, to_plan_code, credits, actor_user_id,
    metadata
  ) values (
    v_subscription.id, 'operator_pack_added', 'premium', 'premium', v_pack_cost,
    auth.uid(), jsonb_build_object('operators_added', 10)
  );

  return public.get_kunthai_business_subscription('urride', p_company_id);
end;
$$;

revoke all on function public.kunthai_business_effective_entitlement(text, uuid) from public, anon, authenticated;
revoke all on function public.kunthai_business_usage(text, uuid) from public, anon, authenticated;
grant execute on function public.kunthai_business_user_can_manage(text, uuid, uuid, boolean) to authenticated;
grant execute on function public.get_kunthai_business_subscription(text, uuid) to authenticated;
grant execute on function public.change_kunthai_business_plan(text, uuid, text, boolean) to authenticated;
grant execute on function public.set_kunthai_business_auto_renew(text, uuid, boolean) to authenticated;
grant execute on function public.buy_kunthai_operator_capacity_pack(uuid) to authenticated;
