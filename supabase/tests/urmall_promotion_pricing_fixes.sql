-- Run ONLY against a disposable promo_fix_test database:
-- psql -h <socket dir> -p <port> -U pgtest -d promo_fix_test -v ON_ERROR_STOP=1 -f supabase/tests/urmall_promotion_pricing_fixes.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'promo_fix_test' then raise exception 'This fixture requires the disposable promo_fix_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'service_role') $$;

-- Minimal UrMall schema ------------------------------------------------------
create table public.marketplace_businesses(id uuid primary key, user_id uuid, business_name text default '');
create table public.marketplace_business_admins(business_id uuid, user_id uuid, status text, responsibilities jsonb default '{}');
create table public.marketplace_products(id uuid primary key, business_id uuid, name text, price numeric, discount_price numeric,
  tier_pricing jsonb not null default '[]', product_attributes jsonb default '{}', status text default 'active',
  promoted boolean default false, promoted_at timestamptz, updated_at timestamptz);
create table public.marketplace_restaurant_menu_items(id uuid primary key, business_id uuid, name text, promoted boolean default false,
  promoted_at timestamptz, available boolean default true, updated_at timestamptz);
create table public.marketplace_property_listings(id uuid primary key, business_id uuid, title text, promoted boolean default false,
  promoted_at timestamptz, published boolean default true, updated_at timestamptz);
create table public.marketplace_promotions(id uuid primary key default gen_random_uuid(), business_id uuid, product_id uuid, meal_id uuid, property_id uuid,
  listing_type text, name text, product_name text, discount_label text, budget_spent numeric, budget_limit numeric, credit_budget integer,
  credits_spent integer, views integer, orders integer, revenue numeric, status text, starts_at timestamptz, ends_at timestamptz,
  metadata jsonb, target_region_ids uuid[] default '{}', target_country_isos text[] default '{}',
  created_at timestamptz default clock_timestamp(), updated_at timestamptz);
create table public.marketplace_orders(id uuid primary key default gen_random_uuid(), business_id uuid, buyer_id uuid, product_id uuid,
  status text default 'pending', total_amount numeric not null default 0, item_count integer not null default 0, preview text default '');
create table public.marketplace_cart_items(buyer_id uuid, product_id uuid, business_id uuid, quantity integer, created_at timestamptz default now());
create table public.platform_notifications(id uuid primary key default gen_random_uuid(), user_id uuid, notification_type text,
  action_target text, created_at timestamptz default now());
create table public.wallet(user_id uuid primary key, balance integer);

create function public.is_kunthai_admin(user_uuid uuid default auth.uid()) returns boolean language sql stable as $$ select false $$;
create function public.spend_visibility_credits(p_amount integer, p_surface text, p_type text, p_id uuid, p_meta jsonb) returns void language plpgsql as $$
begin
  if coalesce((select balance from public.wallet where user_id = auth.uid()), 0) < p_amount then raise exception 'Not enough Visibility Credits.'; end if;
  update public.wallet set balance = balance - p_amount where user_id = auth.uid();
end $$;
create function public.kunthai_clean_region_ids(ids uuid[], max_count integer) returns uuid[] language sql as $$ select coalesce(ids, '{}') $$;
create function public.kunthai_clean_country_isos(isos text[]) returns text[] language sql as $$ select coalesce(isos, '{}') $$;
create function public.kunthai_assert_promotion_targeting(c integer, a integer, n integer, nearby boolean) returns void language sql as $$ select $$;
create function public.kunthai_promotion_region_metadata(ids uuid[]) returns jsonb language sql as $$ select to_jsonb(ids) $$;
-- Same definition as 20260828120000_urmall_admin_responsibilities.sql.
create function public.has_urmall_admin_responsibility(target_business_id uuid, responsibility_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.marketplace_business_admins admin_row
    where admin_row.business_id = target_business_id and admin_row.user_id = auth.uid() and admin_row.status = 'accepted'
      and coalesce((admin_row.responsibilities ->> responsibility_key)::boolean, false));
$$;

-- Minimal subscription schema --------------------------------------------------
create table public.kunthai_business_plans(surface text, plan_code text, grace_days integer default 7, active boolean default true,
  credit_cost integer, yearly_credit_cost integer, duration_days integer default 30, yearly_duration_days integer default 365);
insert into public.kunthai_business_plans(surface, plan_code, credit_cost, yearly_credit_cost, active) values
  ('urmall','free',0,0,true),('urmall','pro',30,300,true),('urmall','legacy',50,500,false);
create table public.kunthai_business_subscriptions(id uuid primary key, surface text, marketplace_business_id uuid, transport_company_id uuid,
  plan_code text, status text, auto_renew boolean default false, payer_user_id uuid, current_period_start timestamptz, current_period_end timestamptz, grace_ends_at timestamptz,
  pending_plan_code text, pending_billing_interval text, billing_interval text default 'monthly', operator_pack_count integer default 0,
  reminder_7_sent boolean default false, reminder_3_sent boolean default false, reminder_1_sent boolean default false, grace_notice_sent boolean default false, updated_at timestamptz);
create table public.kunthai_business_subscription_events(subscription_id uuid, event_type text, from_plan_code text, to_plan_code text, actor_user_id uuid, metadata jsonb, credits integer);
create table public.transport_companies(id uuid, company_name text);
create function public.kunthai_subscription_notify(u uuid, k text, b text, p text) returns void language sql as $$ select $$;
create function public.kunthai_debit_subscription_credits(u uuid, amount integer, s text, sub uuid, meta jsonb) returns void language plpgsql as $$
begin
  if amount is null then raise exception 'Renewal cost is missing.'; end if;
  if coalesce((select balance from public.wallet where user_id = u), 0) < amount then raise exception 'Not enough Visibility Credits.'; end if;
  update public.wallet set balance = balance - amount where user_id = u;
end $$;
-- Subscription ...0bad makes the reminder step fail with an unexpected error.
create function public.kunthai_send_subscription_reminders(id uuid) returns integer language plpgsql as $$
begin
  if id = '30000000-0000-4000-8000-000000000bad' then perform 1 / 0; end if;
  return 0;
end $$;
create function public.kunthai_try_early_subscription_renewal(id uuid) returns boolean language sql as $$ select false $$;
create function public.kunthai_renew_subscription_row(p_subscription_id uuid) returns text language plpgsql as $$
begin return public.kunthai_renew_subscription_row_before_urmall_retention(p_subscription_id); end $$;

\ir ../migrations/20261008120000_urmall_promotion_pricing_fixes.sql

-- The 20260827170000 trigger, with the function this migration redefines.
create trigger marketplace_visibility_promotion_duration_guard
before insert or update of credit_budget, budget_limit, starts_at, ends_at, metadata
on public.marketplace_promotions
for each row execute function public.enforce_marketplace_visibility_promotion_duration();

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;

-- Fixture: owner ...01 owns business b1; admin ...02 manages it with product
-- access; admin ...03 is an admin without product access.
insert into public.marketplace_businesses values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Shop');
insert into public.marketplace_business_admins values
  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'accepted', '{"addProducts": true}'),
  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'accepted', '{"addProducts": false, "dashboardAccess": true}');
insert into public.wallet values ('00000000-0000-4000-8000-000000000001', 1000), ('00000000-0000-4000-8000-000000000002', 100),
  ('00000000-0000-4000-8000-000000000003', 100);
insert into public.marketplace_products(id, business_id, name, price, discount_price, tier_pricing) values
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Rice', 100, 80, '[{"minQty": 10, "maxQty": 0, "price": 90}, {"minQty": 50, "price": 70}]'),
  ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Oil', 50, null, '[]'),
  ('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Salt', 10, null, '[]'),
  ('a0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'Sugar', 20, null, '[]');

-- 1. Duration: the database grants what the client promises
--    (visibilityCreditRules.getMarketplacePromotionDurationDays).
select test_assert(public.kunthai_marketplace_promotion_duration_days(5) = 1, '5 credits = 1 day');
select test_assert(public.kunthai_marketplace_promotion_duration_days(10) = 2.5, '10 credits = 2.5 days');
select test_assert(public.kunthai_marketplace_promotion_duration_days(15) = 4, '15 credits = 4 days');
select test_assert(public.kunthai_marketplace_promotion_duration_days(20) = 5.5, '20 credits = 5.5 days');
select test_assert(public.kunthai_marketplace_promotion_duration_days(100) = 29.5, '100 credits = 29.5 days');
select test_assert(public.kunthai_marketplace_promotion_duration_days(500) = 30, 'capped at 30 days');

select set_config('test.user_id', '00000000-0000-4000-8000-000000000001', false);
select public.create_marketplace_visibility_promotion('a0000000-0000-4000-8000-000000000002', 10, 'countrywide');
select test_assert((select ends_at - starts_at = interval '2 days 12 hours' and (metadata ->> 'durationDays')::numeric = 2.5
  from public.marketplace_promotions where product_id = 'a0000000-0000-4000-8000-000000000002'), 'a 10-credit boost lasts 2.5 days');
select test_assert((select balance = 990 from public.wallet where user_id = '00000000-0000-4000-8000-000000000001'), 'the owner paid 10 credits');

-- 2. A delegated admin with product access can boost; credits come from the admin's own wallet.
select set_config('test.user_id', '00000000-0000-4000-8000-000000000002', false);
select public.create_marketplace_visibility_promotion('a0000000-0000-4000-8000-000000000003', 15, 'countrywide');
select test_assert((select ends_at - starts_at = interval '4 days' from public.marketplace_promotions
  where product_id = 'a0000000-0000-4000-8000-000000000003'), 'a 15-credit boost lasts 4 days');
select test_assert((select balance = 85 from public.wallet where user_id = '00000000-0000-4000-8000-000000000002'), 'the admin paid from their own wallet');
select test_assert((select balance = 990 from public.wallet where user_id = '00000000-0000-4000-8000-000000000001'), 'the owner was not charged');
select test_assert((select promoted from public.marketplace_products where id = 'a0000000-0000-4000-8000-000000000003'), 'the product is flagged promoted');

-- An admin without the addProducts responsibility is refused.
select set_config('test.user_id', '00000000-0000-4000-8000-000000000003', false);
do $$ begin
  perform public.create_marketplace_visibility_promotion('a0000000-0000-4000-8000-000000000004', 5, 'countrywide');
  raise exception 'TEST FAILED: admin without product access could boost';
exception when raise_exception then
  if sqlerrm like 'TEST FAILED%' then raise; end if;
end $$;
select test_assert((select balance = 100 from public.wallet where user_id = '00000000-0000-4000-8000-000000000003'), 'refused admin was not charged');

-- 3. Re-promoting with new targeting returns the live boost unchanged and free.
select set_config('test.user_id', '00000000-0000-4000-8000-000000000001', false);
create temp table first_boost as select * from public.marketplace_promotions where product_id = 'a0000000-0000-4000-8000-000000000002';
select public.create_marketplace_visibility_promotion_in_regions('a0000000-0000-4000-8000-000000000002', 50, 'countrywide',
  array['c0000000-0000-4000-8000-000000000001']::uuid[], array['SL', 'GN']);
select test_assert((select count(*) = 1 from public.marketplace_promotions where product_id = 'a0000000-0000-4000-8000-000000000002'), 'no second boost');
select test_assert((select p.target_region_ids = f.target_region_ids and p.target_country_isos = f.target_country_isos and p.metadata = f.metadata
  from public.marketplace_promotions p, first_boost f where p.id = f.id), 'the paid targeting is unchanged');
select test_assert((select balance = 990 from public.wallet where user_id = '00000000-0000-4000-8000-000000000001'), 're-promoting charged nothing');

-- A NEW boost through the wrapper still gets the chosen targeting.
select public.create_marketplace_visibility_promotion_in_regions('a0000000-0000-4000-8000-000000000004', 20, 'countrywide',
  array['c0000000-0000-4000-8000-000000000001']::uuid[], array['SL']);
select test_assert((select target_region_ids = array['c0000000-0000-4000-8000-000000000001']::uuid[] and target_country_isos = array['SL']
  and ends_at - starts_at = interval '5 days 12 hours'
  from public.marketplace_promotions where product_id = 'a0000000-0000-4000-8000-000000000004'), 'a new boost gets its targeting and 5.5 days');

-- 4. Ended boosts: flag cleared; a new boost can then start.
update public.marketplace_promotions set starts_at = now() - interval '10 days', ends_at = now() - interval '1 day'
where product_id = 'a0000000-0000-4000-8000-000000000004';
select test_assert(public.kunthai_clear_expired_promotion_flags() = 1, 'one expired flag cleared');
select test_assert((select not promoted from public.marketplace_products where id = 'a0000000-0000-4000-8000-000000000004'), 'ended boost no longer promoted');
select test_assert((select promoted from public.marketplace_products where id = 'a0000000-0000-4000-8000-000000000002'), 'live boost stays promoted');
select public.create_marketplace_visibility_promotion('a0000000-0000-4000-8000-000000000004', 5, 'countrywide');
select test_assert((select count(*) = 2 from public.marketplace_promotions where product_id = 'a0000000-0000-4000-8000-000000000004'), 'a new boost starts after the old one ended');

-- 5/6. Unit price = lowest of tier and discounted price; order totals are checked.
select test_assert(public.kunthai_marketplace_unit_price(100, 80, '[{"minQty": 10, "price": 90}]', 12) = 80, 'discount beats a higher tier price');
select test_assert(public.kunthai_marketplace_unit_price(100, 80, '[{"minQty": 10, "price": 70}]', 12) = 70, 'a lower tier price wins');
select test_assert(public.kunthai_marketplace_unit_price(100, null, '[{"minQty": 10, "price": 90}]', 5) = 100, 'tier not reached');
select test_assert(public.kunthai_marketplace_unit_price(100, 120, '[]', 1) = 100, 'a discount above the price is ignored');

select set_config('test.user_id', '00000000-0000-4000-8000-000000000009', false);
insert into public.marketplace_orders(business_id, buyer_id, product_id, total_amount, item_count)
values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 3500, 50);
select test_assert((select total_amount = 3500 from public.marketplace_orders where product_id = 'a0000000-0000-4000-8000-000000000001'), 'a correct total is accepted');
do $$ begin
  insert into public.marketplace_orders(business_id, buyer_id, product_id, total_amount, item_count)
  values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 1, 50);
  raise exception 'TEST FAILED: a tampered total was accepted';
exception when raise_exception then
  if sqlerrm not like 'KUNTHAI_ORDER_PRICE_CHANGED%' then raise; end if;
end $$;
-- Multi-line cart order (product_id null) is checked against the cart.
insert into public.marketplace_cart_items(buyer_id, product_id, business_id, quantity) values
  ('00000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 2),
  ('00000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 3);
do $$ begin
  insert into public.marketplace_orders(business_id, buyer_id, product_id, total_amount, item_count)
  values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000009', null, 5, 5);
  raise exception 'TEST FAILED: a tampered cart total was accepted';
exception when raise_exception then
  if sqlerrm not like 'KUNTHAI_ORDER_PRICE_CHANGED%' then raise; end if;
end $$;
insert into public.marketplace_orders(business_id, buyer_id, product_id, total_amount, item_count)
values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000009', null, 130.000000001, 5);
select test_assert((select total_amount = 130 from public.marketplace_orders where product_id is null and item_count = 5), 'a correct cart total is stored exactly');

-- 9. A purchase notification cannot be inserted twice.
insert into public.platform_notifications(user_id, notification_type, action_target)
values ('00000000-0000-4000-8000-000000000009', 'visibility_credit_purchase', 'visibility-credit-purchase:p1');
do $$ begin
  insert into public.platform_notifications(user_id, notification_type, action_target)
  values ('00000000-0000-4000-8000-000000000009', 'visibility_credit_purchase', 'visibility-credit-purchase:p1');
  raise exception 'TEST FAILED: duplicate purchase notification';
exception when unique_violation then null;
end $$;

-- 11. One failing subscription does not undo the others; a withdrawn plan never
--     leaves a paid plan with a NULL period end.
select set_config('test.user_id', '', false);
insert into public.wallet values ('00000000-0000-4000-8000-000000000010', 1000);
insert into public.kunthai_business_subscriptions(id, surface, plan_code, status, auto_renew, payer_user_id, current_period_start, current_period_end, pending_plan_code) values
  ('30000000-0000-4000-8000-000000000bad', 'urmall', 'pro', 'active', true, '00000000-0000-4000-8000-000000000010', now() - interval '31 days', now() - interval '1 hour', null),
  ('30000000-0000-4000-8000-000000000001', 'urmall', 'pro', 'active', true, '00000000-0000-4000-8000-000000000010', now() - interval '30 days', now() - interval '10 minutes', null),
  -- Scheduled move to a withdrawn plan: keeps renewing Pro.
  ('30000000-0000-4000-8000-000000000002', 'urmall', 'pro', 'active', true, '00000000-0000-4000-8000-000000000010', now() - interval '30 days', now() - interval '5 minutes', 'legacy'),
  -- On a withdrawn plan without auto-renew fallback: grace, period end kept.
  ('30000000-0000-4000-8000-000000000003', 'urmall', 'legacy', 'active', true, '00000000-0000-4000-8000-000000000010', now() - interval '30 days', now() - interval '5 minutes', null);
select process_kunthai_business_subscriptions();
select test_assert((select (process_kunthai_business_subscriptions() ->> 'failed')::integer = 1), 'the failing subscription is counted, not fatal');
select test_assert((select status = 'active' and current_period_end > now() + interval '29 days'
  from public.kunthai_business_subscriptions where id = '30000000-0000-4000-8000-000000000001'), 'the other renewal committed');
select test_assert((select current_period_end < now() from public.kunthai_business_subscriptions where id = '30000000-0000-4000-8000-000000000bad'), 'the failing row is unchanged');
select test_assert((select plan_code = 'pro' and status = 'active' and current_period_end > now() + interval '29 days' and pending_plan_code is null
  from public.kunthai_business_subscriptions where id = '30000000-0000-4000-8000-000000000002'), 'a withdrawn scheduled plan renews the current plan');
select test_assert((select plan_code = 'legacy' and status = 'grace' and current_period_end is not null
  from public.kunthai_business_subscriptions where id = '30000000-0000-4000-8000-000000000003'), 'a withdrawn current plan goes to grace, never a NULL end');
select test_assert((select count(*) = 0 from public.kunthai_business_subscriptions where plan_code <> 'free' and current_period_end is null), 'no paid plan without a period end');

-- The migration is idempotent.
\ir ../migrations/20261008120000_urmall_promotion_pricing_fixes.sql

select 'urmall promotion pricing fixes: all assertions passed' as result;
