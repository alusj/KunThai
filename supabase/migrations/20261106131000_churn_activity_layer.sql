-- Churn intelligence, Phase 1: the activity data layer.
-- Plan: docs/2026-11-06-churn-intelligence-plan.md
--
-- 1. churn_product_settings: one row per sector, with its churn window (editable later).
-- 2. churn_activity_daily: one row per user × sector × UTC day: opens, actions, and the
--    account's country at the time, for the "leading countries" views.
-- 3. churn_spend_daily: what a user spent per sector × day × currency. Never converted.
-- 4. touch_product_open(): the app records "opened this sector today".
-- 5. churn_refresh_activity(): rebuilds action counts and spend for a date range
--    from the existing tables. It is idempotent and safe to rerun.
-- 6. Nightly cron job, plus a 90-day backfill.
--
-- No client can read these tables. Phase 3 adds admin RPCs that check
-- admin_has_permission(...) and the admin's product and region scopes.

-- 1. Sector settings --------------------------------------------------------

create table if not exists public.churn_product_settings (
  product text primary key check (product ~ '^[a-z_]+$'),
  label text not null,
  sector text not null check (sector in ('explore', 'marketplace', 'transport', 'platform')),
  churn_after_days integer not null check (churn_after_days between 1 and 365),
  tracks_opens boolean not null default true,
  enabled boolean not null default true,
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- The churn window is inserted once and never overwritten here, so tuning it later sticks.
insert into public.churn_product_settings (product, label, sector, churn_after_days, tracks_opens, sort_order) values
  ('explore',          'Explore',            'explore',     30, true,  1),
  ('swip',             'Swip',               'explore',     30, true,  2),
  ('urmall_buyer',     'UrMall buyers',      'marketplace', 60, true,  3),
  ('urmall_seller',    'UrMall sellers',     'marketplace', 30, true,  4),
  ('urride_passenger', 'UrRide passengers',  'transport',   60, true,  5),
  ('urride_operator',  'UrRide operators',   'transport',   14, true,  6),
  ('business_plan',    'Business plans',     'platform',    30, false, 7),
  ('credits',          'Visibility credits', 'platform',    60, false, 8)
on conflict (product) do update
set label = excluded.label,
    sector = excluded.sector,
    tracks_opens = excluded.tracks_opens,
    sort_order = excluded.sort_order;

-- 2. Daily activity ---------------------------------------------------------

create table if not exists public.churn_activity_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null references public.churn_product_settings(product) on update cascade,
  day date not null,
  open_count integer not null default 0 check (open_count >= 0),
  action_count integer not null default 0 check (action_count >= 0),
  country_iso text,
  refreshed_at timestamptz not null default now(),
  primary key (user_id, product, day)
);

create index if not exists churn_activity_daily_product_day_idx
  on public.churn_activity_daily (product, day desc);
create index if not exists churn_activity_daily_country_day_idx
  on public.churn_activity_daily (country_iso, day desc);
create index if not exists churn_activity_daily_day_idx
  on public.churn_activity_daily (day);

-- 3. Daily spend, per currency ---------------------------------------------

create table if not exists public.churn_spend_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null references public.churn_product_settings(product) on update cascade,
  day date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(18, 3) not null check (amount >= 0),
  country_iso text,
  primary key (user_id, product, day, currency)
);

create index if not exists churn_spend_daily_product_day_idx
  on public.churn_spend_daily (product, day desc);
create index if not exists churn_spend_daily_day_idx
  on public.churn_spend_daily (day);

alter table public.churn_product_settings enable row level security;
alter table public.churn_activity_daily enable row level security;
alter table public.churn_spend_daily enable row level security;
revoke all on public.churn_product_settings, public.churn_activity_daily, public.churn_spend_daily
  from public, anon, authenticated;

-- Same rule as server/visibilityCreditPayments.js currencyExponent().
create or replace function public.churn_currency_exponent(p_currency text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when upper(coalesce(p_currency, '')) in ('BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF') then 0
    when upper(coalesce(p_currency, '')) in ('BHD','IQD','JOD','KWD','LYD','OMR','TND') then 3
    else 2
  end
$$;

-- 4. Opens from the app ----------------------------------------------------
-- The app calls this at most once per UTC day per sector (it throttles itself).
-- The server also caps the count, so a misbehaving client can't inflate it.

create or replace function public.touch_product_open(p_product text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
begin
  if v_user is null then
    return;
  end if;

  if not exists (
    select 1 from public.churn_product_settings
    where product = p_product and tracks_opens and enabled
  ) then
    raise exception 'Unknown product %', p_product using errcode = '22023';
  end if;

  insert into public.churn_activity_daily (user_id, product, day, open_count, country_iso)
  values (
    v_user, p_product, v_day, 1,
    (select upper(r.country_iso) from public.kunthai_account_regions r where r.user_id = v_user)
  )
  on conflict (user_id, product, day) do update
  set open_count = least(public.churn_activity_daily.open_count + 1, 50),
      country_iso = coalesce(excluded.country_iso, public.churn_activity_daily.country_iso);
end;
$$;

revoke execute on function public.touch_product_open(text) from public, anon;
grant execute on function public.touch_product_open(text) to authenticated;

-- 5. Nightly refresh -------------------------------------------------------
-- Recomputes action_count and spend for [p_from, p_to] (UTC days) from the
-- existing tables. open_count is never touched: only the app writes it.

create or replace function public.churn_refresh_activity(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to date := coalesce(p_to, (now() at time zone 'utc')::date);
  v_from date := coalesce(p_from, coalesce(p_to, (now() at time zone 'utc')::date) - 3);
  v_start timestamptz;
  v_end timestamptz;
  v_activity_rows integer := 0;
  v_spend_rows integer := 0;
  v_pruned integer := 0;
begin
  if v_from > v_to then
    raise exception 'churn_refresh_activity: from (%) is after to (%)', v_from, v_to using errcode = '22023';
  end if;
  if v_to - v_from > 400 then
    raise exception 'churn_refresh_activity: range is over 400 days' using errcode = '22023';
  end if;

  -- One refresh at a time.
  perform pg_advisory_xact_lock(hashtext('public.churn_refresh_activity'));

  v_start := v_from::timestamp at time zone 'utc';
  v_end := (v_to + 1)::timestamp at time zone 'utc';

  update public.churn_activity_daily
  set action_count = 0, refreshed_at = now()
  where day between v_from and v_to and action_count <> 0;

  delete from public.churn_spend_daily where day between v_from and v_to;

  with events (user_id, product, happened_at) as (
    -- Explore (non-Swip posts and the reactions on them, follows, messages, Spaces)
    select p.user_id, 'explore', p.created_at from public.explore_posts p
      where p.created_at >= v_start and p.created_at < v_end and coalesce(p.feed_scope, 'feed') <> 'swip'
    union all
    select c.user_id, case when p.feed_scope = 'swip' then 'swip' else 'explore' end, c.created_at
      from public.explore_post_comments c left join public.explore_posts p on p.id = c.post_id
      where c.created_at >= v_start and c.created_at < v_end
    union all
    select l.user_id, case when p.feed_scope = 'swip' then 'swip' else 'explore' end, l.created_at
      from public.explore_post_likes l left join public.explore_posts p on p.id = l.post_id
      where l.created_at >= v_start and l.created_at < v_end
    union all
    select f.follower_id, 'explore', f.created_at from public.explore_follows f
      where f.created_at >= v_start and f.created_at < v_end
    union all
    select m.sender_id, 'explore', m.created_at from public.explore_messages m
      where m.created_at >= v_start and m.created_at < v_end
    union all
    select sm.user_id, 'explore', sm.accepted_at from public.explore_space_members sm
      where sm.accepted_at >= v_start and sm.accepted_at < v_end
    -- Swip uploads
    union all
    select p.user_id, 'swip', p.created_at from public.explore_posts p
      where p.created_at >= v_start and p.created_at < v_end and p.feed_scope = 'swip'
    -- UrMall buyers
    union all
    select o.buyer_id, 'urmall_buyer', o.created_at from public.marketplace_orders o
      where o.created_at >= v_start and o.created_at < v_end
    union all
    select ci.buyer_id, 'urmall_buyer', ci.created_at from public.marketplace_cart_items ci
      where ci.created_at >= v_start and ci.created_at < v_end
    union all
    select coalesce(cm.sent_by, cm.buyer_id), 'urmall_buyer', cm.created_at from public.marketplace_customer_messages cm
      where cm.created_at >= v_start and cm.created_at < v_end and cm.sender_role = 'buyer'
    union all
    select r.buyer_id, 'urmall_buyer', r.created_at from public.marketplace_reviews r
      where r.created_at >= v_start and r.created_at < v_end
    union all
    select vb.buyer_id, 'urmall_buyer', vb.created_at from public.marketplace_vertical_bookings vb
      where vb.created_at >= v_start and vb.created_at < v_end
    -- UrMall sellers
    union all
    select b.user_id, 'urmall_seller', b.created_at from public.marketplace_businesses b
      where b.created_at >= v_start and b.created_at < v_end
    union all
    select coalesce(pr.user_id, b.user_id), 'urmall_seller', pr.created_at
      from public.marketplace_products pr join public.marketplace_businesses b on b.id = pr.business_id
      where pr.created_at >= v_start and pr.created_at < v_end
    union all
    select coalesce(pr.user_id, b.user_id), 'urmall_seller', pr.updated_at
      from public.marketplace_products pr join public.marketplace_businesses b on b.id = pr.business_id
      where pr.updated_at >= v_start and pr.updated_at < v_end and pr.updated_at > pr.created_at + interval '1 minute'
    union all
    select coalesce(cm.sent_by, b.user_id), 'urmall_seller', cm.created_at
      from public.marketplace_customer_messages cm join public.marketplace_businesses b on b.id = cm.business_id
      where cm.created_at >= v_start and cm.created_at < v_end and cm.sender_role = 'seller'
    union all
    select b.user_id, 'urmall_seller', o.seller_responded_at
      from public.marketplace_orders o join public.marketplace_businesses b on b.id = o.business_id
      where o.seller_responded_at >= v_start and o.seller_responded_at < v_end
    -- UrRide passengers
    union all
    select t.passenger_id, 'urride_passenger', t.created_at from public.transport_trips t
      where t.created_at >= v_start and t.created_at < v_end
    union all
    select bb.passenger_id, 'urride_passenger', bb.created_at from public.transport_broadcast_bookings bb
      where bb.created_at >= v_start and bb.created_at < v_end
    union all
    select rr.customer_user_id, 'urride_passenger', rr.created_at from public.transport_rental_reservations rr
      where rr.created_at >= v_start and rr.created_at < v_end
    -- UrRide operators (trip accepted, trip completed, last seen online)
    union all
    select op.user_id, 'urride_operator', t.operator_accepted_at
      from public.transport_trips t
      join public.transport_fleets fl on fl.id = t.fleet_id
      join public.transport_operators op on op.id = fl.operator_id
      where t.operator_accepted_at >= v_start and t.operator_accepted_at < v_end
    union all
    select op.user_id, 'urride_operator', t.completed_at
      from public.transport_trips t
      join public.transport_fleets fl on fl.id = t.fleet_id
      join public.transport_operators op on op.id = fl.operator_id
      where t.completed_at >= v_start and t.completed_at < v_end
    union all
    select op.user_id, 'urride_operator', fl.last_active_at
      from public.transport_fleets fl join public.transport_operators op on op.id = fl.operator_id
      where fl.last_active_at >= v_start and fl.last_active_at < v_end
    -- Business plans
    union all
    select coalesce(ev.actor_user_id, s.payer_user_id), 'business_plan', ev.created_at
      from public.kunthai_business_subscription_events ev
      join public.kunthai_business_subscriptions s on s.id = ev.subscription_id
      where ev.created_at >= v_start and ev.created_at < v_end
    union all
    select s.payer_user_id, 'business_plan', s.current_period_start from public.kunthai_business_subscriptions s
      where s.current_period_start >= v_start and s.current_period_start < v_end
    -- Visibility credits
    union all
    select vt.user_id, 'credits', vt.created_at from public.visibility_credit_transactions vt
      where vt.created_at >= v_start and vt.created_at < v_end
    union all
    select vp.user_id, 'credits', vp.paid_at from public.visibility_credit_purchases vp
      where vp.paid_at >= v_start and vp.paid_at < v_end and vp.status = 'paid'
  ),
  counted as (
    select e.user_id, e.product, (e.happened_at at time zone 'utc')::date as day, count(*)::integer as n
    from events e
    where e.user_id is not null
      and exists (select 1 from auth.users u where u.id = e.user_id)
    group by 1, 2, 3
  )
  insert into public.churn_activity_daily (user_id, product, day, action_count, country_iso, refreshed_at)
  select c.user_id, c.product, c.day, c.n, upper(r.country_iso), now()
  from counted c
  left join public.kunthai_account_regions r on r.user_id = c.user_id
  on conflict (user_id, product, day) do update
  set action_count = excluded.action_count,
      country_iso = coalesce(public.churn_activity_daily.country_iso, excluded.country_iso),
      refreshed_at = now();
  get diagnostics v_activity_rows = row_count;

  with spend (user_id, product, happened_at, currency, amount) as (
    select o.buyer_id, 'urmall_buyer', coalesce(o.completed_at, o.updated_at), o.currency, o.total_amount
      from public.marketplace_orders o
      where o.status = 'completed'
        and coalesce(o.completed_at, o.updated_at) >= v_start and coalesce(o.completed_at, o.updated_at) < v_end
    union all
    select t.passenger_id, 'urride_passenger', t.completed_at, t.fare_currency, t.fare_amount
      from public.transport_trips t
      where t.status = 'completed' and t.completed_at >= v_start and t.completed_at < v_end
    union all
    select rr.customer_user_id, 'urride_passenger', rr.completed_at, rr.currency, rr.total_price
      from public.transport_rental_reservations rr
      where rr.status = 'completed' and rr.completed_at >= v_start and rr.completed_at < v_end
    union all
    select vp.user_id, 'credits', vp.paid_at, vp.currency,
           vp.amount_minor::numeric / power(10, public.churn_currency_exponent(vp.currency))
      from public.visibility_credit_purchases vp
      where vp.status = 'paid' and vp.paid_at >= v_start and vp.paid_at < v_end
  ),
  summed as (
    select s.user_id, s.product, (s.happened_at at time zone 'utc')::date as day,
           upper(trim(s.currency)) as currency, sum(s.amount) as amount
    from spend s
    where s.user_id is not null
      and s.amount > 0
      and upper(trim(coalesce(s.currency, ''))) ~ '^[A-Z]{3}$'
      and exists (select 1 from auth.users u where u.id = s.user_id)
    group by 1, 2, 3, 4
  )
  insert into public.churn_spend_daily (user_id, product, day, currency, amount, country_iso)
  select s.user_id, s.product, s.day, s.currency, s.amount, upper(r.country_iso)
  from summed s
  left join public.kunthai_account_regions r on r.user_id = s.user_id;
  get diagnostics v_spend_rows = row_count;

  -- Keep about 13 months, enough for year-on-year views.
  delete from public.churn_activity_daily where day < v_to - 400;
  get diagnostics v_pruned = row_count;
  delete from public.churn_spend_daily where day < v_to - 400;

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'activity_rows', v_activity_rows,
    'spend_rows', v_spend_rows,
    'pruned_activity_rows', v_pruned
  );
end;
$$;

revoke execute on function public.churn_refresh_activity(date, date) from public, anon, authenticated;

-- 6. Cron and backfill -------------------------------------------------------
-- Nightly at 02:30 UTC it rebuilds the last 3 days plus today, catching late
-- completions (orders, trips) and edits.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'kunthai-churn-activity-refresh') then
    perform cron.unschedule('kunthai-churn-activity-refresh');
  end if;
  perform cron.schedule('kunthai-churn-activity-refresh', '30 2 * * *', 'select public.churn_refresh_activity()');
end $$;

select public.churn_refresh_activity(((now() at time zone 'utc')::date - 90), (now() at time zone 'utc')::date);
