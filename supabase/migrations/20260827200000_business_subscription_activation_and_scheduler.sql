-- Make UrMall and UrRide Visibility Credit plans operational for every
-- business: explicit Free baselines, cadence-aware reminders, durable unified
-- notifications, and an hourly renewal scheduler.
--
-- This migration is additive and must run after:
--   20260822090000_business_subscription_yearly_billing.sql
--   20260827120000_unified_notifications_admin_supervision.sql

-- ---------------------------------------------------------------------------
-- Every existing and future business/company starts on an explicit Free plan.
-- Capacity guards already use the effective Free entitlement when a row is
-- absent; materialising the row makes billing state auditable and consistent.
-- ---------------------------------------------------------------------------

create or replace function public.kunthai_create_free_business_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'marketplace_businesses' then
    insert into public.kunthai_business_subscriptions (
      surface, marketplace_business_id, plan_code, status, auto_renew,
      payer_user_id, billing_interval
    ) values (
      'urmall', new.id, 'free', 'active', false, new.user_id, 'monthly'
    )
    on conflict do nothing;
  elsif tg_table_name = 'transport_companies' then
    insert into public.kunthai_business_subscriptions (
      surface, transport_company_id, plan_code, status, auto_renew,
      payer_user_id, billing_interval
    ) values (
      'urride', new.id, 'free', 'active', false, new.owner_user_id, 'monthly'
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.kunthai_create_free_business_subscription() from public, anon, authenticated;

drop trigger if exists kunthai_marketplace_business_free_subscription on public.marketplace_businesses;
create trigger kunthai_marketplace_business_free_subscription
after insert on public.marketplace_businesses
for each row execute function public.kunthai_create_free_business_subscription();

drop trigger if exists kunthai_transport_company_free_subscription on public.transport_companies;
create trigger kunthai_transport_company_free_subscription
after insert on public.transport_companies
for each row execute function public.kunthai_create_free_business_subscription();

insert into public.kunthai_business_subscriptions (
  surface, marketplace_business_id, plan_code, status, auto_renew,
  payer_user_id, billing_interval
)
select 'urmall', business.id, 'free', 'active', false, business.user_id, 'monthly'
from public.marketplace_businesses business
where not exists (
  select 1 from public.kunthai_business_subscriptions subscription
  where subscription.surface = 'urmall'
    and subscription.marketplace_business_id = business.id
)
on conflict do nothing;

insert into public.kunthai_business_subscriptions (
  surface, transport_company_id, plan_code, status, auto_renew,
  payer_user_id, billing_interval
)
select 'urride', company.id, 'free', 'active', false, company.owner_user_id, 'monthly'
from public.transport_companies company
where not exists (
  select 1 from public.kunthai_business_subscriptions subscription
  where subscription.surface = 'urride'
    and subscription.transport_company_id = company.id
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Subscription notices use the unified notification panel. The helper never
-- lets a notification delivery problem roll back a successful credit debit or
-- plan renewal; the legacy Explore inbox remains a safe fallback.
-- ---------------------------------------------------------------------------

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
declare
  v_subscription_id uuid;
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_sector text := 'platform';
  v_workspace text := 'platform';
  v_workspace_id uuid;
  v_action_target text;
  v_title text := 'Business plan update';
  v_priority text := case
    when lower(coalesce(p_priority, 'normal')) in ('low','normal','high','urgent','critical')
      then lower(coalesce(p_priority, 'normal'))
    else 'normal'
  end;
begin
  if p_user_id is null or btrim(coalesce(p_message, '')) = '' then
    return;
  end if;

  begin
    v_subscription_id := nullif(
      substring(coalesce(p_group_key, '') from '^business-subscription:([0-9a-fA-F-]{36})'),
      ''
    )::uuid;
  exception when invalid_text_representation then
    v_subscription_id := null;
  end;

  if v_subscription_id is not null then
    select * into v_subscription
    from public.kunthai_business_subscriptions subscription
    where subscription.id = v_subscription_id;

    if v_subscription.surface = 'urmall' then
      v_sector := 'marketplace';
      v_workspace := 'marketplace';
      v_workspace_id := v_subscription.marketplace_business_id;
      v_action_target := 'urmall:business';
    elsif v_subscription.surface = 'urride' then
      v_sector := 'transport';
      v_workspace := 'transport';
      v_workspace_id := v_subscription.transport_company_id;
      v_action_target := 'urride:plans';
    end if;
  end if;

  v_title := case
    when p_message ilike '%operator spaces%' then 'Operator capacity added'
    when p_message ilike '%scheduled%' then 'Plan change scheduled'
    when p_message ilike '%renewed successfully%' then 'Plan renewed'
    when p_message ilike '%is active%' or p_message ilike '%activated%' then 'Plan activated'
    when p_message ilike '%could not renew%' or p_message ilike '%too low%' then 'Renewal needs credits'
    when p_message ilike '%is now on the Free%' or p_message ilike '%moved to Free%' then 'Plan changed to Free'
    when p_message ilike '%grace%' then 'Plan renewal warning'
    else 'Upcoming plan renewal'
  end;

  begin
    if to_regclass('public.platform_notifications') is not null then
      insert into public.platform_notifications (
        user_id, sector, notification_type, title, body, priority, status,
        category, workspace, workspace_id, action_target, action_data,
        channels, presentation, dedupe_key
      ) values (
        p_user_id, v_sector, 'business_subscription', v_title, p_message,
        v_priority, 'unread', 'payment', v_workspace, v_workspace_id,
        v_action_target,
        jsonb_build_object(
          'subscriptionId', v_subscription_id,
          'surface', nullif(v_subscription.surface, '')
        ),
        array['in_app']::text[],
        case when v_priority in ('high','urgent','critical') then 'floating' else 'inbox' end,
        nullif(p_group_key, '')
      )
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      return;
    end if;
  exception when others then
    -- A notification must never make a successful plan transaction fail.
    null;
  end;

  begin
    if to_regclass('public.explore_notifications') is not null and not exists (
      select 1 from public.explore_notifications notification
      where notification.user_id = p_user_id
        and notification.group_key = p_group_key
    ) then
      insert into public.explore_notifications (
        user_id, actor_name, type, media_type, message, priority, category, group_key
      ) values (
        p_user_id, 'KunThai Plans', 'system', 'subscription', p_message,
        v_priority, 'business', p_group_key
      );
    end if;
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.kunthai_subscription_notify(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cadence-aware 7/3/1-day notices. A late scheduler run sends only the most
-- relevant threshold, avoiding three stacked reminders at once. Low balances
-- are called out with the exact shortfall before renewal is attempted.
-- ---------------------------------------------------------------------------

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
  v_target_plan public.kunthai_business_plans%rowtype;
  v_business_name text := 'Your business';
  v_target_code text;
  v_target_interval text;
  v_wallet_balance integer := 0;
  v_cost integer := 0;
  v_shortfall integer := 0;
  v_days integer;
  v_notice_days integer;
  v_day_label text;
  v_message text;
  v_priority text := 'normal';
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

  v_days := greatest(1, ceil(extract(epoch from (
    v_subscription.current_period_end - timezone('utc', now())
  )) / 86400.0)::integer);

  if v_days <= 1 then
    if v_subscription.reminder_1_sent then return 0; end if;
    v_notice_days := 1;
  elsif v_days <= 3 then
    if v_subscription.reminder_3_sent then return 0; end if;
    v_notice_days := 3;
  elsif v_days <= 7 then
    if v_subscription.reminder_7_sent then return 0; end if;
    v_notice_days := 7;
  else
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

  v_target_code := coalesce(
    v_subscription.pending_plan_code,
    case when v_subscription.auto_renew then v_subscription.plan_code else 'free' end
  );
  v_target_interval := case when v_target_code = 'free' then 'monthly'
    else coalesce(v_subscription.pending_billing_interval, v_subscription.billing_interval, 'monthly') end;
  v_day_label := case when v_notice_days = 1 then 'within 24 hours' else format('in %s days', v_notice_days) end;

  if v_target_code = 'free' then
    v_message := format(
      '%s %s plan ends %s and will move to Free after the safety grace period. Nothing will be deleted.',
      v_business_name, initcap(v_subscription.plan_code), v_day_label
    );
    v_priority := case when v_notice_days <= 3 then 'high' else 'normal' end;
  else
    select * into v_target_plan
    from public.kunthai_business_plans plan
    where plan.surface = v_subscription.surface
      and plan.plan_code = v_target_code
      and plan.active = true;

    if v_target_plan.plan_code is null then return 0; end if;

    v_cost := case when v_target_interval = 'yearly'
      then coalesce(v_target_plan.yearly_credit_cost, v_target_plan.credit_cost * 10)
      else v_target_plan.credit_cost end;

    select coalesce(wallet.balance, 0) into v_wallet_balance
    from public.visibility_credit_wallets wallet
    where wallet.user_id = v_subscription.payer_user_id;
    v_shortfall := greatest(0, v_cost - coalesce(v_wallet_balance, 0));

    v_message := format(
      '%s renews %s as the %s %s plan for %s Visibility Credits. Your wallet has %s.%s',
      v_business_name, v_day_label, initcap(v_target_code), initcap(v_target_interval),
      v_cost, coalesce(v_wallet_balance, 0),
      case when v_shortfall > 0
        then format(' Add at least %s more credits to avoid the grace period.', v_shortfall)
        else ' Your wallet is ready.' end
    );
    v_priority := case when v_shortfall > 0 or v_notice_days <= 3 then 'high' else 'normal' end;
  end if;

  perform public.kunthai_subscription_notify(
    v_subscription.payer_user_id,
    'business-subscription:' || v_subscription.id::text || ':' || v_notice_days::text || ':' || v_subscription.current_period_end::date::text,
    v_message,
    v_priority
  );

  update public.kunthai_business_subscriptions
  set reminder_7_sent = case when v_notice_days = 7 then true else reminder_7_sent end,
      reminder_3_sent = case when v_notice_days = 3 then true else reminder_3_sent end,
      reminder_1_sent = case when v_notice_days = 1 then true else reminder_1_sent end,
      updated_at = timezone('utc', now())
  where id = v_subscription.id;

  return 1;
end;
$$;

revoke all on function public.kunthai_send_subscription_reminders(uuid) from public, anon, authenticated;

-- Immediate plan changes and operator packs should appear in the same durable
-- notification system as renewals. Notification errors are intentionally
-- swallowed so the financial transaction remains authoritative.
create or replace function public.kunthai_notify_business_subscription_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_business_name text := 'Your business';
  v_user_id uuid;
  v_message text;
begin
  if new.event_type not in ('upgraded', 'activated', 'downgrade_scheduled', 'operator_pack_added') then
    return new;
  end if;

  select * into v_subscription
  from public.kunthai_business_subscriptions subscription
  where subscription.id = new.subscription_id;
  if v_subscription.id is null then return new; end if;

  v_user_id := coalesce(new.actor_user_id, v_subscription.payer_user_id);
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

  v_message := case new.event_type
    when 'downgrade_scheduled' then format(
      '%s change to the %s %s plan is scheduled for %s. Current capacity remains available and nothing will be deleted.',
      v_business_name, initcap(coalesce(new.to_plan_code, 'free')),
      initcap(coalesce(v_subscription.pending_billing_interval, 'monthly')),
      coalesce(to_char(v_subscription.current_period_end, 'Mon DD, YYYY'), 'the next renewal')
    )
    when 'operator_pack_added' then format(
      '%s added %s operator spaces for %s Visibility Credits. The spaces remain available through the current Premium period.',
      v_business_name, coalesce((new.metadata ->> 'operators_added')::integer, 10), new.credits
    )
    else format(
      '%s %s %s plan is active. %s Visibility Credits were paid and the new capacity is available now.',
      v_business_name, initcap(coalesce(new.to_plan_code, v_subscription.plan_code)),
      initcap(coalesce(v_subscription.billing_interval, 'monthly')), new.credits
    )
  end;

  begin
    perform public.kunthai_subscription_notify(
      v_user_id,
      'business-subscription:' || new.subscription_id::text || ':event:' || new.id::text,
      v_message,
      case when new.event_type in ('upgraded', 'activated', 'operator_pack_added') then 'high' else 'normal' end
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function public.kunthai_notify_business_subscription_event() from public, anon, authenticated;

drop trigger if exists kunthai_notify_business_subscription_event on public.kunthai_business_subscription_events;
create trigger kunthai_notify_business_subscription_event
after insert on public.kunthai_business_subscription_events
for each row execute function public.kunthai_notify_business_subscription_event();

-- ---------------------------------------------------------------------------
-- Automatic processing. Service-role calls remain supported, while pg_cron
-- may invoke the same function from its trusted postgres database session.
-- ---------------------------------------------------------------------------

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

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname = 'kunthai-business-subscription-renewals'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'kunthai-business-subscription-renewals',
  '0 * * * *',
  'select public.process_kunthai_business_subscriptions()'
);
