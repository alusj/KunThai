-- Run ONLY against the disposable plan_fairness_test database:
-- psql -h /tmp -p 55432 -U pgtest -d plan_fairness_test -v ON_ERROR_STOP=1 -f supabase/tests/business_plan_fairness.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'plan_fairness_test' then raise exception 'This fixture requires the disposable plan_fairness_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'service_role') $$;

create table public.kunthai_business_plans(surface text, plan_code text, display_name text, grace_days integer default 7, active boolean default true,
  credit_cost integer, yearly_credit_cost integer, duration_days integer default 30, yearly_duration_days integer default 365);
insert into public.kunthai_business_plans(surface, plan_code, display_name, credit_cost, yearly_credit_cost) values
  ('urmall','free','Free',0,0),('urmall','pro','Pro',30,300),('urmall','premium','Premium',75,750);
create table public.kunthai_business_subscriptions(id uuid primary key default gen_random_uuid(), surface text, marketplace_business_id uuid, transport_company_id uuid,
  plan_code text, status text, auto_renew boolean default false, payer_user_id uuid, current_period_start timestamptz, current_period_end timestamptz, grace_ends_at timestamptz,
  pending_plan_code text, pending_billing_interval text, billing_interval text default 'monthly', operator_pack_count integer default 0,
  reminder_7_sent boolean default false, reminder_3_sent boolean default false, reminder_1_sent boolean default false, grace_notice_sent boolean default false, updated_at timestamptz default now());
create table public.kunthai_business_subscription_events(subscription_id uuid, event_type text, from_plan_code text, to_plan_code text, actor_user_id uuid, metadata jsonb, credits integer);
create table public.wallet(user_id uuid primary key, balance integer);
create table public.debits(user_id uuid, amount integer, metadata jsonb);

create function public.kunthai_business_user_can_manage(s text, e uuid, u uuid, billing boolean) returns boolean language sql as $$ select true $$;
create function public.get_kunthai_business_subscription(s text, e uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.kunthai_send_subscription_reminders(id uuid) returns integer language sql as $$ select 0 $$;
create function public.kunthai_renew_subscription_row(id uuid) returns text language sql as $$ select 'unchanged'::text $$;
create function public.kunthai_debit_subscription_credits(u uuid, amount integer, s text, sub uuid, meta jsonb) returns void language plpgsql as $$
begin
  if (select balance from public.wallet where user_id = u) < amount then raise exception 'Not enough Visibility Credits.'; end if;
  update public.wallet set balance = balance - amount where user_id = u;
  insert into public.debits values (u, amount, meta);
end $$;

\ir ../migrations/20261007170000_business_plan_fairness.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
insert into public.wallet values ('00000000-0000-4000-8000-000000000001', 10000), ('00000000-0000-4000-8000-000000000002', 5);
select set_config('test.user_id', '00000000-0000-4000-8000-000000000001', false);

-- 1. Yearly Pro, ~10 months left, chooses Premium monthly: stays yearly, keeps
--    the end date, pays the yearly difference for the time left.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, billing_interval, current_period_start, current_period_end)
values ('10000000-0000-4000-8000-000000000001', 'urmall', '20000000-0000-4000-8000-000000000001', 'pro', 'active', 'yearly',
  timezone('utc', now()) - interval '65 days', timezone('utc', now()) + interval '300 days');
select change_kunthai_business_plan('urmall', '20000000-0000-4000-8000-000000000001', 'premium', true, 'monthly');
select test_assert((select plan_code = 'premium' and billing_interval = 'yearly'
  and abs(extract(epoch from current_period_end - (timezone('utc', now()) + interval '300 days'))) < 60
  from public.kunthai_business_subscriptions where id = '10000000-0000-4000-8000-000000000001'), 'yearly upgrade keeps the yearly term and its end date');
select test_assert((select amount = ceil((750 - 300) * 300.0 / 365) from public.debits order by ctid desc limit 1), 'yearly upgrade charges only the prorated difference');

-- 2. Monthly Pro with half the month left moves to Pro yearly: new year from
--    now, the unused half month (15 credits) counts toward the 300.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, billing_interval, current_period_start, current_period_end)
values ('10000000-0000-4000-8000-000000000002', 'urmall', '20000000-0000-4000-8000-000000000002', 'pro', 'active', 'monthly',
  timezone('utc', now()) - interval '15 days', timezone('utc', now()) + interval '15 days');
select change_kunthai_business_plan('urmall', '20000000-0000-4000-8000-000000000002', 'pro', true, 'yearly');
select test_assert((select billing_interval = 'yearly' and current_period_end > timezone('utc', now()) + interval '364 days'
  from public.kunthai_business_subscriptions where id = '10000000-0000-4000-8000-000000000002'), 'monthly to yearly starts a new year');
select test_assert((select amount between 284 and 286 from public.debits order by ctid desc limit 1), 'the unused month is credited toward the yearly price');

-- 3. Monthly Pro -> Premium monthly mid-term: unchanged proration.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, billing_interval, current_period_start, current_period_end)
values ('10000000-0000-4000-8000-000000000003', 'urmall', '20000000-0000-4000-8000-000000000003', 'pro', 'active', 'monthly',
  timezone('utc', now()) - interval '15 days', timezone('utc', now()) + interval '15 days');
select change_kunthai_business_plan('urmall', '20000000-0000-4000-8000-000000000003', 'premium', true, 'monthly');
select test_assert((select amount between 22 and 23 from public.debits order by ctid desc limit 1), 'monthly upgrade still charges the prorated difference');

-- 4. Early renewal 30 minutes before the end, starting at the old end.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end)
values ('10000000-0000-4000-8000-000000000004', 'urmall', '20000000-0000-4000-8000-000000000004', 'pro', 'active', true, '00000000-0000-4000-8000-000000000001', 'monthly',
  date_trunc('second', timezone('utc', now())) - interval '30 days' + interval '30 minutes', date_trunc('second', timezone('utc', now())) + interval '30 minutes');
create temp table before4 as select current_period_end from public.kunthai_business_subscriptions where id = '10000000-0000-4000-8000-000000000004';
select set_config('test.user_id', '', false);
select process_kunthai_business_subscriptions();
select test_assert((select s.current_period_start = b.current_period_end and s.current_period_end = b.current_period_end + interval '30 days'
  from public.kunthai_business_subscriptions s, before4 b where s.id = '10000000-0000-4000-8000-000000000004'), 'early renewal starts the new term at the old end');

-- 5. Not enough credits: nothing changes early.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end)
values ('10000000-0000-4000-8000-000000000005', 'urmall', '20000000-0000-4000-8000-000000000005', 'pro', 'active', true, '00000000-0000-4000-8000-000000000002', 'monthly',
  timezone('utc', now()) - interval '30 days', timezone('utc', now()) + interval '30 minutes');
select process_kunthai_business_subscriptions();
select test_assert((select current_period_end < timezone('utc', now()) + interval '1 hour' from public.kunthai_business_subscriptions where id = '10000000-0000-4000-8000-000000000005'), 'without credits the plan is left for the regular renewal');

-- 6. A plan ending in two days is not touched.
insert into public.kunthai_business_subscriptions(id, surface, marketplace_business_id, plan_code, status, auto_renew, payer_user_id, billing_interval, current_period_start, current_period_end)
values ('10000000-0000-4000-8000-000000000006', 'urmall', '20000000-0000-4000-8000-000000000006', 'pro', 'active', true, '00000000-0000-4000-8000-000000000001', 'monthly',
  timezone('utc', now()) - interval '28 days', timezone('utc', now()) + interval '2 days');
select process_kunthai_business_subscriptions();
select test_assert((select current_period_end < timezone('utc', now()) + interval '3 days' from public.kunthai_business_subscriptions where id = '10000000-0000-4000-8000-000000000006'), 'a plan far from its end is not renewed early');

select 'business plan fairness: all assertions passed' as result;
