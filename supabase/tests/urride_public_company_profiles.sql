-- Run ONLY against an isolated disposable PostgreSQL database.
\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create schema auth;
create table auth.users(
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
grant usage on schema auth, public to anon, authenticated;

create function public.transport_company_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create table public.transport_companies(
  id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id),
  company_code text, company_name text, company_type text, phone text, email text,
  country text, city text, address text, operating_areas text[] default '{}', support_policy text,
  verification_status text, account_status text, updated_at timestamptz default now()
);
create table public.transport_company_fleets(
  id uuid primary key default gen_random_uuid(), company_id uuid references public.transport_companies(id),
  fleet_code text, service_category text, fleet_type text, fleet_name text, plate_number text,
  make text, model text, color text, verification_status text, active_status text,
  public_fleet_photos jsonb default '[]', updated_at timestamptz default now()
);
create table public.transport_operators(
  id uuid primary key default gen_random_uuid(), full_name text, display_code text, operator_code integer
);
create table public.transport_fleets(
  id uuid primary key default gen_random_uuid(), company_id uuid references public.transport_companies(id),
  company_fleet_id uuid references public.transport_company_fleets(id), operator_id uuid references public.transport_operators(id),
  active_status text, is_visible_to_passengers boolean default false,
  public_fleet_photos jsonb default '[]', updated_at timestamptz default now()
);
create table public.transport_trips(
  id uuid primary key default gen_random_uuid(), passenger_id uuid references auth.users(id),
  fleet_id uuid references public.transport_fleets(id), status text,
  completed_at timestamptz, updated_at timestamptz default now()
);
create table public.transport_operator_reviews(
  id uuid primary key default gen_random_uuid(), operator_id uuid references public.transport_operators(id), rating integer
);
create table public.transport_company_rentals(
  id uuid primary key default gen_random_uuid(), company_id uuid references public.transport_companies(id),
  company_fleet_id uuid references public.transport_company_fleets(id), title text, photos text[] default '{}',
  currency text, hourly_rate numeric, daily_rate numeric, weekly_rate numeric, pickup_address text,
  status text, updated_at timestamptz default now()
);

\ir ../migrations/20260906100000_urride_public_company_profiles.sql

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.invalid', '{"full_name":"Company owner"}'),
  ('00000000-0000-0000-0000-000000000002', 'passenger@example.invalid', '{"full_name":"Verified Rider"}'),
  ('00000000-0000-0000-0000-000000000003', 'operator@example.invalid', '{"full_name":"Fleet operator"}');

insert into public.transport_companies values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'KTC-00123', 'Green Road Transport', 'Transport company', '+23230000000', 'support@example.invalid', 'Sierra Leone', 'Freetown', 'Juba, Freetown', array['Freetown','Waterloo'], 'Contact support for company bookings.', 'verified', 'approved', now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'KTC-00999', 'Hidden Draft Transport', 'Transport company', '+23230000001', null, 'Sierra Leone', 'Freetown', null, '{}', null, 'pending', 'draft', now());

insert into public.transport_operators values
  ('20000000-0000-0000-0000-000000000001', 'Mariama Driver', 'KT-10001', 10001);
insert into public.transport_company_fleets values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'KTF-001', 'Ride only', 'Motorbike', 'Swift Bike', 'ABK-1', 'Honda', 'CB', 'Green', 'verified', 'active', '["https://example.invalid/bike.jpg"]', now()),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'KTF-002', 'Ride only', 'Taxi', 'City Taxi', 'ABK-2', 'Toyota', 'Corolla', 'White', 'verified', 'offline', '[]', now()),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'KTF-003', 'Rental', 'Van', 'Family Van', 'ABK-3', 'Toyota', 'Hiace', 'Silver', 'verified', 'offline', '[]', now());
insert into public.transport_fleets values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', true, '["https://example.invalid/runtime-bike.jpg"]', now()),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', null, 'offline', false, '[]', now());
insert into public.transport_operator_reviews(operator_id, rating) values
  ('20000000-0000-0000-0000-000000000001', 5),
  ('20000000-0000-0000-0000-000000000001', 4);
insert into public.transport_company_rentals values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Family Van', array['https://example.invalid/van.jpg'], 'SLE', null, 800, 4500, 'Juba pickup', 'available', now());
insert into public.transport_trips values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'completed', now(), now());

do $$
declare
  profile jsonb;
  search_count integer;
begin
  select count(*) into search_count from public.search_public_transport_companies('KTC00123', 'Sierra Leone', 20);
  if search_count <> 1 then raise exception 'Company code search did not return the public company.'; end if;
  select count(*) into search_count from public.search_public_transport_companies('Hidden Draft', 'Sierra Leone', 20);
  if search_count <> 0 then raise exception 'Draft company leaked into public search.'; end if;

  profile := public.get_public_transport_company_profile('10000000-0000-0000-0000-000000000001');
  if jsonb_array_length(profile->'fleets') <> 2 then raise exception 'Expected two public fleet categories.'; end if;
  if jsonb_array_length(profile->'rentals') <> 1 then raise exception 'Expected one public rental.'; end if;
  if profile->'fleets' @> '[{"fleet_type":"Tricycle"}]'::jsonb then raise exception 'Absent fleet type leaked into profile.'; end if;
  if (profile->'fleets'->0) ? 'documents' then raise exception 'Private documents leaked into public fleet payload.'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$
declare
  allowed boolean;
  trip uuid;
  result jsonb;
  profile jsonb;
begin
  select eligible, trip_id into allowed, trip from public.get_transport_company_review_eligibility('10000000-0000-0000-0000-000000000001');
  if not allowed or trip <> '60000000-0000-0000-0000-000000000001'::uuid then raise exception 'Completed company trip was not review eligible.'; end if;
  result := public.submit_verified_transport_company_review('10000000-0000-0000-0000-000000000001', trip, 5, 'Professional company service.');
  if result->>'rating' <> '5' then raise exception 'Company review was not created.'; end if;
  profile := public.get_public_transport_company_profile('10000000-0000-0000-0000-000000000001');
  if (profile->'company'->>'review_count')::integer <> 1 then raise exception 'Independent company rating summary was not updated.'; end if;
  select eligible into allowed from public.get_transport_company_review_eligibility('10000000-0000-0000-0000-000000000001');
  if allowed then raise exception 'The same trip remained eligible after review.'; end if;
end $$;

reset role;
set role anon;
select public.get_public_transport_company_profile('10000000-0000-0000-0000-000000000001');
reset role;

select 'PASS: public company search, dynamic inventory, safe profile fields, and verified company reviews' as result;
