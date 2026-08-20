-- Scheduled renewal, grace handling, and owner notifications for business
-- subscriptions. Renewal debits and period extension happen in one database
-- transaction; a failed debit leaves the subscription in grace, never in a
-- partially renewed state.

create or replace function public.kunthai_subscription_notify(
  p_user_id uuid,
  p_group_key text,
  p_message text,
  p_priority text default 'normal'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or to_regclass('public.explore_notifications') is null then
    return;
  end if;

  if not exists (
    select 1 from public.explore_notifications notification
    where notification.user_id = p_user_id and notification.group_key = p_group_key
  ) then
    insert into public.explore_notifications (
      user_id, actor_name, type, media_type, message, priority, category, group_key
    ) values (
      p_user_id, 'KunThai Plans', 'system', 'subscription', p_message,
      coalesce(nullif(p_priority, ''), 'normal'), 'business', p_group_key
    );
  end if;
end;
$$;

revoke all on function public.kunthai_subscription_notify(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.kunthai_send_subscription_reminders(
  p_subscription_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_business_name text := 'Your business';
  v_sent integer := 0;
  v_days integer;
begin
  select * into v_subscription
  from public.kunthai_business_subscriptions subscription
  where subscription.id = p_subscription_id
  for update;

  if v_subscription.id is null or v_subscription.plan_code = 'free'
    or v_subscription.current_period_end is null
    or v_subscription.current_period_end <= timezone('utc', now()) then
    return 0;
  end if;

  if v_subscription.surface = 'urmall' then
    select coalesce(nullif(business.business_name, ''), 'Your UrMall business')
    into v_business_name
    from public.marketplace_businesses business
    where business.id = v_subscription.marketplace_business_id;
  else
    select coalesce(nullif(company.company_name, ''), 'Your UrRide company')
    into v_business_name
    from public.transport_companies company
    where company.id = v_subscription.transport_company_id;
  end if;

  v_days := greatest(1, ceil(extract(epoch from (
    v_subscription.current_period_end - timezone('utc', now())
  )) / 86400.0)::integer);

  if v_days <= 7 and not v_subscription.reminder_7_sent then
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':7:' || v_subscription.current_period_end::date::text,
      format('%s %s plan renews in 7 days for %s Visibility Credits. Make sure your wallet is ready.',
        v_business_name, initcap(v_subscription.plan_code),
        (select credit_cost from public.kunthai_business_plans where surface = v_subscription.surface and plan_code = coalesce(v_subscription.pending_plan_code, v_subscription.plan_code))),
      'normal'
    );
    update public.kunthai_business_subscriptions set reminder_7_sent = true where id = v_subscription.id;
    v_sent := v_sent + 1;
  end if;

  if v_days <= 3 and not v_subscription.reminder_3_sent then
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':3:' || v_subscription.current_period_end::date::text,
      format('%s plan renews in 3 days. Add enough Visibility Credits now to avoid entering the grace period.', v_business_name),
      'high'
    );
    update public.kunthai_business_subscriptions set reminder_3_sent = true where id = v_subscription.id;
    v_sent := v_sent + 1;
  end if;

  if v_days <= 1 and not v_subscription.reminder_1_sent then
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':1:' || v_subscription.current_period_end::date::text,
      format('%s plan renews within 24 hours. Check your Visibility Credit balance.', v_business_name),
      'high'
    );
    update public.kunthai_business_subscriptions set reminder_1_sent = true where id = v_subscription.id;
    v_sent := v_sent + 1;
  end if;

  return v_sent;
end;
$$;

revoke all on function public.kunthai_send_subscription_reminders(uuid) from public, anon, authenticated;

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

  begin
    perform public.kunthai_debit_subscription_credits(
      v_subscription.payer_user_id,
      v_target_plan.credit_cost,
      v_subscription.surface,
      v_subscription.id,
      jsonb_build_object('kind', 'renewal', 'plan', v_target_code)
    );

    update public.kunthai_business_subscriptions
    set plan_code = v_target_code,
        status = 'active',
        pending_plan_code = null,
        current_period_start = v_now,
        current_period_end = v_now + make_interval(days => v_target_plan.duration_days),
        grace_ends_at = v_now + make_interval(days => v_target_plan.duration_days + v_target_plan.grace_days),
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
      v_target_plan.credit_cost, v_subscription.payer_user_id
    );
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':renewed:' || v_now::date::text,
      format('%s %s plan renewed successfully for %s Visibility Credits.',
        v_business_name, initcap(v_target_code), v_target_plan.credit_cost),
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

create or replace function public.sync_kunthai_business_subscription(
  p_surface text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription_id uuid;
begin
  if not public.kunthai_business_user_can_manage(p_surface, p_entity_id, auth.uid(), true) then
    raise exception 'Only the owner or a billing administrator can manage this plan.';
  end if;

  select subscription.id into v_subscription_id
  from public.kunthai_business_subscriptions subscription
  where subscription.surface = lower(p_surface)
    and coalesce(subscription.marketplace_business_id, subscription.transport_company_id) = p_entity_id;

  if v_subscription_id is not null then
    perform public.kunthai_send_subscription_reminders(v_subscription_id);
    perform public.kunthai_renew_subscription_row(v_subscription_id);
  end if;

  return public.get_kunthai_business_subscription(lower(p_surface), p_entity_id);
end;
$$;

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
  if coalesce(auth.role(), '') <> 'service_role' then
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
grant execute on function public.sync_kunthai_business_subscription(text, uuid) to authenticated;
grant execute on function public.process_kunthai_business_subscriptions() to service_role;

