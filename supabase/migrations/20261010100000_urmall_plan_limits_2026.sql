-- UrMall plan limits (owner decision, 2026-10-10). UrRide plans are unchanged.
--
--   Free     5 active products, meals or properties (every business kind:
--            Shop, Vendor, Restaurant, Real Estate). A restaurant may serve
--            meals on at most 5 days of the week.
--   Pro      up to 30 (price unchanged: 30 credits / 30 days, 300 / year).
--   Premium  unlimited, 100 Visibility Credits / 30 days or 1000 / year
--            (was 75 / 750).
--
-- Existing sellers are never deleted or hidden by this change:
--   * Listings already published stay published. The capacity guards only
--     refuse a NEW listing (or re-publishing a draft / unpublished property)
--     while a business is at or above its limit, so a Free seller with more
--     than 5 keeps them all and can add again once under 5 or after upgrading.
--   * Restaurants already serving meals on 6 or 7 days keep those meals and
--     days. On Free they cannot add a day the restaurant does not already
--     use, and a new or changed meal may cover at most 5 days.
--   * The expiry/retention rules (20260905130000) do not read product_limit:
--     a business is only narrowed to its ten retained listings after a PAID
--     plan expires, exactly as before. Lowering the Free limit hides nothing.
--   * Premium subscribers keep the period they already paid for. Renewals
--     read the catalogue price, so the new price applies from the next
--     renewal. Credit for an unused Premium period (when switching monthly to
--     yearly) is valued at the price actually paid for that period.
--
-- Re-runnable: every statement is idempotent and the data changes only touch
-- the six UrMall plan rows.
begin;

-- ---------------------------------------------------------------------------
-- 1. Plan catalogue
-- ---------------------------------------------------------------------------

alter table public.kunthai_business_plans
  add column if not exists meal_day_limit integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kunthai_business_plans_meal_day_limit_check'
      and conrelid = 'public.kunthai_business_plans'::regclass
  ) then
    alter table public.kunthai_business_plans
      add constraint kunthai_business_plans_meal_day_limit_check
      check (meal_day_limit is null or meal_day_limit between 1 and 7);
  end if;
end $$;

comment on column public.kunthai_business_plans.meal_day_limit is
  'UrMall restaurants: the most weekdays a restaurant may serve meals on. Null means all 7.';

-- The Premium price paid for a period that was already running when the
-- price changed. Used only to value unused paid time; renewals always use
-- the catalogue price.
create table if not exists public.kunthai_business_plan_price_locks (
  subscription_id uuid primary key references public.kunthai_business_subscriptions(id) on delete cascade,
  plan_code text not null,
  credit_cost integer not null check (credit_cost >= 0),
  yearly_credit_cost integer check (yearly_credit_cost is null or yearly_credit_cost >= 0),
  current_period_end timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.kunthai_business_plan_price_locks enable row level security;
revoke all on public.kunthai_business_plan_price_locks from public, anon, authenticated;

-- Record the old price for running Premium periods BEFORE the catalogue
-- changes. On a re-run the catalogue already holds the new price, so nothing
-- further is recorded.
insert into public.kunthai_business_plan_price_locks (
  subscription_id, plan_code, credit_cost, yearly_credit_cost, current_period_end
)
select subscription.id, subscription.plan_code, plan.credit_cost, plan.yearly_credit_cost, subscription.current_period_end
from public.kunthai_business_subscriptions subscription
join public.kunthai_business_plans plan
  on plan.surface = subscription.surface and plan.plan_code = subscription.plan_code
where subscription.surface = 'urmall'
  and subscription.plan_code = 'premium'
  and subscription.status in ('active', 'grace')
  and subscription.current_period_end > timezone('utc', now())
  and (plan.credit_cost <> 100 or plan.yearly_credit_cost is distinct from 1000)
on conflict (subscription_id) do nothing;

-- Tell running Premium subscribers before their next renewal. Deduplicated
-- by group key, so a re-run sends nothing new.
do $$
declare
  v_row record;
begin
  if to_regprocedure('public.kunthai_subscription_notify(uuid, text, text, text)') is null then
    return;
  end if;
  for v_row in
    select lock_row.subscription_id, subscription.payer_user_id, subscription.current_period_end,
      coalesce(nullif(business.business_name, ''), 'Your UrMall business') as business_name
    from public.kunthai_business_plan_price_locks lock_row
    join public.kunthai_business_subscriptions subscription on subscription.id = lock_row.subscription_id
    left join public.marketplace_businesses business on business.id = subscription.marketplace_business_id
    where lock_row.plan_code = 'premium'
      and subscription.plan_code = 'premium'
      and subscription.current_period_end = lock_row.current_period_end
      and coalesce(subscription.pending_plan_code, 'premium') = 'premium'
  loop
    perform public.kunthai_subscription_notify(
      v_row.payer_user_id,
      'business-subscription:' || v_row.subscription_id::text || ':premium-price-2026-10',
      format('%s: the UrMall Premium price is now 100 Visibility Credits a month or 1000 a year. Your current paid period is not affected; the new price applies from your next renewal on %s.',
        v_row.business_name, to_char(v_row.current_period_end, 'Mon DD, YYYY')),
      'normal'
    );
  end loop;
end $$;

alter table public.kunthai_business_plans disable trigger user;

update public.kunthai_business_plans
set product_limit = 5,
    meal_day_limit = 5,
    features = '["5 active products, meals or properties","Restaurant meals on up to 5 days a week","Seller dashboard","Customer messages","Store analytics"]'::jsonb,
    updated_at = timezone('utc', now())
where surface = 'urmall' and plan_code = 'free';

update public.kunthai_business_plans
set product_limit = 30,
    meal_day_limit = null,
    features = '["Up to 30 active products, meals or properties","Restaurant meals all 7 days","1 business admin","Advanced product insights","Priority store tools"]'::jsonb,
    updated_at = timezone('utc', now())
where surface = 'urmall' and plan_code = 'pro';

update public.kunthai_business_plans
set product_limit = null,
    meal_day_limit = null,
    credit_cost = 100,
    yearly_credit_cost = 1000,
    features = '["Unlimited active products, meals or properties","Restaurant meals all 7 days","Up to 5 business admins","Full business insights","Premium store tools"]'::jsonb,
    updated_at = timezone('utc', now())
where surface = 'urmall' and plan_code = 'premium';

alter table public.kunthai_business_plans enable trigger user;

-- ---------------------------------------------------------------------------
-- 2. Product capacity: one count for every business kind
-- ---------------------------------------------------------------------------
-- kunthai_guard_urmall_inventory_capacity (20260905130000) counts every
-- listing that holds a plan place through kunthai_urmall_retention_inventory:
-- shop and vendor products that are not drafts / pending review, restaurant
-- meals, and published properties. Re-assert its three triggers so every kind
-- is guarded even where an older trigger definition is still installed.
drop trigger if exists kunthai_guard_urmall_product_capacity on public.marketplace_products;
create trigger kunthai_guard_urmall_product_capacity before insert or update of business_id, status
on public.marketplace_products for each row execute function public.kunthai_guard_urmall_inventory_capacity();
drop trigger if exists kunthai_guard_urmall_meal_capacity on public.marketplace_restaurant_menu_items;
create trigger kunthai_guard_urmall_meal_capacity before insert or update of business_id
on public.marketplace_restaurant_menu_items for each row execute function public.kunthai_guard_urmall_inventory_capacity();
drop trigger if exists kunthai_guard_urmall_property_capacity on public.marketplace_property_listings;
create trigger kunthai_guard_urmall_property_capacity before insert or update of business_id, published
on public.marketplace_property_listings for each row execute function public.kunthai_guard_urmall_inventory_capacity();

-- ---------------------------------------------------------------------------
-- 3. Restaurant meal days
-- ---------------------------------------------------------------------------
-- A meal is served on every weekday when available_everyday is on, otherwise
-- on its available_days, falling back to the legacy day_of_week for rows
-- saved before multi-day availability (the same rule as the app's
-- menuItemServedOnDay). The days a restaurant "uses" are the union over all
-- of its meals, shown or hidden, so pausing and re-showing a meal never trips
-- the limit and a grandfathered restaurant keeps every day it already has.
create or replace function public.kunthai_urmall_meal_days(
  p_everyday boolean,
  p_days smallint[],
  p_day_of_week smallint
)
returns smallint[]
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_everyday, false) then array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    when coalesce(cardinality(p_days), 0) > 0 then array(
      select distinct day from unnest(p_days) day
      where day between 0 and 6 order by day)::smallint[]
    when p_day_of_week between 0 and 6 then array[p_day_of_week]::smallint[]
    else '{}'::smallint[]
  end
$$;

create or replace function public.kunthai_guard_urmall_meal_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_days smallint[];
  v_old_days smallint[] := '{}';
  v_other_days smallint[];
  v_after smallint[];
  v_entitlement record;
  v_limit integer;
begin
  v_new_days := public.kunthai_urmall_meal_days(new.available_everyday, new.available_days, new.day_of_week);
  if tg_op = 'UPDATE' and new.business_id is not distinct from old.business_id then
    v_old_days := public.kunthai_urmall_meal_days(old.available_everyday, old.available_days, old.day_of_week);
  end if;
  -- Unchanged or fewer days: nothing new is added to the meal or the
  -- restaurant, so existing (grandfathered) days always stay editable.
  if v_new_days <@ v_old_days then
    return new;
  end if;

  -- Same lock order as the product capacity guard and renewals; the advisory
  -- lock also serialises restaurants without a subscription row.
  perform 1 from public.kunthai_business_subscriptions
  where surface = 'urmall' and marketplace_business_id = new.business_id for update;
  perform pg_advisory_xact_lock(hashtextextended('urmall-meal-days:' || new.business_id::text, 0));

  select * into v_entitlement from public.kunthai_business_effective_entitlement('urmall', new.business_id);
  select plan.meal_day_limit into v_limit
  from public.kunthai_business_plans plan
  where plan.surface = 'urmall' and plan.plan_code = coalesce(v_entitlement.plan_code, 'free');
  if v_limit is null or v_limit >= 7 then
    return new;
  end if;

  if cardinality(v_new_days) > v_limit then
    raise exception 'KUNTHAI_PLAN_LIMIT|urmall|meal_days|%|%|%',
      cardinality(v_new_days), v_limit, lower(coalesce(v_entitlement.plan_code, 'free'))
      using errcode = 'P0001',
        detail = format('On the %s plan a meal can be available on at most %s days of the week. Choose fewer days, or upgrade to Pro or Premium to serve meals all 7 days.',
          coalesce(v_entitlement.plan_name, 'Free'), v_limit),
        hint = 'Open Plans & capacity in the business dashboard to upgrade.';
  end if;

  select coalesce(array(
    select distinct day
    from public.marketplace_restaurant_menu_items meal
    cross join lateral unnest(public.kunthai_urmall_meal_days(meal.available_everyday, meal.available_days, meal.day_of_week)) day
    where meal.business_id = new.business_id and meal.id is distinct from new.id
    order by day), '{}'::smallint[])
  into v_other_days;

  v_after := array(select distinct day from unnest(v_other_days || v_new_days) day order by day);
  -- Over the limit only refuses days the restaurant does not already use.
  if cardinality(v_after) > v_limit and not (v_after <@ (v_other_days || v_old_days)) then
    raise exception 'KUNTHAI_PLAN_LIMIT|urmall|meal_days|%|%|%',
      cardinality(v_after), v_limit, lower(coalesce(v_entitlement.plan_code, 'free'))
      using errcode = 'P0001',
        detail = format('On the %s plan a restaurant can serve meals on at most %s days of the week. Use the days your menu already has, or upgrade to Pro or Premium to add more days.',
          coalesce(v_entitlement.plan_name, 'Free'), v_limit),
        hint = 'Open Plans & capacity in the business dashboard to upgrade.';
  end if;
  return new;
end;
$$;

revoke all on function public.kunthai_guard_urmall_meal_days() from public, anon, authenticated;
drop trigger if exists kunthai_guard_urmall_meal_days on public.marketplace_restaurant_menu_items;
create trigger kunthai_guard_urmall_meal_days
before insert or update of business_id, available_everyday, available_days, day_of_week
on public.marketplace_restaurant_menu_items
for each row execute function public.kunthai_guard_urmall_meal_days();

-- ---------------------------------------------------------------------------
-- 4. Fair credit for a running period after a price change
-- ---------------------------------------------------------------------------
-- The price paid for the subscription's CURRENT period: the locked price when
-- the period is the one that was running at the price change, otherwise the
-- catalogue price (which is what a renewal charges).
create or replace function public.kunthai_business_current_period_cost(
  p_subscription_id uuid,
  p_interval text default 'monthly'
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case when p_interval = 'yearly'
        then coalesce(lock_row.yearly_credit_cost, lock_row.credit_cost * 10)
        else lock_row.credit_cost end
     from public.kunthai_business_plan_price_locks lock_row
     join public.kunthai_business_subscriptions subscription on subscription.id = lock_row.subscription_id
     where lock_row.subscription_id = p_subscription_id
       and lock_row.plan_code = subscription.plan_code
       and lock_row.current_period_end = subscription.current_period_end),
    (select case when p_interval = 'yearly'
        then coalesce(plan.yearly_credit_cost, plan.credit_cost * 10)
        else plan.credit_cost end
     from public.kunthai_business_subscriptions subscription
     join public.kunthai_business_plans plan
       on plan.surface = subscription.surface and plan.plan_code = subscription.plan_code
     where subscription.id = p_subscription_id),
    0)
$$;

revoke all on function public.kunthai_business_current_period_cost(uuid, text) from public, anon, authenticated;

-- Latest definition: 20261007170000_business_plan_fairness.sql. Unchanged
-- except that the current plan's part is valued with
-- kunthai_business_current_period_cost (the price actually paid).
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
  v_current_cost integer := 0;
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
    v_current_cost := public.kunthai_business_current_period_cost(
      v_subscription.id, coalesce(v_subscription.billing_interval, 'monthly'));
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
        else v_target.credit_cost end
      - v_current_cost
    ) * v_remaining_ratio)::integer);
  else
    -- A new term (for example monthly -> yearly on the same plan): it starts
    -- now, and the unused part of the current term counts toward its price.
    v_period_start := v_now;
    v_period_end := v_now + make_interval(days => v_target_duration);
    v_charge := v_target_cost;
    if v_remaining_ratio > 0 then
      v_charge := greatest(0, v_target_cost - floor(v_current_cost * v_remaining_ratio)::integer);
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

-- ---------------------------------------------------------------------------
-- 5. Admin workspace: listings that use the plan, for every business kind
-- ---------------------------------------------------------------------------
-- admin_get_user_workspace_v2 (20261008160000) compares product_limit with
-- marketplace_products only, so a restaurant or real-estate business always
-- read 0. Add plan_listing_count (the number the capacity guard uses) to each
-- UrMall business and UrMall subscription usage. The original function is
-- kept under a new name and still does every permission check.
do $$
begin
  if to_regprocedure('public.admin_get_user_workspace_v2(uuid)') is not null
    and to_regprocedure('public.admin_get_user_workspace_v2_before_plan_limits_2026(uuid)') is null then
    alter function public.admin_get_user_workspace_v2(uuid) rename to admin_get_user_workspace_v2_before_plan_limits_2026;
  end if;
  if to_regprocedure('public.admin_get_user_workspace_v2_before_plan_limits_2026(uuid)') is not null then
    revoke all on function public.admin_get_user_workspace_v2_before_plan_limits_2026(uuid) from public, anon, authenticated;
  end if;
end $$;

create or replace function public.kunthai_urmall_plan_listing_count(p_business_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_business_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (
      select count(*)::integer from public.kunthai_urmall_retention_inventory inventory
      where inventory.business_id = p_business_id::uuid and inventory.eligible_to_keep)
    else null
  end
$$;

revoke all on function public.kunthai_urmall_plan_listing_count(text) from public, anon, authenticated;

do $wrapper$
begin
  if to_regprocedure('public.admin_get_user_workspace_v2_before_plan_limits_2026(uuid)') is null then
    return;
  end if;
  execute $sql$
    create or replace function public.admin_get_user_workspace_v2(target_user_id uuid)
    returns jsonb
    language plpgsql
    security definer
    stable
    set search_path = public, auth
    as $fn$
    declare
      v_result jsonb;
      v_items jsonb;
    begin
      v_result := public.admin_get_user_workspace_v2_before_plan_limits_2026(target_user_id);
      if v_result is null or jsonb_typeof(v_result) <> 'object' then
        return v_result;
      end if;

      if jsonb_typeof(v_result -> 'businesses') = 'array' then
        select coalesce(jsonb_agg(case when jsonb_typeof(entry.item) = 'object' and entry.item ? 'id'
            then entry.item || jsonb_build_object('plan_listing_count', public.kunthai_urmall_plan_listing_count(entry.item ->> 'id'))
            else entry.item end order by entry.position), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_result -> 'businesses') with ordinality as entry(item, position);
        v_result := jsonb_set(v_result, '{businesses}', v_items);
      end if;

      if jsonb_typeof(v_result -> 'subscriptions') = 'array' then
        select coalesce(jsonb_agg(case when jsonb_typeof(entry.item) = 'object' and entry.item ->> 'surface' = 'urmall'
            then jsonb_set(entry.item, '{usage}', coalesce(case when jsonb_typeof(entry.item -> 'usage') = 'object' then entry.item -> 'usage' end, '{}'::jsonb)
              || jsonb_build_object('plan_listing_count', public.kunthai_urmall_plan_listing_count(entry.item ->> 'entity_id')))
            else entry.item end order by entry.position), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_result -> 'subscriptions') with ordinality as entry(item, position);
        v_result := jsonb_set(v_result, '{subscriptions}', v_items);
      end if;

      return v_result;
    end;
    $fn$
  $sql$;
  execute 'revoke all on function public.admin_get_user_workspace_v2(uuid) from public, anon';
  execute 'grant execute on function public.admin_get_user_workspace_v2(uuid) to authenticated';
end
$wrapper$;

commit;
