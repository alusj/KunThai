-- Churn intelligence, Phase 2: features, rule-based risk scores, segments.
-- Plan: docs/2026-11-06-churn-intelligence-plan.md (§3)
-- Builds on 20261106131000_churn_activity_layer.sql.
--
-- 1. churn_score_rules(): the rules, as one pure function (tested in supabase/tests/churn_score_rules.sql).
-- 2. churn_user_features: one row per eligible user × sector, rebuilt nightly.
--    It also holds the "most active" figures (active days, actions, growth).
-- 3. churn_scores: daily score history (status, segment, 0–100, reasons,
--    revenue at risk per currency, suggested action).
-- 4. churn_user_overall: one row per user across all sectors (latest day).
-- 5. churn_score_users(): builds 2 and 3; runs nightly right after the activity refresh.
--
-- Not scored: deactivated profiles, and suspended or banned accounts.
-- No client access to anything here.

-- 1. Rules -----------------------------------------------------------------

create or replace function public.churn_score_rules(p_product text, p_window integer, p_f jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_window integer := greatest(coalesce(p_window, 30), 1);
  v_half numeric := greatest(coalesce(p_window, 30), 1) / 2.0;
  v_days_inactive integer := coalesce((p_f->>'days_inactive')::integer, v_window);
  v_days_since_action integer := coalesce((p_f->>'days_since_action')::integer, v_window);
  v_days_since_open integer := (p_f->>'days_since_open')::integer;
  v_tenure integer := coalesce((p_f->>'product_tenure_days')::integer, 0);
  v_active_14 integer := coalesce((p_f->>'active_days_14')::integer, 0);
  v_active_30 integer := coalesce((p_f->>'active_days_30')::integer, 0);
  v_prior_30 integer := coalesce((p_f->>'prior_active_days_30')::integer, 0);
  v_habit_weeks integer := coalesce((p_f->>'habit_weeks_prior')::integer, 0);
  v_spend_30 numeric := coalesce((p_f->>'spend_30')::numeric, 0);
  v_prior_spend numeric := coalesce((p_f->>'prior_spend_30')::numeric, 0);
  v_complaints integer := coalesce((p_f->>'complaints_30')::integer, 0);
  v_bad integer := coalesce((p_f->>'bad_experiences_30')::integer, 0);
  v_unanswered integer := coalesce((p_f->>'unanswered_48h')::integer, 0);
  v_push boolean := coalesce((p_f->>'push_enabled')::boolean, false);
  v_opens_days integer := coalesce((p_f->>'opens_tracking_days')::integer, 0);
  v_plan_status text := p_f->>'plan_status';
  v_days_to_renewal integer := (p_f->>'days_to_renewal')::integer;
  v_auto_renew boolean := coalesce((p_f->>'auto_renew')::boolean, true);
  v_downgrade boolean := coalesce((p_f->>'downgrade_pending')::boolean, false);
  v_tracks_opens boolean := p_product in ('explore', 'swip', 'urmall_buyer', 'urmall_seller', 'urride_passenger', 'urride_operator');
  v_score integer := 0;
  v_signals jsonb := '[]'::jsonb;
  v_churned boolean := false;
  v_status text;
  v_segment text;
  v_action text;
begin
  if p_product = 'business_plan' then
    v_churned := coalesce(v_plan_status in ('expired', 'cancelled', 'free'), false)
      or (v_days_to_renewal is not null and v_days_to_renewal < 0 and v_plan_status is distinct from 'grace');

    -- In grace means a renewal was already missed: at risk on its own.
    if v_plan_status = 'grace' then
      v_score := v_score + 60;
      v_signals := v_signals || jsonb_build_object('key', 'plan_in_grace', 'points', 60, 'detail', 'Plan is in its grace period');
    end if;
    if not v_auto_renew and v_days_to_renewal between 0 and 14 then
      v_score := v_score + 40;
      v_signals := v_signals || jsonb_build_object('key', 'renewal_off', 'points', 40,
        'detail', format('Auto-renew is off and the plan ends in %s days', v_days_to_renewal));
    end if;
    if v_downgrade then
      v_score := v_score + 20;
      v_signals := v_signals || jsonb_build_object('key', 'downgrade_pending', 'points', 20, 'detail', 'A plan change is scheduled');
    end if;
  else
    v_churned := v_days_inactive >= v_window;

    if v_days_inactive > v_half then
      v_score := v_score + 30;
      v_signals := v_signals || jsonb_build_object('key', 'inactive', 'points', 30,
        'detail', format('%s days without activity (churn at %s)', v_days_inactive, v_window));
    end if;
    -- Opens only: still opening but no longer acting. It needs open data that covers
    -- at least half the window, otherwise every browser would look like this.
    if p_product in ('urmall_buyer', 'urmall_seller', 'urride_passenger', 'urride_operator')
       and v_opens_days >= v_half
       and v_days_since_open is not null and v_days_since_open <= v_half
       and v_days_since_action > v_half then
      v_score := v_score + 20;
      v_signals := v_signals || jsonb_build_object('key', 'opens_only', 'points', 20,
        'detail', format('Still opens it, but no order, booking or reply for %s days', v_days_since_action));
    end if;
    if v_prior_30 >= 3 and v_active_30 <= floor(v_prior_30 * 0.4) then
      v_score := v_score + 25;
      v_signals := v_signals || jsonb_build_object('key', 'usage_drop', 'points', 25,
        'detail', format('Active %s days in the last 30, down from %s', v_active_30, v_prior_30));
    end if;
    if v_prior_spend > 0 and v_spend_30 <= v_prior_spend * 0.5 then
      v_score := v_score + 15;
      v_signals := v_signals || jsonb_build_object('key', 'spend_drop', 'points', 15,
        'detail', 'Spend in the last 30 days is half or less of the 30 before');
    end if;
    if v_habit_weeks >= 4 and v_active_14 = 0 then
      v_score := v_score + 15;
      v_signals := v_signals || jsonb_build_object('key', 'habit_stopped', 'points', 15,
        'detail', format('Was active %s weeks of the 2 months before, nothing in the last 14 days', v_habit_weeks));
    end if;
    if p_product = 'urmall_seller' and v_unanswered > 0 then
      v_score := v_score + 15;
      v_signals := v_signals || jsonb_build_object('key', 'unanswered_customers', 'points', 15,
        'detail', format('%s customer conversations waiting over 48 hours', v_unanswered));
    end if;
  end if;

  if v_complaints > 0 then
    v_score := v_score + 10;
    v_signals := v_signals || jsonb_build_object('key', 'complaint', 'points', 10,
      'detail', format('%s complaints or reports in the last 30 days', v_complaints));
  end if;
  if v_bad > 0 then
    v_score := v_score + 10;
    v_signals := v_signals || jsonb_build_object('key', 'bad_experience', 'points', 10,
      'detail', format('%s cancelled or low-rated experiences in the last 30 days', v_bad));
  end if;
  if not v_push then
    v_score := v_score + 5;
    v_signals := v_signals || jsonb_build_object('key', 'push_off', 'points', 5, 'detail', 'Cannot be reached by push');
  end if;

  v_score := least(v_score, 100);

  v_status := case
    when v_churned then 'churned'
    when v_tenure < 30 then 'new'
    when v_score >= 60 then 'at_risk'
    else 'active'
  end;
  v_segment := case
    when v_status = 'churned' then 'churned'
    when v_status = 'new' then 'new'
    when v_score >= 60 then 'high'
    when v_score >= 40 then 'medium'
    else 'low'
  end;

  if v_status in ('at_risk', 'churned') or (v_status = 'new' and v_score >= 60) then
    v_action := case p_product
      when 'explore' then 'explore_comeback'
      when 'swip' then 'swip_creator_boost'
      when 'urmall_buyer' then 'urmall_cart_reminder'
      when 'urmall_seller' then case when v_unanswered > 0 then 'urmall_unanswered_nudge' else 'urmall_seller_checkin' end
      when 'urride_passenger' then 'urride_saved_places_reminder'
      when 'urride_operator' then 'urride_demand_alert'
      when 'business_plan' then case when v_plan_status = 'grace' then 'plan_grace_reminder' else 'plan_renewal_reminder' end
      when 'credits' then 'credits_boost_reminder'
    end;
  end if;

  -- Strongest reasons first.
  select coalesce(jsonb_agg(s order by (s->>'points')::integer desc), '[]'::jsonb)
  into v_signals
  from jsonb_array_elements(v_signals) s;

  return jsonb_build_object(
    'score', case when v_status = 'churned' then 100 else v_score end,
    'status', v_status,
    'segment', v_segment,
    'signals', v_signals,
    'action', v_action,
    -- Sectors that count opens are provisional until opens cover a full window.
    'provisional', v_tracks_opens and v_opens_days < v_window
  );
end;
$$;

revoke execute on function public.churn_score_rules(text, integer, jsonb) from public, anon, authenticated;

-- 2. Features --------------------------------------------------------------

create table if not exists public.churn_user_features (
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null references public.churn_product_settings(product) on update cascade,
  as_of date not null,
  country_iso text,
  product_since date,
  first_seen_day date,
  last_active_day date,
  last_action_day date,
  last_open_day date,
  days_inactive integer,
  days_since_action integer,
  days_since_open integer,
  product_tenure_days integer,
  active_days_7 integer not null default 0,
  active_days_14 integer not null default 0,
  active_days_30 integer not null default 0,
  prior_active_days_30 integer not null default 0,
  active_days_90 integer not null default 0,
  actions_7 integer not null default 0,
  actions_30 integer not null default 0,
  prior_actions_30 integer not null default 0,
  habit_weeks_prior integer not null default 0,
  main_currency text,
  spend_30 numeric(18, 3) not null default 0,
  prior_spend_30 numeric(18, 3) not null default 0,
  spend_90 jsonb not null default '{}'::jsonb,
  complaints_30 integer not null default 0,
  bad_experiences_30 integer not null default 0,
  unanswered_48h integer not null default 0,
  push_enabled boolean not null default false,
  plan_status text,
  days_to_renewal integer,
  auto_renew boolean,
  downgrade_pending boolean,
  credits_balance integer,
  opens_tracking_days integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (user_id, product)
);

create index if not exists churn_user_features_product_active_idx
  on public.churn_user_features (product, active_days_30 desc, actions_30 desc);
create index if not exists churn_user_features_country_idx
  on public.churn_user_features (country_iso, product);

-- 3. Score history -----------------------------------------------------------

create table if not exists public.churn_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null references public.churn_product_settings(product) on update cascade,
  scored_on date not null,
  country_iso text,
  status text not null check (status in ('new', 'active', 'at_risk', 'churned')),
  segment text not null check (segment in ('low', 'medium', 'high', 'churned', 'new')),
  score smallint not null check (score between 0 and 100),
  top_signals jsonb not null default '[]'::jsonb,
  revenue_at_risk jsonb not null default '{}'::jsonb,
  recommended_action text,
  provisional boolean not null default false,
  primary key (user_id, product, scored_on)
);

create index if not exists churn_scores_day_product_status_idx
  on public.churn_scores (scored_on desc, product, status);
create index if not exists churn_scores_day_country_idx
  on public.churn_scores (scored_on desc, country_iso);

-- 4. One row per user across sectors (latest scoring day) --------------------

create or replace view public.churn_user_overall as
with latest as (
  select max(scored_on) as scored_on from public.churn_scores
)
select
  s.user_id,
  s.scored_on,
  max(s.country_iso) as country_iso,
  count(*)::integer as sectors,
  count(*) filter (where s.status = 'churned')::integer as sectors_churned,
  count(*) filter (where s.status = 'at_risk')::integer as sectors_at_risk,
  case
    when count(*) filter (where s.status <> 'churned') = 0 then 'churned'
    when count(*) filter (where s.status = 'at_risk') > 0 then 'at_risk'
    when count(*) filter (where s.status = 'active') > 0 then 'active'
    else 'new'
  end as status,
  max(s.score) filter (where s.status <> 'churned') as highest_live_score,
  array_agg(s.product order by s.product) as products
from public.churn_scores s
join latest l on l.scored_on = s.scored_on
group by s.user_id, s.scored_on;

alter table public.churn_user_features enable row level security;
alter table public.churn_scores enable row level security;
revoke all on public.churn_user_features, public.churn_scores, public.churn_user_overall
  from public, anon, authenticated;

-- 5. Nightly scoring ---------------------------------------------------------

create or replace function public.churn_score_users(p_as_of date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_as_of date := coalesce(p_as_of, (now() at time zone 'utc')::date);
  v_as_of_end timestamptz;
  v_30_start timestamptz;
  v_features integer := 0;
  v_scores integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('public.churn_score_users'));
  v_as_of_end := (v_as_of + 1)::timestamp at time zone 'utc';
  v_30_start := (v_as_of - 29)::timestamp at time zone 'utc';

  drop table if exists pg_temp.churn_elig;
  create temp table churn_elig (
    user_id uuid not null,
    product text not null,
    product_since date,
    primary key (user_id, product)
  ) on commit drop;

  -- Who belongs to each sector, and since when.
  insert into churn_elig (user_id, product, product_since)
  select user_id, product, min(since)::date
  from (
    select p.user_id, 'explore' as product, p.created_at as since
      from public.explore_profiles p where p.deactivated_at is null
    union all
    select a.user_id, 'swip', a.day::timestamptz from public.churn_activity_daily a where a.product = 'swip'
    union all
    select p.user_id, 'swip', p.created_at from public.explore_posts p where p.feed_scope = 'swip'
    union all
    select o.buyer_id, 'urmall_buyer', o.created_at from public.marketplace_orders o
    union all
    select vb.buyer_id, 'urmall_buyer', vb.created_at from public.marketplace_vertical_bookings vb
    union all
    select b.user_id, 'urmall_seller', b.created_at from public.marketplace_businesses b
    union all
    select m.user_id, 'urmall_seller', m.joined_at from public.marketplace_business_members m where m.status = 'active'
    union all
    select ad.user_id, 'urmall_seller', ad.created_at from public.marketplace_business_admins ad where ad.status = 'accepted'
    union all
    select t.passenger_id, 'urride_passenger', t.created_at from public.transport_trips t
    union all
    select rr.customer_user_id, 'urride_passenger', rr.created_at from public.transport_rental_reservations rr
    union all
    select op.user_id, 'urride_operator', op.created_at from public.transport_operators op
      where coalesce(op.account_status, '') not in ('rejected', 'removed', 'deleted')
    union all
    select s.payer_user_id, 'business_plan', s.created_at from public.kunthai_business_subscriptions s
      where s.plan_code <> 'free'
         or exists (select 1 from public.kunthai_business_subscription_events ev
                    where ev.subscription_id = s.id and ev.event_type in ('activated', 'upgraded', 'renewed'))
    union all
    -- Credits customers: bought or spent credits. A starter balance alone doesn't count.
    select vt.user_id, 'credits', vt.created_at from public.visibility_credit_transactions vt where vt.amount < 0
    union all
    select vp.user_id, 'credits', vp.paid_at from public.visibility_credit_purchases vp where vp.status = 'paid'
  ) raw
  where user_id is not null and since is not null and since < v_as_of_end
  group by user_id, product;

  -- Not scored: unknown, deactivated, suspended or banned accounts.
  delete from churn_elig e
  where not exists (select 1 from auth.users u where u.id = e.user_id)
     or exists (select 1 from public.explore_profiles p where p.user_id = e.user_id and p.deactivated_at is not null)
     or exists (select 1 from public.platform_account_controls c
                where c.user_id = e.user_id and c.status in ('suspended', 'banned')
                  and (c.expires_at is null or c.expires_at > now()));
  delete from churn_elig e
  using public.churn_product_settings s
  where s.product = e.product and not s.enabled;

  delete from public.churn_user_features;

  with act as (
    select a.user_id, a.product,
      min(a.day) as first_seen_day,
      max(a.day) filter (where a.open_count > 0 or a.action_count > 0) as last_active_day,
      max(a.day) filter (where a.action_count > 0) as last_action_day,
      max(a.day) filter (where a.open_count > 0) as last_open_day,
      count(*) filter (where (a.open_count > 0 or a.action_count > 0) and a.day > v_as_of - 7)::integer as active_days_7,
      count(*) filter (where (a.open_count > 0 or a.action_count > 0) and a.day > v_as_of - 14)::integer as active_days_14,
      count(*) filter (where (a.open_count > 0 or a.action_count > 0) and a.day > v_as_of - 30)::integer as active_days_30,
      count(*) filter (where (a.open_count > 0 or a.action_count > 0) and a.day <= v_as_of - 30 and a.day > v_as_of - 60)::integer as prior_active_days_30,
      count(*) filter (where (a.open_count > 0 or a.action_count > 0) and a.day > v_as_of - 90)::integer as active_days_90,
      coalesce(sum(a.action_count) filter (where a.day > v_as_of - 7), 0)::integer as actions_7,
      coalesce(sum(a.action_count) filter (where a.day > v_as_of - 30), 0)::integer as actions_30,
      coalesce(sum(a.action_count) filter (where a.day <= v_as_of - 30 and a.day > v_as_of - 60), 0)::integer as prior_actions_30,
      count(distinct date_trunc('week', a.day)) filter (
        where (a.open_count > 0 or a.action_count > 0) and a.day <= v_as_of - 30 and a.day > v_as_of - 90)::integer as habit_weeks_prior,
      (array_agg(a.country_iso order by a.day desc) filter (where a.country_iso is not null))[1] as activity_country
    from public.churn_activity_daily a
    join churn_elig e on e.user_id = a.user_id and e.product = a.product
    where a.day <= v_as_of
    group by a.user_id, a.product
  ),
  -- Explore is the home screen. Before opens were tracked, a sign-in or a push
  -- token refresh (app start) is the best sign someone was there.
  app_seen as (
    select u.id as user_id,
      greatest(
        (u.last_sign_in_at at time zone 'utc')::date,
        (select max((t.last_seen_at at time zone 'utc')::date) from public.push_device_tokens t where t.user_id = u.id)
      ) as seen_day
    from auth.users u
    where exists (select 1 from churn_elig e where e.user_id = u.id and e.product = 'explore')
  ),
  spend as (
    select sd.user_id, sd.product, sd.currency,
      coalesce(sum(sd.amount) filter (where sd.day > v_as_of - 30), 0) as s30,
      coalesce(sum(sd.amount) filter (where sd.day <= v_as_of - 30 and sd.day > v_as_of - 60), 0) as p30,
      coalesce(sum(sd.amount), 0) as s90
    from public.churn_spend_daily sd
    where sd.day > v_as_of - 90 and sd.day <= v_as_of
    group by sd.user_id, sd.product, sd.currency
  ),
  main_spend as (
    select distinct on (user_id, product) user_id, product, currency, s30, p30
    from spend
    order by user_id, product, s90 desc, currency
  ),
  spend_90 as (
    select user_id, product, jsonb_object_agg(currency, round(s90, 2)) as by_currency
    from spend where s90 > 0
    group by user_id, product
  ),
  -- Reports, support and safety cases the user raised or is the subject of.
  -- Verification cases are not complaints. Support tickets already open a case.
  complaints as (
    select people.user_id, ps.product, count(distinct c.id)::integer as n
    from public.admin_cases c
    join public.churn_product_settings ps on ps.sector = c.sector
    cross join lateral unnest(array[c.reporter_user_id, c.subject_user_id]) as people(user_id)
    where c.created_at >= v_30_start and c.created_at < v_as_of_end
      and c.queue <> 'verification'
      and people.user_id is not null
    group by people.user_id, ps.product
  ),
  -- How long each sector has had open tracking (first real open).
  opens_tracking as (
    select a.product, v_as_of - min(a.day) as days
    from public.churn_activity_daily a
    where a.open_count > 0 and a.day <= v_as_of
    group by a.product
  ),
  bad as (
    select x.user_id, x.product, count(*)::integer as n
    from (
      select o.buyer_id as user_id, 'urmall_buyer' as product
        from public.marketplace_orders o
        where o.status in ('cancelled', 'refunded') and o.updated_at >= v_30_start and o.updated_at < v_as_of_end
      union all
      select r.buyer_id, 'urmall_buyer'
        from public.marketplace_reviews r
        where r.rating <= 2 and r.created_at >= v_30_start and r.created_at < v_as_of_end
      union all
      select b.user_id, 'urmall_seller'
        from public.marketplace_reviews r join public.marketplace_businesses b on b.id = r.business_id
        where r.rating <= 2 and r.created_at >= v_30_start and r.created_at < v_as_of_end
      union all
      select t.passenger_id, 'urride_passenger'
        from public.transport_trips t
        where t.status in ('cancelled', 'withdrawn')
          and coalesce(t.cancelled_at, t.updated_at) >= v_30_start and coalesce(t.cancelled_at, t.updated_at) < v_as_of_end
      union all
      select orv.passenger_id, 'urride_passenger'
        from public.transport_operator_reviews orv
        where orv.rating <= 2 and orv.created_at >= v_30_start and orv.created_at < v_as_of_end
      union all
      select op.user_id, 'urride_operator'
        from public.transport_operator_reviews orv join public.transport_operators op on op.id = orv.operator_id
        where orv.rating <= 2 and orv.created_at >= v_30_start and orv.created_at < v_as_of_end
    ) x
    where x.user_id is not null
    group by x.user_id, x.product
  ),
  unanswered as (
    select b.user_id, count(*)::integer as n
    from (
      select distinct on (cm.business_id, coalesce(cm.conversation_key, cm.buyer_id::text))
        cm.business_id, cm.sender_role, cm.created_at
      from public.marketplace_customer_messages cm
      where cm.deleted_at is null and cm.created_at >= v_30_start and cm.created_at < v_as_of_end
      order by cm.business_id, coalesce(cm.conversation_key, cm.buyer_id::text), cm.created_at desc
    ) last_message
    join public.marketplace_businesses b on b.id = last_message.business_id
    where last_message.sender_role = 'buyer'
      and last_message.created_at < least(now(), v_as_of_end) - interval '48 hours'
    group by b.user_id
  ),
  push as (
    select user_id from public.push_device_tokens
    union
    select user_id from public.push_subscriptions
  ),
  plan as (
    select distinct on (s.payer_user_id)
      s.payer_user_id as user_id,
      case when s.plan_code = 'free' then 'free' else s.status end as plan_status,
      (s.current_period_end at time zone 'utc')::date - v_as_of as days_to_renewal,
      s.auto_renew,
      (s.pending_plan_code is not null and s.pending_plan_code <> s.plan_code) as downgrade_pending
    from public.kunthai_business_subscriptions s
    where s.payer_user_id is not null
    order by s.payer_user_id, (s.plan_code <> 'free') desc, s.current_period_end desc nulls last
  )
  insert into public.churn_user_features (
    user_id, product, as_of, country_iso, product_since,
    first_seen_day, last_active_day, last_action_day, last_open_day,
    days_inactive, days_since_action, days_since_open, product_tenure_days,
    active_days_7, active_days_14, active_days_30, prior_active_days_30, active_days_90,
    actions_7, actions_30, prior_actions_30, habit_weeks_prior,
    main_currency, spend_30, prior_spend_30, spend_90,
    complaints_30, bad_experiences_30, unanswered_48h, push_enabled,
    plan_status, days_to_renewal, auto_renew, downgrade_pending, credits_balance, opens_tracking_days, computed_at
  )
  select
    e.user_id, e.product, v_as_of,
    coalesce(upper(r.country_iso), act.activity_country),
    e.product_since,
    act.first_seen_day,
    case when e.product = 'explore'
      then nullif(greatest(coalesce(act.last_active_day, '-infinity'::date), coalesce(app_seen.seen_day, '-infinity'::date)), '-infinity'::date)
      else act.last_active_day end,
    act.last_action_day,
    act.last_open_day,
    v_as_of - coalesce(
      case when e.product = 'explore'
        then nullif(greatest(coalesce(act.last_active_day, '-infinity'::date), coalesce(app_seen.seen_day, '-infinity'::date)), '-infinity'::date)
        else act.last_active_day end,
      e.product_since),
    v_as_of - coalesce(act.last_action_day, e.product_since),
    v_as_of - act.last_open_day,
    v_as_of - e.product_since,
    coalesce(act.active_days_7, 0), coalesce(act.active_days_14, 0), coalesce(act.active_days_30, 0),
    coalesce(act.prior_active_days_30, 0), coalesce(act.active_days_90, 0),
    coalesce(act.actions_7, 0), coalesce(act.actions_30, 0), coalesce(act.prior_actions_30, 0),
    coalesce(act.habit_weeks_prior, 0),
    ms.currency, coalesce(ms.s30, 0), coalesce(ms.p30, 0), coalesce(s90.by_currency, '{}'::jsonb),
    coalesce(cp.n, 0), coalesce(bd.n, 0),
    case when e.product = 'urmall_seller' then coalesce(un.n, 0) else 0 end,
    (push.user_id is not null),
    case when e.product = 'business_plan' then pl.plan_status end,
    case when e.product = 'business_plan' then pl.days_to_renewal end,
    case when e.product = 'business_plan' then pl.auto_renew end,
    case when e.product = 'business_plan' then pl.downgrade_pending end,
    case when e.product = 'credits' then (select w.balance from public.visibility_credit_wallets w where w.user_id = e.user_id) end,
    coalesce(ot.days, 0),
    now()
  from churn_elig e
  left join opens_tracking ot on ot.product = e.product
  left join act on act.user_id = e.user_id and act.product = e.product
  left join app_seen on app_seen.user_id = e.user_id and e.product = 'explore'
  left join public.kunthai_account_regions r on r.user_id = e.user_id
  left join main_spend ms on ms.user_id = e.user_id and ms.product = e.product
  left join spend_90 s90 on s90.user_id = e.user_id and s90.product = e.product
  left join complaints cp on cp.user_id = e.user_id and cp.product = e.product
  left join bad bd on bd.user_id = e.user_id and bd.product = e.product
  left join unanswered un on un.user_id = e.user_id
  left join push on push.user_id = e.user_id
  left join plan pl on pl.user_id = e.user_id;
  get diagnostics v_features = row_count;

  delete from public.churn_scores where scored_on = v_as_of;

  insert into public.churn_scores (
    user_id, product, scored_on, country_iso, status, segment, score,
    top_signals, revenue_at_risk, recommended_action, provisional
  )
  select
    f.user_id, f.product, v_as_of, f.country_iso,
    x.r->>'status', x.r->>'segment', (x.r->>'score')::smallint,
    x.r->'signals',
    case when x.r->>'status' in ('at_risk', 'churned') then coalesce(mo.monthly, '{}'::jsonb) else '{}'::jsonb end,
    x.r->>'action',
    coalesce((x.r->>'provisional')::boolean, false)
  from public.churn_user_features f
  join public.churn_product_settings s on s.product = f.product and s.enabled
  cross join lateral (
    select public.churn_score_rules(f.product, s.churn_after_days, to_jsonb(f)) as r
  ) x
  left join lateral (
    select jsonb_object_agg(k, round(v::numeric / 3, 2)) as monthly
    from jsonb_each_text(f.spend_90) as sp(k, v)
  ) mo on true;
  get diagnostics v_scores = row_count;

  delete from public.churn_scores where scored_on < v_as_of - 400;

  return jsonb_build_object('as_of', v_as_of, 'features', v_features, 'scores', v_scores);
end;
$$;

revoke execute on function public.churn_score_users(date) from public, anon, authenticated;

-- 6. Nightly: refresh activity, then score, in one job so the order holds.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'kunthai-churn-activity-refresh') then
    perform cron.unschedule('kunthai-churn-activity-refresh');
  end if;
  perform cron.schedule(
    'kunthai-churn-activity-refresh',
    '30 2 * * *',
    'select public.churn_refresh_activity(); select public.churn_score_users();'
  );
end $$;

select public.churn_score_users();
