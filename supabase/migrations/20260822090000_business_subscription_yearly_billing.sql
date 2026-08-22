-- Yearly billing for business subscriptions. Purely additive on top of
-- 20260820130000 / 20260820150000: existing paid subscriptions keep
-- billing_interval = 'monthly' and every monthly code path below behaves
-- exactly as before. Yearly terms charge a discounted annual credit cost
-- (2 months free) and run for 365 days.

-- 1) Plan catalog gains an optional yearly price/duration alongside the
--    monthly one. Null means "no yearly option" (the UI hides it).
alter table public.kunthai_business_plans
  add column if not exists yearly_credit_cost integer
    check (yearly_credit_cost is null or yearly_credit_cost >= 0);
alter table public.kunthai_business_plans
  add column if not exists yearly_duration_days integer
    check (yearly_duration_days is null or yearly_duration_days between 1 and 366);

update public.kunthai_business_plans set
  yearly_credit_cost = case plan_code
    when 'free' then 0
    else credit_cost * 10  -- ~2 months free versus paying monthly
  end,
  yearly_duration_days = 365,
  updated_at = timezone('utc', now())
where surface in ('urmall', 'urride');

-- 2) Subscriptions remember which cadence they are on, and which cadence a
--    scheduled change should adopt at the next renewal.
alter table public.kunthai_business_subscriptions
  add column if not exists billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'yearly'));
alter table public.kunthai_business_subscriptions
  add column if not exists pending_billing_interval text
    check (pending_billing_interval is null or pending_billing_interval in ('monthly', 'yearly'));

-- 3) Surface the cadence and the yearly catalog prices to the client. The
--    plan rows already flow through to_jsonb(plan), so the new columns appear
--    automatically; only the explicit subscription object needs new keys.
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
      'pending_plan_code', null,
      'billing_interval', 'monthly',
      'pending_billing_interval', null
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
      'operator_pack_count', v_subscription.operator_pack_count,
      'billing_interval', coalesce(v_subscription.billing_interval, 'monthly'),
      'pending_billing_interval', v_subscription.pending_billing_interval
    ) end
  );
end;
$$;

-- 4) Plan changes accept an optional cadence. The 4-argument form is dropped
--    and replaced by a 5-argument form whose new parameter defaults to
--    'monthly', so existing callers that pass only four named arguments keep
--    working unchanged.
drop function if exists public.change_kunthai_business_plan(text, uuid, text, boolean);

create or replace function public.change_kunthai_business_plan(
  p_surface text,
  p_entity_id uuid,
  p_plan_code text,
  p_auto_renew boolean default true,
  p_billing_interval text default 'monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface text := lower(btrim(coalesce(p_surface, '')));
  v_target_code text := lower(btrim(coalesce(p_plan_code, '')));
  v_interval text := case when lower(btrim(coalesce(p_billing_interval, 'monthly'))) = 'yearly' then 'yearly' else 'monthly' end;
  v_target public.kunthai_business_plans%rowtype;
  v_current_plan public.kunthai_business_plans%rowtype;
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_from_plan text := 'free';
  v_now timestamptz := timezone('utc', now());
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_charge integer := 0;
  v_target_cost integer := 0;
  v_target_duration integer := 30;
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

  -- Free never has a paid cadence.
  if v_target_code = 'free' then
    v_interval := 'monthly';
  end if;

  v_target_cost := case when v_interval = 'yearly'
    then coalesce(v_target.yearly_credit_cost, v_target.credit_cost * 10)
    else v_target.credit_cost end;
  v_target_duration := case when v_interval = 'yearly'
    then coalesce(v_target.yearly_duration_days, 365)
    else v_target.duration_days end;

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

  -- Same plan AND same cadence, still active: only refresh auto-renew.
  if v_subscription.id is not null
    and v_target_code = v_subscription.plan_code
    and coalesce(v_subscription.billing_interval, 'monthly') = v_interval
    and v_subscription.status in ('active', 'grace')
    and (v_subscription.current_period_end is null or v_subscription.current_period_end > v_now) then
    update public.kunthai_business_subscriptions
    set auto_renew = p_auto_renew,
        pending_plan_code = null,
        pending_billing_interval = null,
        updated_at = v_now
    where id = v_subscription.id;
    return public.get_kunthai_business_subscription(v_surface, p_entity_id);
  end if;

  -- Reductions start at the next renewal: a lower tier, or the same tier
  -- stepping yearly -> monthly. Current entitlement stays intact until then.
  if v_subscription.id is not null
    and v_subscription.plan_code <> 'free'
    and v_subscription.status in ('active', 'grace')
    and v_subscription.current_period_end > v_now
    and (
      v_target_rank < v_current_rank
      or (
        v_target_code = v_subscription.plan_code
        and coalesce(v_subscription.billing_interval, 'monthly') = 'yearly'
        and v_interval = 'monthly'
      )
    ) then
    update public.kunthai_business_subscriptions
    set pending_plan_code = v_target_code,
        pending_billing_interval = v_interval,
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
        status, auto_renew, payer_user_id, billing_interval
      ) values (
        v_surface,
        case when v_surface = 'urmall' then p_entity_id else null end,
        case when v_surface = 'urride' then p_entity_id else null end,
        'free', 'active', false, auth.uid(), 'monthly'
      ) returning * into v_subscription;
    else
      update public.kunthai_business_subscriptions
      set plan_code = 'free', status = 'active', pending_plan_code = null,
          pending_billing_interval = null, billing_interval = 'monthly',
          auto_renew = false, current_period_start = null, current_period_end = null,
          grace_ends_at = null, operator_pack_count = 0, updated_at = v_now
      where id = v_subscription.id returning * into v_subscription;
    end if;
    return public.get_kunthai_business_subscription(v_surface, p_entity_id);
  end if;

  if v_interval = 'yearly' then
    -- Yearly always starts a fresh annual term at the full annual price.
    v_period_start := v_now;
    v_period_end := v_now + make_interval(days => v_target_duration);
    v_charge := v_target_cost;
  elsif v_subscription.id is not null
    and v_subscription.plan_code <> 'free'
    and coalesce(v_subscription.billing_interval, 'monthly') = 'monthly'
    and v_subscription.current_period_end > v_now
    and v_target_rank > v_current_rank then
    -- Monthly in-period upgrade: prorate against the monthly prices and keep
    -- the same renewal date.
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
    v_period_end := v_now + make_interval(days => v_target_duration);
    v_charge := v_target_cost;
  end if;

  if v_subscription.id is null then
    insert into public.kunthai_business_subscriptions (
      surface, marketplace_business_id, transport_company_id, plan_code, status,
      auto_renew, payer_user_id, current_period_start, current_period_end,
      grace_ends_at, billing_interval
    ) values (
      v_surface,
      case when v_surface = 'urmall' then p_entity_id else null end,
      case when v_surface = 'urride' then p_entity_id else null end,
      v_target_code, 'active', p_auto_renew, auth.uid(), v_period_start, v_period_end,
      v_period_end + make_interval(days => v_target.grace_days), v_interval
    ) returning * into v_subscription;
  else
    update public.kunthai_business_subscriptions
    set plan_code = v_target_code,
        status = 'active',
        pending_plan_code = null,
        pending_billing_interval = null,
        billing_interval = v_interval,
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
    jsonb_build_object('kind', 'plan_change', 'from_plan', v_from_plan, 'to_plan', v_target_code, 'interval', v_interval)
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

grant execute on function public.change_kunthai_business_plan(text, uuid, text, boolean, text) to authenticated;

-- 5) Scheduled renewals honour the cadence: a yearly subscription renews for
--    its annual price and another 365 days, and a scheduled cadence change is
--    adopted at renewal.
create or replace function public.kunthai_renew_subscription_row(
  p_subscription_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_current_plan public.kunthai_business_plans%rowtype;
  v_target_plan public.kunthai_business_plans%rowtype;
  v_target_code text;
  v_target_interval text;
  v_renew_cost integer;
  v_renew_duration integer;
  v_now timestamptz := timezone('utc', now());
  v_grace_end timestamptz;
  v_business_name text := 'Your business';
begin
  select * into v_subscription
  from public.kunthai_business_subscriptions subscription
  where subscription.id = p_subscription_id
  for update;

  if v_subscription.id is null or v_subscription.plan_code = 'free'
    or v_subscription.current_period_end is null
    or v_subscription.current_period_end > v_now then
    return 'unchanged';
  end if;

  select * into v_current_plan
  from public.kunthai_business_plans plan
  where plan.surface = v_subscription.surface and plan.plan_code = v_subscription.plan_code;

  v_grace_end := coalesce(
    v_subscription.grace_ends_at,
    v_subscription.current_period_end + make_interval(days => coalesce(v_current_plan.grace_days, 7))
  );
  v_target_code := coalesce(v_subscription.pending_plan_code,
    case when v_subscription.auto_renew then v_subscription.plan_code else 'free' end);
  v_target_interval := coalesce(v_subscription.pending_billing_interval, v_subscription.billing_interval, 'monthly');

  if v_subscription.surface = 'urmall' then
    select coalesce(nullif(business.business_name, ''), 'Your UrMall business') into v_business_name
    from public.marketplace_businesses business where business.id = v_subscription.marketplace_business_id;
  else
    select coalesce(nullif(company.company_name, ''), 'Your UrRide company') into v_business_name
    from public.transport_companies company where company.id = v_subscription.transport_company_id;
  end if;

  if v_target_code = 'free' then
    if v_now <= v_grace_end then
      update public.kunthai_business_subscriptions
      set status = 'grace', grace_ends_at = v_grace_end, updated_at = v_now
      where id = v_subscription.id;
      if not v_subscription.grace_notice_sent then
        perform public.kunthai_subscription_notify(
          v_subscription.payer_user_id,
          'business-subscription:' || v_subscription.id::text || ':grace:' || v_grace_end::date::text,
          format('%s is in a 7-day plan grace period. Existing resources are safe; renew or choose a plan before adding more.', v_business_name),
          'high'
        );
        update public.kunthai_business_subscriptions set grace_notice_sent = true where id = v_subscription.id;
      end if;
      return 'grace';
    end if;

    update public.kunthai_business_subscriptions
    set plan_code = 'free', status = 'expired', pending_plan_code = null,
        pending_billing_interval = null, billing_interval = 'monthly',
        auto_renew = false, current_period_start = null, current_period_end = null,
        grace_ends_at = null, operator_pack_count = 0, updated_at = v_now
    where id = v_subscription.id;
    insert into public.kunthai_business_subscription_events (
      subscription_id, event_type, from_plan_code, to_plan_code, actor_user_id
    ) values (v_subscription.id, 'expired_to_free', v_subscription.plan_code, 'free', v_subscription.payer_user_id);
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':expired:' || v_now::date::text,
      format('%s is now on the Free plan. Nothing was deleted; new additions follow Free plan limits.', v_business_name),
      'high'
    );
    return 'expired';
  end if;

  select * into v_target_plan
  from public.kunthai_business_plans plan
  where plan.surface = v_subscription.surface and plan.plan_code = v_target_code and plan.active = true;

  v_renew_cost := case when v_target_interval = 'yearly'
    then coalesce(v_target_plan.yearly_credit_cost, v_target_plan.credit_cost * 10)
    else v_target_plan.credit_cost end;
  v_renew_duration := case when v_target_interval = 'yearly'
    then coalesce(v_target_plan.yearly_duration_days, 365)
    else v_target_plan.duration_days end;

  begin
    perform public.kunthai_debit_subscription_credits(
      v_subscription.payer_user_id,
      v_renew_cost,
      v_subscription.surface,
      v_subscription.id,
      jsonb_build_object('kind', 'renewal', 'plan', v_target_code, 'interval', v_target_interval)
    );

    update public.kunthai_business_subscriptions
    set plan_code = v_target_code,
        status = 'active',
        pending_plan_code = null,
        pending_billing_interval = null,
        billing_interval = v_target_interval,
        current_period_start = v_now,
        current_period_end = v_now + make_interval(days => v_renew_duration),
        grace_ends_at = v_now + make_interval(days => v_renew_duration + v_target_plan.grace_days),
        operator_pack_count = case when v_target_code = 'premium' then operator_pack_count else 0 end,
        reminder_7_sent = false,
        reminder_3_sent = false,
        reminder_1_sent = false,
        grace_notice_sent = false,
        updated_at = v_now
    where id = v_subscription.id;

    insert into public.kunthai_business_subscription_events (
      subscription_id, event_type, from_plan_code, to_plan_code, credits, actor_user_id
    ) values (
      v_subscription.id, 'renewed', v_subscription.plan_code, v_target_code,
      v_renew_cost, v_subscription.payer_user_id
    );
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':renewed:' || v_now::date::text,
      format('%s %s plan renewed successfully for %s Visibility Credits.',
        v_business_name, initcap(v_target_code), v_renew_cost),
      'normal'
    );
    return 'renewed';
  exception when raise_exception then
    if v_now <= v_grace_end then
      update public.kunthai_business_subscriptions
      set status = 'grace', grace_ends_at = v_grace_end, updated_at = v_now
      where id = v_subscription.id;
      if not v_subscription.grace_notice_sent then
        perform public.kunthai_subscription_notify(
          v_subscription.payer_user_id,
          'business-subscription:' || v_subscription.id::text || ':credit-grace:' || v_grace_end::date::text,
          format('%s could not renew because the Visibility Credit balance is too low. You have until %s to add credits.',
            v_business_name, to_char(v_grace_end, 'Mon DD')),
          'high'
        );
        update public.kunthai_business_subscriptions set grace_notice_sent = true where id = v_subscription.id;
      end if;
      return 'grace';
    end if;

    update public.kunthai_business_subscriptions
    set plan_code = 'free', status = 'expired', pending_plan_code = null,
        pending_billing_interval = null, billing_interval = 'monthly',
        auto_renew = false, current_period_start = null, current_period_end = null,
        grace_ends_at = null, operator_pack_count = 0, updated_at = v_now
    where id = v_subscription.id;
    insert into public.kunthai_business_subscription_events (
      subscription_id, event_type, from_plan_code, to_plan_code, actor_user_id,
      metadata
    ) values (
      v_subscription.id, 'renewal_failed_to_free', v_subscription.plan_code, 'free',
      v_subscription.payer_user_id, jsonb_build_object('reason', 'insufficient_credits')
    );
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':credit-expired:' || v_now::date::text,
      format('%s moved to Free after the renewal grace period. Existing resources were preserved.', v_business_name),
      'high'
    );
    return 'expired';
  end;
end;
$$;

revoke all on function public.kunthai_renew_subscription_row(uuid) from public, anon, authenticated;
