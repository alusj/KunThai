-- Isolated PostgreSQL test database ONLY. Never run against a project database.
-- Load the real legacy renewal and entitlement functions from their migrations
-- after this fixture, then the retention migration and assertions.
create schema auth;
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'service_role') $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
create table public.marketplace_businesses(id uuid primary key, user_id uuid, business_name text, business_kind text);
create table public.marketplace_business_admins(id uuid primary key default gen_random_uuid(), business_id uuid, user_id uuid, status text, responsibilities jsonb default '{}');
create table public.transport_companies(id uuid primary key, company_name text);
create table public.kunthai_business_plans(surface text, plan_code text, display_name text, product_limit integer, operator_limit integer, vehicle_limit integer, admin_limit integer,
  grace_days integer default 7, active boolean default true, credit_cost integer default 30, yearly_credit_cost integer default 300, duration_days integer default 30, yearly_duration_days integer default 365);
insert into public.kunthai_business_plans(surface, plan_code, display_name, product_limit) values
('urmall','free','Free',10),('urmall','pro','Pro',50),('urmall','premium','Premium',null),('urride','free','Free',null),('urride','pro','Pro',null);
create table public.kunthai_business_subscriptions(id uuid primary key, surface text, marketplace_business_id uuid references public.marketplace_businesses(id), transport_company_id uuid,
  plan_code text, status text, auto_renew boolean default false, payer_user_id uuid, current_period_start timestamptz, current_period_end timestamptz, grace_ends_at timestamptz,
  pending_plan_code text, pending_billing_interval text, billing_interval text default 'monthly', operator_pack_count integer default 0,
  reminder_7_sent boolean default false, reminder_3_sent boolean default false, reminder_1_sent boolean default false, grace_notice_sent boolean default false, updated_at timestamptz default now());
create table public.kunthai_business_subscription_events(subscription_id uuid, event_type text, from_plan_code text, to_plan_code text, actor_user_id uuid, metadata jsonb, credits integer);
create table public.marketplace_products(id uuid primary key, business_id uuid references public.marketplace_businesses(id), name text, main_image_url text, status text, published_at timestamptz, created_at timestamptz default now());
create table public.marketplace_restaurant_menu_items(id uuid primary key, business_id uuid references public.marketplace_businesses(id), name text, image_url text, created_at timestamptz default now());
create table public.marketplace_property_listings(id uuid primary key, business_id uuid references public.marketplace_businesses(id), title text, image_urls text[], published boolean default true, created_at timestamptz default now());
create table public.marketplace_orders(id uuid primary key default gen_random_uuid(), product_id uuid references public.marketplace_products(id) on delete set null, total_amount numeric);
create table public.retention_test_notices(user_id uuid, group_key text, body text);
create function public.kunthai_business_user_can_manage(text, uuid, uuid default auth.uid(), boolean default false) returns boolean language sql stable security definer as $$
  select exists(select 1 from public.marketplace_businesses where id = $2 and user_id = $3)
    or exists(select 1 from public.marketplace_business_admins where business_id=$2 and user_id=$3 and status='accepted')
$$;
create function public.kunthai_subscription_notify(uuid, text, text, text default 'normal') returns void language sql as $$
  insert into public.retention_test_notices values($1,$2,$3)
$$;
create function public.kunthai_debit_subscription_credits(uuid, integer, text, uuid, jsonb) returns void language plpgsql as $$
begin
  if coalesce(current_setting('test.wallet_ready', true), 'false') <> 'true' then raise exception 'Not enough credits'; end if;
end $$;
create function public.process_kunthai_business_subscriptions() returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.kunthai_business_usage(text, uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.kunthai_raise_capacity_limit(text, text, integer, integer, text) returns void language plpgsql as $$
begin raise exception 'KUNTHAI_PLAN_LIMIT|%|%|%|%|%', $1,$2,$3,$4,$5; end $$;
alter table public.marketplace_products enable row level security;
alter table public.marketplace_restaurant_menu_items enable row level security;
alter table public.marketplace_property_listings enable row level security;
create policy "baseline products" on public.marketplace_products for select using(status <> 'draft' or public.kunthai_business_user_can_manage('urmall',business_id,auth.uid(),false));
create policy "baseline meals" on public.marketplace_restaurant_menu_items for select using(true);
create policy "baseline properties" on public.marketplace_property_listings for select using(published or public.kunthai_business_user_can_manage('urmall',business_id,auth.uid(),false));
grant select on public.marketplace_products, public.marketplace_restaurant_menu_items, public.marketplace_property_listings to anon, authenticated;
