-- Run ONLY against the disposable urmall_plan_limits_test database:
-- psql -h /tmp -p 55432 -U pgtest -d urmall_plan_limits_test -v ON_ERROR_STOP=1 -f supabase/tests/urmall_plan_limits_2026.sql
--
-- Loads the REAL expiry/retention migration (capacity guard, inventory view,
-- visibility policy, entitlement wrapper) and the REAL plan-fairness
-- migration, seeds "production" data with the old limits and prices, then
-- applies 20261010100000_urmall_plan_limits_2026.sql twice.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'urmall_plan_limits_test' then raise exception 'This fixture requires the disposable urmall_plan_limits_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'service_role') $$;
grant usage on schema auth, public to anon, authenticated, service_role;

-- ---------- Schema stand-ins (columns the migrations use) ----------
create table public.marketplace_businesses(id uuid primary key, user_id uuid, business_name text, business_kind text);
create table public.marketplace_business_admins(id uuid primary key default gen_random_uuid(), business_id uuid, user_id uuid, status text, responsibilities jsonb default '{}');
create table public.kunthai_business_plans(
  surface text not null, plan_code text not null, display_name text not null,
  credit_cost integer not null default 0, duration_days integer not null default 30, grace_days integer not null default 7,
  product_limit integer, operator_limit integer, vehicle_limit integer, admin_limit integer,
  features jsonb not null default '[]'::jsonb, sort_order integer not null default 0, active boolean not null default true,
  updated_at timestamptz not null default now(), yearly_credit_cost integer, yearly_duration_days integer, business_type_limit integer,
  primary key (surface, plan_code));
-- Production values before this change (20260820130000 + yearly billing + business types).
insert into public.kunthai_business_plans(surface, plan_code, display_name, credit_cost, product_limit, operator_limit, vehicle_limit, admin_limit, features, sort_order, yearly_credit_cost, yearly_duration_days, business_type_limit) values
  ('urmall','free','Free',0,10,null,null,0,'["10 active products","Seller dashboard","Customer messages","Store analytics"]',1,0,365,1),
  ('urmall','pro','Pro',30,50,null,null,1,'["50 active products","1 business admin","Advanced product insights","Priority store tools"]',2,300,365,2),
  ('urmall','premium','Premium',75,null,null,null,5,'["Unlimited active products","Up to 5 business admins","Full business insights","Premium store tools"]',3,750,365,4),
  ('urride','free','Free',0,null,5,5,0,'["5 company operators","5 registered vehicles","Fleet workspace","Ride activity"]',1,0,365,null),
  ('urride','pro','Pro',40,null,15,15,1,'["15 company operators","15 registered vehicles","1 company admin","Advanced fleet tools"]',2,400,365,null),
  ('urride','premium','Premium',100,null,50,50,5,'["50 company operators","50 registered vehicles","Up to 5 company admins","Operator capacity packs"]',3,1000,365,null);
create table public.plan_audit(changed_at timestamptz default clock_timestamp());
create function public.plan_audit_trigger() returns trigger language plpgsql as $$ begin insert into public.plan_audit default values; return new; end $$;
create trigger plan_audit after update on public.kunthai_business_plans for each row execute function public.plan_audit_trigger();

create table public.kunthai_business_subscriptions(id uuid primary key default gen_random_uuid(), surface text, marketplace_business_id uuid references public.marketplace_businesses(id), transport_company_id uuid,
  plan_code text, status text, auto_renew boolean default false, payer_user_id uuid, current_period_start timestamptz, current_period_end timestamptz, grace_ends_at timestamptz,
  pending_plan_code text, pending_billing_interval text, billing_interval text default 'monthly', operator_pack_count integer default 0,
  reminder_7_sent boolean default false, reminder_3_sent boolean default false, reminder_1_sent boolean default false, grace_notice_sent boolean default false, updated_at timestamptz default now());
create table public.kunthai_business_subscription_events(subscription_id uuid, event_type text, from_plan_code text, to_plan_code text, actor_user_id uuid, metadata jsonb, credits integer);
create table public.marketplace_products(id uuid primary key default gen_random_uuid(), business_id uuid references public.marketplace_businesses(id), name text, main_image_url text,
  status text, published_at timestamptz, created_at timestamptz default now());
create table public.marketplace_restaurant_menu_items(id uuid primary key default gen_random_uuid(), business_id uuid references public.marketplace_businesses(id), name text, image_url text,
  day_of_week smallint not null default 1 check (day_of_week between 0 and 6), available boolean not null default true,
  available_everyday boolean not null default true, available_days smallint[] not null default '{}', price numeric default 1,
  promoted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.marketplace_property_listings(id uuid primary key default gen_random_uuid(), business_id uuid references public.marketplace_businesses(id), title text, image_urls text[],
  published boolean default true, created_at timestamptz default now());
create table public.wallet(user_id uuid primary key, balance integer);
create table public.debits(user_id uuid, amount integer, metadata jsonb);
create table public.test_notices(user_id uuid, group_key text, body text);

-- ---------- External dependencies ----------
create function public.kunthai_business_user_can_manage(text, uuid, uuid default auth.uid(), boolean default false) returns boolean language sql stable security definer as $$
  select exists(select 1 from public.marketplace_businesses where id = $2 and user_id = $3)
    or exists(select 1 from public.marketplace_business_admins where business_id = $2 and user_id = $3 and status = 'accepted') $$;
create function public.kunthai_subscription_notify(p_user_id uuid, p_group_key text, p_message text, p_priority text default 'normal') returns void language plpgsql as $$
begin
  if not exists(select 1 from public.test_notices where user_id = p_user_id and group_key = p_group_key) then
    insert into public.test_notices values(p_user_id, p_group_key, p_message);
  end if;
end $$;
create function public.kunthai_debit_subscription_credits(u uuid, amount integer, s text, sub uuid, meta jsonb) returns void language plpgsql as $$
begin
  if coalesce((select balance from public.wallet where user_id = u), 0) < amount then raise exception 'Not enough Visibility Credits.'; end if;
  update public.wallet set balance = balance - amount where user_id = u;
  insert into public.debits values (u, amount, meta);
end $$;
create function public.get_kunthai_business_subscription(s text, e uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.kunthai_send_subscription_reminders(id uuid) returns integer language sql as $$ select 0 $$;
create function public.kunthai_renew_subscription_row(id uuid) returns text language sql as $$ select 'unchanged'::text $$;
create function public.process_kunthai_business_subscriptions() returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.kunthai_business_usage(text, uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
-- Admin workspace stand-in: the real function's UrMall shape.
create function public.admin_get_user_workspace_v2(target_user_id uuid) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('user', jsonb_build_object('id', target_user_id),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.business_name, 'product_count',
        (select count(*) from public.marketplace_products p where p.business_id = b.id)) order by b.business_name)
      from public.marketplace_businesses b where b.user_id = target_user_id), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'surface', s.surface, 'entity_id', s.marketplace_business_id,
        'usage', jsonb_build_object('product_count', 0)) order by s.id)
      from public.kunthai_business_subscriptions s join public.marketplace_businesses b on b.id = s.marketplace_business_id
      where b.user_id = target_user_id), '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('id', 'urride-sub', 'surface', 'urride', 'entity_id', 'not-a-uuid', 'usage', jsonb_build_object('fleet_count', 3))))
$$;

-- Real definitions copied from 20260820140000 and 20260820130000.
create function public.kunthai_raise_capacity_limit(p_surface text, p_resource text, p_current integer, p_limit integer, p_plan text)
returns void language plpgsql set search_path = public as $$
begin
  raise exception 'KUNTHAI_PLAN_LIMIT|%|%|%|%|%',
    lower(p_surface), lower(p_resource), coalesce(p_current, 0), coalesce(p_limit, 0), lower(p_plan)
    using errcode = 'P0001', hint = 'Open Plans & capacity in the business dashboard to upgrade.';
end $$;
create function public.kunthai_business_effective_entitlement(p_surface text, p_entity_id uuid)
returns table (plan_code text, plan_name text, product_limit integer, operator_limit integer, vehicle_limit integer, admin_limit integer, status text, operator_pack_count integer)
language plpgsql security definer stable set search_path = public as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_plan_code text := 'free';
  v_status text := 'active';
  v_pack_count integer := 0;
  v_grace_days integer := 7;
begin
  select * into v_subscription from public.kunthai_business_subscriptions subscription
  where subscription.surface = lower(p_surface)
    and coalesce(subscription.marketplace_business_id, subscription.transport_company_id) = p_entity_id
  limit 1;
  if v_subscription.id is not null then
    select plan.grace_days into v_grace_days from public.kunthai_business_plans plan
    where plan.surface = v_subscription.surface and plan.plan_code = v_subscription.plan_code;
    if v_subscription.plan_code = 'free' then
      v_plan_code := 'free';
      v_status := coalesce(v_subscription.status, 'active');
    elsif v_subscription.status in ('active', 'grace')
      and (v_subscription.current_period_end is null
        or timezone('utc', now()) <= coalesce(v_subscription.grace_ends_at,
          v_subscription.current_period_end + make_interval(days => coalesce(v_grace_days, 7)))) then
      v_plan_code := v_subscription.plan_code;
      v_status := case when v_subscription.current_period_end is not null
        and timezone('utc', now()) > v_subscription.current_period_end then 'grace' else v_subscription.status end;
      v_pack_count := case when v_subscription.plan_code = 'premium' then coalesce(v_subscription.operator_pack_count, 0) else 0 end;
    else
      v_plan_code := 'free';
      v_status := 'expired';
    end if;
  end if;
  return query
  select plan.plan_code, plan.display_name, plan.product_limit,
    case when plan.operator_limit is null then null else plan.operator_limit + (v_pack_count * 10) end,
    plan.vehicle_limit, plan.admin_limit, v_status, v_pack_count
  from public.kunthai_business_plans plan
  where plan.surface = lower(p_surface) and plan.plan_code = v_plan_code;
end $$;

\ir ../migrations/20260905130000_urmall_expiry_retention.sql
\ir ../migrations/20261007170000_business_plan_fairness.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
-- Runs a statement that must be refused with the given KUNTHAI_PLAN_LIMIT prefix.
create function public.test_refused(statement text, expected text, message text) returns void language plpgsql as $$
declare v_error text;
begin
  begin
    execute statement;
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null then raise exception 'TEST FAILED (accepted): %', message; end if;
  if position(expected in v_error) <> 1 then raise exception 'TEST FAILED (%): %', v_error, message; end if;
end $$;

-- ---------- Existing ("production") data, saved under the OLD limits ----------
insert into public.marketplace_businesses values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Retail Eight', 'retail'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'Seven Day Kitchen', 'restaurant'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'Premium Shop', 'retail'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'Six Homes', 'property_agent'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005', 'New Vendor', 'vendor'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000006', 'New Kitchen', 'restaurant'),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000007', 'Pro Shop', 'retail'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000008', 'Premium Renewing', 'retail'),
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000009', 'Expired Pro', 'retail'),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'Premium Yearly Switch', 'retail'),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000000b', 'Pro To Premium', 'retail'),
  ('b0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000000c', 'Pro Kitchen', 'restaurant');

-- Retail Eight: 8 active products and a draft on Free.
insert into public.marketplace_products(business_id, name, status, published_at)
select 'b0000000-0000-4000-8000-000000000001', 'P' || n, 'active', now() - make_interval(days => n) from generate_series(1, 8) n;
insert into public.marketplace_products(id, business_id, name, status) values ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Draft', 'draft');
-- Seven Day Kitchen: an every-day meal and a Mon/Tue meal on Free.
insert into public.marketplace_restaurant_menu_items(id, business_id, name, available_everyday, available_days, day_of_week) values
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'Rice', true, '{}', 1),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Soup', false, '{1,2}', 1);
-- Premium Shop: Premium monthly, 20 days left, 12 products.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end) values
  ('c0000000-0000-4000-8000-000000000003', 'urmall', 'b0000000-0000-4000-8000-000000000003', 'premium', 'active', true, 'a0000000-0000-4000-8000-000000000003', 'monthly', now() - interval '10 days', now() + interval '20 days');
insert into public.marketplace_products(business_id, name, status) select 'b0000000-0000-4000-8000-000000000003', 'P' || n, 'active' from generate_series(1, 12) n;
-- Six Homes: 6 published properties on Free.
insert into public.marketplace_property_listings(business_id, title) select 'b0000000-0000-4000-8000-000000000004', 'H' || n from generate_series(1, 6) n;
-- Pro Shop: Pro monthly.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end) values
  ('c0000000-0000-4000-8000-000000000007', 'urmall', 'b0000000-0000-4000-8000-000000000007', 'pro', 'active', true, 'a0000000-0000-4000-8000-000000000007', 'monthly', now() - interval '1 day', now() + interval '29 days');
-- Premium Renewing: Premium monthly ending in 30 minutes, auto-renew.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end) values
  ('c0000000-0000-4000-8000-000000000008', 'urmall', 'b0000000-0000-4000-8000-000000000008', 'premium', 'active', true, 'a0000000-0000-4000-8000-000000000008', 'monthly',
    date_trunc('second', now()) - interval '30 days' + interval '30 minutes', date_trunc('second', now()) + interval '30 minutes');
-- Expired Pro: paid plan ended (renewal job not run yet), 12 products published while on Pro.
alter table public.marketplace_products disable trigger user;
insert into public.marketplace_products(business_id, name, status, published_at)
select 'b0000000-0000-4000-8000-000000000009', 'P' || n, 'active', now() - make_interval(days => n) from generate_series(1, 12) n;
alter table public.marketplace_products enable trigger user;
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end) values
  ('c0000000-0000-4000-8000-000000000009', 'urmall', 'b0000000-0000-4000-8000-000000000009', 'pro', 'active', false, 'a0000000-0000-4000-8000-000000000009', 'monthly', now() - interval '31 days', now() - interval '1 day');
-- Premium Yearly Switch: Premium monthly, half the month left.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end) values
  ('c0000000-0000-4000-8000-00000000000a', 'urmall', 'b0000000-0000-4000-8000-00000000000a', 'premium', 'active', true, 'a0000000-0000-4000-8000-00000000000a', 'monthly', now() - interval '15 days', now() + interval '15 days');
-- Pro To Premium: Pro monthly, half the month left.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end) values
  ('c0000000-0000-4000-8000-00000000000b', 'urmall', 'b0000000-0000-4000-8000-00000000000b', 'pro', 'active', true, 'a0000000-0000-4000-8000-00000000000b', 'monthly', now() - interval '15 days', now() + interval '15 days');
-- Pro Kitchen: Pro restaurant.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end) values
  ('c0000000-0000-4000-8000-00000000000c', 'urmall', 'b0000000-0000-4000-8000-00000000000c', 'pro', 'active', true, 'a0000000-0000-4000-8000-00000000000c', 'monthly', now() - interval '1 day', now() + interval '29 days');
insert into public.wallet select user_id, 10000 from public.marketplace_businesses;

create temp table before_change as
  select (select count(*) from public.marketplace_products) as products,
         (select count(*) from public.marketplace_restaurant_menu_items) as meals,
         (select count(*) from public.marketplace_property_listings) as properties,
         (select jsonb_agg(to_jsonb(s) order by s.id) from public.kunthai_business_subscriptions s) as subscriptions;

-- ---------- The migration, twice ----------
\ir ../migrations/20261010100000_urmall_plan_limits_2026.sql
\ir ../migrations/20261010100000_urmall_plan_limits_2026.sql

-- 1. Catalogue.
select test_assert((select product_limit = 5 and meal_day_limit = 5 and credit_cost = 0 and admin_limit = 0
  from public.kunthai_business_plans where surface = 'urmall' and plan_code = 'free'), 'Free: 5 listings, 5 meal days');
select test_assert((select product_limit = 30 and meal_day_limit is null and credit_cost = 30 and yearly_credit_cost = 300 and admin_limit = 1
  from public.kunthai_business_plans where surface = 'urmall' and plan_code = 'pro'), 'Pro: 30 listings, price unchanged');
select test_assert((select product_limit is null and meal_day_limit is null and credit_cost = 100 and yearly_credit_cost = 1000 and admin_limit = 5
  from public.kunthai_business_plans where surface = 'urmall' and plan_code = 'premium'), 'Premium: unlimited at 100 / 1000');
select test_assert((select features ->> 0 = '5 active products, meals or properties' and features ? 'Restaurant meals on up to 5 days a week'
  from public.kunthai_business_plans where surface = 'urmall' and plan_code = 'free'), 'Free features describe 5 listings and 5 meal days');
select test_assert((select features ->> 0 = 'Up to 30 active products, meals or properties' from public.kunthai_business_plans where surface = 'urmall' and plan_code = 'pro'), 'Pro features');
select test_assert((select features ->> 0 = 'Unlimited active products, meals or properties' from public.kunthai_business_plans where surface = 'urmall' and plan_code = 'premium'), 'Premium features');
select test_assert((select count(*) = 3 from public.kunthai_business_plans where surface = 'urride'
  and ((plan_code = 'free' and credit_cost = 0 and operator_limit = 5 and vehicle_limit = 5 and features ->> 0 = '5 company operators')
    or (plan_code = 'pro' and credit_cost = 40 and yearly_credit_cost = 400 and operator_limit = 15)
    or (plan_code = 'premium' and credit_cost = 100 and yearly_credit_cost = 1000 and operator_limit = 50))
  and meal_day_limit is null and product_limit is null), 'UrRide plans unchanged');
select test_assert((select count(*) = 0 from public.plan_audit), 'user triggers on the plan table were disabled for the backfill');
select test_assert((select tgenabled = 'O' from pg_trigger where tgname = 'plan_audit'), 'plan table triggers are enabled again');

-- 2. Nothing existing was deleted, hidden or changed.
select test_assert((select products = (select count(*) from public.marketplace_products)
  and meals = (select count(*) from public.marketplace_restaurant_menu_items)
  and properties = (select count(*) from public.marketplace_property_listings)
  and subscriptions = (select jsonb_agg(to_jsonb(s) order by s.id) from public.kunthai_business_subscriptions s) from before_change), 'no listing or subscription changed');
select set_config('test.user_id', '', false);
select test_assert((select count(*) = 8 from public.marketplace_products where business_id = 'b0000000-0000-4000-8000-000000000001' and status = 'active'
  and public.kunthai_urmall_inventory_is_visible(business_id, id)), 'a Free seller above 5 keeps all 8 products visible');
select test_assert((select count(*) = 6 from public.marketplace_property_listings where business_id = 'b0000000-0000-4000-8000-000000000004'
  and public.kunthai_urmall_inventory_is_visible(business_id, id)), 'a Free agent above 5 keeps all 6 properties visible');
select test_assert((select count(*) = 2 from public.marketplace_restaurant_menu_items where business_id = 'b0000000-0000-4000-8000-000000000002'
  and public.kunthai_urmall_inventory_is_visible(business_id, id)), 'grandfathered restaurant meals stay visible');
select test_assert((select count(*) = 12 from public.marketplace_products where business_id = 'b0000000-0000-4000-8000-000000000003'
  and public.kunthai_urmall_inventory_is_visible(business_id, id)), 'Premium listings stay visible');
-- An expired paid plan still keeps TEN (not five) visible: retention did not change.
select test_assert((select count(*) = 10 from public.marketplace_products where business_id = 'b0000000-0000-4000-8000-000000000009'
  and public.kunthai_urmall_inventory_is_visible(business_id, id)), 'expiry retention still keeps ten listings visible');

-- 3. Grandfathered Free seller: edits allowed, additions refused until under 5.
update public.marketplace_products set name = 'Renamed' where business_id = 'b0000000-0000-4000-8000-000000000001' and name = 'P1';
update public.marketplace_products set status = 'paused' where business_id = 'b0000000-0000-4000-8000-000000000001' and name = 'P2';
update public.marketplace_products set status = 'active' where business_id = 'b0000000-0000-4000-8000-000000000001' and name = 'P2';
select test_refused($$insert into public.marketplace_products(business_id, name, status) values ('b0000000-0000-4000-8000-000000000001', 'New', 'active')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|8|5|free', 'a Free seller above the limit cannot add a product');
select test_refused($$update public.marketplace_products set status = 'active' where id = 'd0000000-0000-4000-8000-000000000001'$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|8|5|free', 'a Free seller above the limit cannot publish a draft');
insert into public.marketplace_products(business_id, name, status) values ('b0000000-0000-4000-8000-000000000001', 'Another draft', 'draft');
delete from public.marketplace_products where business_id = 'b0000000-0000-4000-8000-000000000001' and name in ('P3', 'P4', 'P5', 'P6');
update public.marketplace_products set status = 'active' where id = 'd0000000-0000-4000-8000-000000000001';
select test_refused($$insert into public.marketplace_products(business_id, name, status) values ('b0000000-0000-4000-8000-000000000001', 'Sixth', 'active')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|5|5|free', 'back at 5 the sixth product is refused');

-- 4. Every business kind counts against the same 5.
insert into public.marketplace_products(business_id, name, status) select 'b0000000-0000-4000-8000-000000000005', 'V' || n, 'active' from generate_series(1, 5) n;
select test_refused($$insert into public.marketplace_products(business_id, name, status) values ('b0000000-0000-4000-8000-000000000005', 'V6', 'active')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|5|5|free', 'vendor products are limited to 5 on Free');
select test_refused($$insert into public.marketplace_property_listings(business_id, title) values ('b0000000-0000-4000-8000-000000000004', 'H7')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|6|5|free', 'properties are limited to 5 on Free');
insert into public.marketplace_property_listings(business_id, title, published) values ('b0000000-0000-4000-8000-000000000004', 'Unpublished', false);
select test_refused($$update public.marketplace_property_listings set published = true where title = 'Unpublished'$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|6|5|free', 'an unpublished property cannot be published above the limit');
insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days)
select 'b0000000-0000-4000-8000-000000000006', 'M' || n, false, array[1]::smallint[] from generate_series(1, 5) n;
select test_refused($$insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days) values ('b0000000-0000-4000-8000-000000000006', 'M6', false, '{1}')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|5|5|free', 'restaurant meals are limited to 5 on Free');

-- 5. Pro holds 30, Premium is unlimited.
insert into public.marketplace_products(business_id, name, status) select 'b0000000-0000-4000-8000-000000000007', 'P' || n, 'active' from generate_series(1, 30) n;
select test_refused($$insert into public.marketplace_products(business_id, name, status) values ('b0000000-0000-4000-8000-000000000007', 'P31', 'active')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|30|30|pro', 'Pro is limited to 30');
insert into public.marketplace_products(business_id, name, status) select 'b0000000-0000-4000-8000-000000000003', 'More' || n, 'active' from generate_series(1, 40) n;
select test_assert((select count(*) = 52 from public.marketplace_products where business_id = 'b0000000-0000-4000-8000-000000000003'), 'Premium adds without a limit');

-- 6. Meal days on Free (New Kitchen holds 5 Monday meals from step 4).
delete from public.marketplace_restaurant_menu_items where business_id = 'b0000000-0000-4000-8000-000000000006';
select test_refused($$insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday) values ('b0000000-0000-4000-8000-000000000006', 'Daily', true)$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|7|5|free', 'an every-day meal needs Pro on Free');
select test_refused($$insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days) values ('b0000000-0000-4000-8000-000000000006', 'Six', false, '{0,1,2,3,4,5}')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|6|5|free', 'a six-day meal is refused on Free');
insert into public.marketplace_restaurant_menu_items(id, business_id, name, available_everyday, available_days) values
  ('e0000000-0000-4000-8000-000000000061', 'b0000000-0000-4000-8000-000000000006', 'A', false, '{1,2,3}'),
  ('e0000000-0000-4000-8000-000000000062', 'b0000000-0000-4000-8000-000000000006', 'B', false, '{4,5}');
select test_refused($$insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days) values ('b0000000-0000-4000-8000-000000000006', 'C', false, '{6}')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|6|5|free', 'a sixth restaurant day is refused on Free');
insert into public.marketplace_restaurant_menu_items(id, business_id, name, available_everyday, available_days) values
  ('e0000000-0000-4000-8000-000000000063', 'b0000000-0000-4000-8000-000000000006', 'C', false, '{1,5}');
select test_refused($$update public.marketplace_restaurant_menu_items set available_days = '{1,5,0}' where id = 'e0000000-0000-4000-8000-000000000063'$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|6|5|free', 'editing a meal cannot add a sixth day');
select test_refused($$update public.marketplace_restaurant_menu_items set available_everyday = true where id = 'e0000000-0000-4000-8000-000000000063'$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|7|5|free', 'editing a meal cannot make it every day');
-- Moving a day is fine while the restaurant stays within 5.
update public.marketplace_restaurant_menu_items set available_days = '{4}' where id = 'e0000000-0000-4000-8000-000000000062';
update public.marketplace_restaurant_menu_items set available_days = '{1,6}' where id = 'e0000000-0000-4000-8000-000000000063';
select test_assert((select count(distinct day) = 5 from public.marketplace_restaurant_menu_items m,
  unnest(public.kunthai_urmall_meal_days(m.available_everyday, m.available_days, m.day_of_week)) day where m.business_id = 'b0000000-0000-4000-8000-000000000006'), 'restaurant uses exactly 5 days');
-- Hiding/showing and the app's full-row save never trip the limit.
update public.marketplace_restaurant_menu_items set available = false where id = 'e0000000-0000-4000-8000-000000000061';
update public.marketplace_restaurant_menu_items set available = true where id = 'e0000000-0000-4000-8000-000000000061';
update public.marketplace_restaurant_menu_items set name = 'A2', available_everyday = false, available_days = '{1,2,3}', day_of_week = 1 where id = 'e0000000-0000-4000-8000-000000000061';
-- The legacy single-day form (no available_days) counts its day_of_week.
select test_refused($$insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days, day_of_week) values ('b0000000-0000-4000-8000-000000000006', 'Legacy', false, '{}', 5)$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|6|5|free', 'a legacy single-day meal on a sixth day is refused');
delete from public.marketplace_restaurant_menu_items where id = 'e0000000-0000-4000-8000-000000000063';
insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days, day_of_week) values ('b0000000-0000-4000-8000-000000000006', 'Legacy', false, '{}', 5);
-- The error explains itself in English.
do $$
declare v_detail text;
begin
  begin
    insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days) values ('b0000000-0000-4000-8000-000000000006', 'Sunday', false, '{0}');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform public.test_assert(v_detail like 'On the Free plan a restaurant can serve meals on at most 5 days of the week.%', 'restaurant day error explains the limit: ' || coalesce(v_detail, 'none'));
end $$;

-- 7. Grandfathered seven-day restaurant on Free keeps its days.
update public.marketplace_restaurant_menu_items set name = 'Rice 2', price = 3, available_everyday = true, available_days = '{}' where id = 'e0000000-0000-4000-8000-000000000001';
update public.marketplace_restaurant_menu_items set available = false where id = 'e0000000-0000-4000-8000-000000000001';
update public.marketplace_restaurant_menu_items set available = true where id = 'e0000000-0000-4000-8000-000000000001';
-- A new meal on days the restaurant already serves (within 5 per meal) is fine.
insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days) values ('b0000000-0000-4000-8000-000000000002', 'Weekend', false, '{0,6}');
select test_refused($$insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday) values ('b0000000-0000-4000-8000-000000000002', 'Daily 2', true)$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|7|5|free', 'a new every-day meal is refused on Free even for a seven-day restaurant');
-- Narrowing the every-day meal to six days keeps the restaurant's days.
update public.marketplace_restaurant_menu_items set available_everyday = false, available_days = '{0,1,2,3,4,5}' where id = 'e0000000-0000-4000-8000-000000000001';
select test_refused($$update public.marketplace_restaurant_menu_items set available_days = '{0,1,2,3,4,6}' where id = 'e0000000-0000-4000-8000-000000000001'$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|6|5|free', 'a grandfathered six-day meal cannot swap in a day it did not have');
-- Once the restaurant drops to 5 days it cannot grow again on Free.
update public.marketplace_restaurant_menu_items set available_days = '{1,2,3}' where id = 'e0000000-0000-4000-8000-000000000001';
delete from public.marketplace_restaurant_menu_items where name = 'Weekend';
insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days) values ('b0000000-0000-4000-8000-000000000002', 'Stew', false, '{4,5}');
select test_refused($$update public.marketplace_restaurant_menu_items set available_days = '{1,2,6}' where id = 'e0000000-0000-4000-8000-000000000002'$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|6|5|free', 'a restaurant back at 5 days cannot add a sixth again on Free');

-- 8. Pro restaurants serve every day; an expired Pro falls back to 5 days.
insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday) select 'b0000000-0000-4000-8000-00000000000c', 'Daily ' || n, true from generate_series(1, 6) n;
update public.kunthai_business_subscriptions set current_period_end = now() - interval '1 minute' where id = 'c0000000-0000-4000-8000-00000000000c';
select test_refused($$insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days) values ('b0000000-0000-4000-8000-00000000000c', 'After expiry', false, '{1}')$$,
  'KUNTHAI_PLAN_LIMIT|urmall|products|6|5|free', 'an expired Pro restaurant is back on Free limits');
delete from public.marketplace_restaurant_menu_items where business_id = 'b0000000-0000-4000-8000-00000000000c' and name in ('Daily 1', 'Daily 2', 'Daily 3');
-- Its six existing every-day meals are kept; a new meal on those days is fine, but not every day.
insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday, available_days) values ('b0000000-0000-4000-8000-00000000000c', 'Weekdays', false, '{1,2,3,4,5}');
select test_refused($$insert into public.marketplace_restaurant_menu_items(business_id, name, available_everyday) values ('b0000000-0000-4000-8000-00000000000c', 'Daily new', true)$$,
  'KUNTHAI_PLAN_LIMIT|urmall|meal_days|7|5|free', 'an every-day meal needs an active Pro plan');

-- 9. Prices: the current Premium period keeps its price, renewals use the new one.
select test_assert((select count(*) = 3 and bool_and(credit_cost = 75 and yearly_credit_cost = 750) from public.kunthai_business_plan_price_locks), 'running Premium periods were locked at 75 / 750');
select test_assert((select current_period_end - current_period_start = interval '30 days' and plan_code = 'premium'
  from public.kunthai_business_subscriptions where id = 'c0000000-0000-4000-8000-000000000003'), 'the running Premium period is untouched');
select test_assert((select count(*) = 3 from public.test_notices where group_key like '%:premium-price-2026-10'
  and body like '%the UrMall Premium price is now 100 Visibility Credits a month or 1000 a year. Your current paid period is not affected%'), 'each Premium payer is told once');
select test_assert(public.kunthai_business_current_period_cost('c0000000-0000-4000-8000-000000000003', 'monthly') = 75, 'the running period is valued at 75');
select test_assert(public.kunthai_business_current_period_cost('c0000000-0000-4000-8000-000000000007', 'monthly') = 30, 'Pro is valued at 30');
-- Premium monthly -> Premium yearly: the unused half month is credited at the 75 paid.
select set_config('test.user_id', 'a0000000-0000-4000-8000-00000000000a', false);
select change_kunthai_business_plan('urmall', 'b0000000-0000-4000-8000-00000000000a', 'premium', true, 'yearly');
select test_assert((select amount between 1000 - 38 and 1000 - 37 from public.debits where user_id = 'a0000000-0000-4000-8000-00000000000a'), 'yearly Premium costs 1000 less the unused 75-credit half month');
select test_assert(public.kunthai_business_current_period_cost('c0000000-0000-4000-8000-00000000000a', 'yearly') = 1000, 'the new yearly period is valued at the new price');
-- Pro -> Premium mid-term pays the new difference (100 - 30) for the time left.
select set_config('test.user_id', 'a0000000-0000-4000-8000-00000000000b', false);
select change_kunthai_business_plan('urmall', 'b0000000-0000-4000-8000-00000000000b', 'premium', true, 'monthly');
select test_assert((select amount between 35 and 36 from public.debits where user_id = 'a0000000-0000-4000-8000-00000000000b'), 'Pro to Premium charges the prorated 70-credit difference');
-- A new Premium subscription costs 100.
select set_config('test.user_id', 'a0000000-0000-4000-8000-000000000005', false);
select change_kunthai_business_plan('urmall', 'b0000000-0000-4000-8000-000000000005', 'premium', true, 'monthly');
select test_assert((select amount = 100 from public.debits where user_id = 'a0000000-0000-4000-8000-000000000005'), 'a new Premium month costs 100');
select set_config('test.user_id', 'a0000000-0000-4000-8000-000000000007', false);
select change_kunthai_business_plan('urmall', 'b0000000-0000-4000-8000-000000000007', 'pro', true, 'yearly');
select test_assert((select amount between 300 - 29 and 300 - 28 from public.debits where user_id = 'a0000000-0000-4000-8000-000000000007'), 'Pro yearly still costs 300');
-- The renewal of the locked period charges the new price, and the lock no longer applies.
select set_config('test.user_id', '', false);
select test_assert(public.kunthai_try_early_subscription_renewal('c0000000-0000-4000-8000-000000000008'), 'the Premium renewal ran');
select test_assert((select amount = 100 from public.debits where user_id = 'a0000000-0000-4000-8000-000000000008'), 'Premium renews at 100');
select test_assert(public.kunthai_business_current_period_cost('c0000000-0000-4000-8000-000000000008', 'monthly') = 100, 'after renewal the period is valued at 100');

-- 10. Admin workspace shows the listings that use the plan for every kind.
select test_assert((select (public.admin_get_user_workspace_v2('a0000000-0000-4000-8000-000000000004') -> 'businesses' -> 0 ->> 'plan_listing_count')::int = 6), 'admin sees 6 published properties');
select test_assert((select (public.admin_get_user_workspace_v2('a0000000-0000-4000-8000-000000000004') -> 'businesses' -> 0 ->> 'product_count')::int = 0), 'admin keeps the original fields');
select test_assert((select (public.admin_get_user_workspace_v2('a0000000-0000-4000-8000-000000000003') -> 'subscriptions' -> 0 -> 'usage' ->> 'plan_listing_count')::int = 52), 'admin subscription usage counts listings');
select test_assert((select public.admin_get_user_workspace_v2('a0000000-0000-4000-8000-000000000003') -> 'subscriptions' -> 1 = '{"id":"urride-sub","surface":"urride","entity_id":"not-a-uuid","usage":{"fleet_count":3}}'::jsonb), 'UrRide entries are left alone');
select test_assert(not has_function_privilege('authenticated', 'public.admin_get_user_workspace_v2_before_plan_limits_2026(uuid)', 'execute'), 'the inner workspace function is not callable directly');
select test_assert(has_function_privilege('authenticated', 'public.admin_get_user_workspace_v2(uuid)', 'execute') and not has_function_privilege('anon', 'public.admin_get_user_workspace_v2(uuid)', 'execute'), 'workspace grants unchanged');
select test_assert(not has_function_privilege('authenticated', 'public.kunthai_guard_urmall_meal_days()', 'execute'), 'meal day guard is not callable');

-- 11. A third run changes nothing and sends nothing new.
create temp table before_rerun as select (select count(*) from public.test_notices) as notices, (select count(*) from public.kunthai_business_plan_price_locks) as locks,
  (select jsonb_agg(to_jsonb(p) - 'updated_at' order by surface, plan_code) from public.kunthai_business_plans p) as plans;
\ir ../migrations/20261010100000_urmall_plan_limits_2026.sql
select test_assert((select notices = (select count(*) from public.test_notices) and locks = (select count(*) from public.kunthai_business_plan_price_locks)
  and plans = (select jsonb_agg(to_jsonb(p) - 'updated_at' order by surface, plan_code) from public.kunthai_business_plans p) from before_rerun), 're-running is a no-op');
select test_assert((select count(*) = 1 from pg_trigger where tgname = 'kunthai_guard_urmall_meal_days'), 'one meal day trigger');

select 'urmall plan limits 2026: all assertions passed' as result;
