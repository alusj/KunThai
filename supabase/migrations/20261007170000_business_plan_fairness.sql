-- Business plan fairness (2026-10-07 audit, high list).
--
-- 1. Changing plan in the middle of a paid term never throws the rest away:
--    an upgrade keeps the term (a yearly subscriber stays yearly) and costs
--    only the difference for the time left; a new term (for example monthly
--    to yearly) starts now with the unused part credited toward its price.
-- 2. Auto-renewing plans renew up to 75 minutes before they end (the new
--    term starts at the old end), so the hourly job never leaves a paid
--    UrMall business showing only ten listings while it waits to renew.

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

  -- What is left of the current paid period, in credits at the price paid
  -- for it. Changing plans never throws it away.
  if v_subscription.id is not null
    and v_subscription.plan_code <> 'free'
    and v_subscription.status in ('active', 'grace')
    and v_subscription.current_period_end > v_now then
    select * into v_current_plan
    from public.kunthai_business_plans plan
    where plan.surface = v_surface and plan.plan_code = v_subscription.plan_code;
    v_remaining_ratio := greatest(0, least(1,
      extract(epoch from (v_subscription.current_period_end - v_now))
      / greatest(1, extract(epoch from (v_subscription.current_period_end
          - coalesce(v_subscription.current_period_start, v_now))))
    ));
  end if;

  if v_remaining_ratio > 0 and v_target_rank > v_current_rank then
    -- Upgrade inside the paid term: keep the term (and its cadence, so a
    -- yearly subscriber stays yearly) and pay only the difference for the
    -- time left.
    v_interval := coalesce(v_subscription.billing_interval, 'monthly');
    v_period_start := coalesce(v_subscription.current_period_start, v_now);
    v_period_end := v_subscription.current_period_end;
    v_charge := greatest(1, ceil((
      case when v_interval = 'yearly'
        then coalesce(v_target.yearly_credit_cost, v_target.credit_cost * 10)
          - coalesce(v_current_plan.yearly_credit_cost, v_current_plan.credit_cost * 10)
        else v_target.credit_cost - coalesce(v_current_plan.credit_cost, 0) end
    ) * v_remaining_ratio)::integer);
  else
    -- A new term (for example monthly -> yearly on the same plan): it starts
    -- now, and the unused part of the current term counts toward its price.
    v_period_start := v_now;
    v_period_end := v_now + make_interval(days => v_target_duration);
    v_charge := v_target_cost;
    if v_remaining_ratio > 0 then
      v_charge := greatest(0, v_target_cost - floor((
        case when coalesce(v_subscription.billing_interval, 'monthly') = 'yearly'
          then coalesce(v_current_plan.yearly_credit_cost, v_current_plan.credit_cost * 10)
          else coalesce(v_current_plan.credit_cost, 0) end
      ) * v_remaining_ratio)::integer);
    end if;
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

  if v_charge > 0 then perform public.kunthai_debit_subscription_credits(
    auth.uid(), v_charge, v_surface, v_subscription.id,
    jsonb_build_object('kind', 'plan_change', 'from_plan', v_from_plan, 'to_plan', v_target_code, 'interval', v_interval)
  ); end if;

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

-- Renews an auto-renewing paid plan shortly before it ends. The new term
-- starts exactly at the old end, so no paid time is lost or added. With too
-- few credits nothing happens here; the regular renewal at the end applies
-- the grace period as before.
create or replace function public.kunthai_try_early_subscription_renewal(p_subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_target_plan public.kunthai_business_plans%rowtype;
  v_target_code text;
  v_target_interval text;
  v_cost integer;
  v_duration integer;
  v_now timestamptz := timezone('utc', now());
  v_start timestamptz;
begin
  select * into v_subscription from public.kunthai_business_subscriptions
  where id = p_subscription_id for update;
  if v_subscription.id is null or v_subscription.plan_code = 'free'
    or not coalesce(v_subscription.auto_renew, false)
    or v_subscription.status <> 'active'
    or v_subscription.current_period_end is null
    or v_subscription.current_period_end <= v_now
    or v_subscription.current_period_end > v_now + interval '75 minutes' then
    return false;
  end if;

  v_target_code := coalesce(v_subscription.pending_plan_code, v_subscription.plan_code);
  if v_target_code = 'free' then return false; end if;
  v_target_interval := coalesce(v_subscription.pending_billing_interval, v_subscription.billing_interval, 'monthly');

  select * into v_target_plan from public.kunthai_business_plans plan
  where plan.surface = v_subscription.surface and plan.plan_code = v_target_code and plan.active = true;
  if v_target_plan.plan_code is null then return false; end if;

  v_cost := case when v_target_interval = 'yearly'
    then coalesce(v_target_plan.yearly_credit_cost, v_target_plan.credit_cost * 10)
    else v_target_plan.credit_cost end;
  v_duration := case when v_target_interval = 'yearly'
    then coalesce(v_target_plan.yearly_duration_days, 365)
    else v_target_plan.duration_days end;
  if v_duration is null or v_duration <= 0 then return false; end if;

  begin
    perform public.kunthai_debit_subscription_credits(
      v_subscription.payer_user_id, v_cost, v_subscription.surface, v_subscription.id,
      jsonb_build_object('kind', 'renewal', 'plan', v_target_code, 'interval', v_target_interval, 'early', true)
    );
  exception when raise_exception then
    return false;
  end;

  v_start := v_subscription.current_period_end;
  update public.kunthai_business_subscriptions
  set plan_code = v_target_code,
      status = 'active',
      pending_plan_code = null,
      pending_billing_interval = null,
      billing_interval = v_target_interval,
      current_period_start = v_start,
      current_period_end = v_start + make_interval(days => v_duration),
      grace_ends_at = v_start + make_interval(days => v_duration + coalesce(v_target_plan.grace_days, 7)),
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
    v_subscription.id, 'renewed', v_subscription.plan_code, v_target_code, v_cost, v_subscription.payer_user_id
  );
  return true;
end;
$$;

revoke all on function public.kunthai_try_early_subscription_renewal(uuid) from public, anon, authenticated;

create or replace function public.process_kunthai_business_subscriptions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_result text;
  v_checked integer := 0;
  v_reminders integer := 0;
  v_renewed integer := 0;
  v_grace integer := 0;
  v_expired integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  for v_row in
    select subscription.id
    from public.kunthai_business_subscriptions subscription
    where subscription.plan_code <> 'free'
      and subscription.status in ('active', 'grace')
      and subscription.current_period_end is not null
    order by subscription.current_period_end
  loop
    v_checked := v_checked + 1;
    v_reminders := v_reminders + public.kunthai_send_subscription_reminders(v_row.id);
    -- Auto-renewing plans renew up to 75 minutes before they end, so an
    -- hourly run never leaves a paid business on Free limits (UrMall showed
    -- only the newest ten listings until the late renewal).
    if public.kunthai_try_early_subscription_renewal(v_row.id) then
      v_renewed := v_renewed + 1;
      continue;
    end if;
    v_result := public.kunthai_renew_subscription_row(v_row.id);
    if v_result = 'renewed' then v_renewed := v_renewed + 1; end if;
    if v_result = 'grace' then v_grace := v_grace + 1; end if;
    if v_result = 'expired' then v_expired := v_expired + 1; end if;
  end loop;

  return jsonb_build_object(
    'checked', v_checked,
    'reminders', v_reminders,
    'renewed', v_renewed,
    'grace', v_grace,
    'expired', v_expired
  );
end;
$$;

revoke all on function public.process_kunthai_business_subscriptions() from public, anon, authenticated;
grant execute on function public.process_kunthai_business_subscriptions() to service_role;
