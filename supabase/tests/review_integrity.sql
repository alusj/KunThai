-- Run ONLY against an isolated, disposable review_test database:
-- createdb -h <host> -p <port> -U postgres review_test
-- psql -h <host> -p <port> -U postgres -d review_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/review_integrity.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'review_test' then raise exception 'This fixture requires the disposable review_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Minimal production-shaped tables.
create table public.transport_operators(id uuid primary key, user_id uuid);
create table public.transport_fleets(id uuid primary key, operator_id uuid references public.transport_operators);
create table public.transport_trips(
  id uuid primary key, fleet_id uuid references public.transport_fleets, passenger_id uuid,
  status text not null default 'requested', operator_accepted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.transport_operator_reviews(
  id uuid primary key default gen_random_uuid(), operator_id uuid not null, fleet_id uuid, trip_id uuid,
  passenger_id uuid, passenger_name text, rating int not null check (rating between 1 and 5),
  review_text text, response_text text, responded_at timestamptz, created_at timestamptz not null default now()
);
create table public.marketplace_businesses(id uuid primary key, user_id uuid);
create table public.marketplace_orders(
  id uuid primary key, buyer_id uuid, business_id uuid, product_id uuid, status text not null default 'pending',
  seller_responded_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.marketplace_reviews(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, buyer_id uuid, buyer_name text not null default '',
  product_name text not null default '', product_id uuid, order_id uuid, review_type text not null default 'marketplace',
  rating integer not null default 0, comment text not null default '', response text, created_at timestamptz not null default now()
);
alter table public.marketplace_reviews enable row level security;
create table public.transport_companies(id uuid primary key, owner_user_id uuid);
create table public.transport_company_members(company_id uuid, user_id uuid, role text, status text, service_status text);
create table public.transport_company_rentals(id uuid primary key, company_id uuid, title text);
create table public.transport_rental_reservations(
  id uuid primary key, rental_id uuid references public.transport_company_rentals, customer_user_id uuid,
  starts_at timestamptz not null default now() - interval '2 days', ends_at timestamptz not null default now() - interval '1 day',
  status text not null default 'requested', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.transport_rental_reviews(
  id uuid primary key default gen_random_uuid(), rental_id uuid not null references public.transport_company_rentals,
  customer_user_id uuid not null, rating integer not null check (rating between 1 and 5), body text not null,
  created_at timestamptz not null default now(), unique(rental_id, customer_user_id)
);
create table public.platform_notifications(
  user_id uuid, sector text, notification_type text, title text, body text, priority text, status text, category text,
  workspace text, workspace_id uuid, action_target text, action_data jsonb, channels text[], presentation text
);
create function public.can_manage_transport_rentals(p_company_id uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.transport_companies c where c.id = p_company_id and c.owner_user_id = auth.uid());
$$;

-- Existing triggers from 20260720090000 that this migration replaces.
create function public.enforce_verified_transport_review() returns trigger language plpgsql as $$ begin return new; end; $$;
create trigger transport_reviews_verified_trip_guard before insert on public.transport_operator_reviews
  for each row execute function public.enforce_verified_transport_review();
create function public.enforce_verified_marketplace_review() returns trigger language plpgsql as $$ begin return new; end; $$;
create trigger marketplace_reviews_verified_transaction_guard before insert on public.marketplace_reviews
  for each row execute function public.enforce_verified_marketplace_review();

-- People: passenger/buyer P, operator O, store owner S, company owner C.
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'p@x.io'),
  ('00000000-0000-0000-0000-0000000000a2', 'o@x.io'),
  ('00000000-0000-0000-0000-0000000000a3', 's@x.io'),
  ('00000000-0000-0000-0000-0000000000a4', 'c@x.io');
insert into public.transport_operators values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2');
insert into public.transport_fleets values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
insert into public.marketplace_businesses values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3');
insert into public.transport_companies values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4');
insert into public.transport_company_rentals values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Van');

-- Trips: t1 accepted only, t2 completed today, t3 completed 40 days ago, t4 completed (second trip).
insert into public.transport_trips(id, fleet_id, passenger_id, status, operator_accepted_at) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'accepted', now());
insert into public.transport_trips(id, fleet_id, passenger_id, status, operator_accepted_at, updated_at) values
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'completed', now(), now() - interval '40 days');

\ir ../migrations/20261006140000_review_integrity.sql

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false); $$;

do $$
declare
  e record;
  r public.transport_operator_reviews;
  failed boolean;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

  -- Accepted (not completed) trip and a 40-day-old trip: no review.
  select * into e from public.get_transport_review_eligibility('10000000-0000-0000-0000-000000000001');
  if e.eligible then raise exception 'accepted-only / old trips must not be reviewable: %', e; end if;

  -- Completing a trip stamps completed_at and unlocks one review.
  update public.transport_trips set status = 'completed' where id = '60000000-0000-0000-0000-000000000001';
  if (select completed_at from public.transport_trips where id = '60000000-0000-0000-0000-000000000001') is null then
    raise exception 'completed_at should be stamped';
  end if;
  select * into e from public.get_transport_review_eligibility('10000000-0000-0000-0000-000000000001');
  if not e.eligible or e.trip_id <> '60000000-0000-0000-0000-000000000001' then raise exception 'completed trip should be eligible: %', e; end if;

  r := public.submit_verified_transport_review('10000000-0000-0000-0000-000000000001', 2, 'late');
  if r.rating <> 2 or r.edit_count <> 0 then raise exception 'first review wrong: %', r; end if;

  -- Second submit = the one edit.
  select * into e from public.get_transport_review_eligibility('10000000-0000-0000-0000-000000000001');
  if not e.eligible or e.reason not like 'You can edit%' then raise exception 'edit should be offered: %', e; end if;
  r := public.submit_verified_transport_review('10000000-0000-0000-0000-000000000001', 4, 'on time after all');
  if r.rating <> 4 or r.edit_count <> 1 or r.edited_at is null then raise exception 'edit wrong: %', r; end if;
  if (select count(*) from public.transport_operator_reviews) <> 1 then raise exception 'edit must not add a review'; end if;

  -- Third submit: locked.
  failed := false;
  begin
    perform public.submit_verified_transport_review('10000000-0000-0000-0000-000000000001', 5, 'again');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'a second edit must be refused'; end if;

  -- Direct table update by the author (bypassing the function) is refused.
  failed := false;
  begin
    update public.transport_operator_reviews set rating = 5;
  exception when others then failed := true;
  end;
  if not failed then raise exception 'direct rating change must be refused'; end if;

  -- Another completed trip unlocks a new review.
  insert into public.transport_trips(id, fleet_id, passenger_id, status, operator_accepted_at) values
    ('60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'completed', now());
  r := public.submit_verified_transport_review('10000000-0000-0000-0000-000000000001', 5, 'great');
  if r.trip_id <> '60000000-0000-0000-0000-000000000004' or r.edit_count <> 0 then raise exception 'new trip should add a new review: %', r; end if;

  -- Operator: can reply, cannot change the rating, cannot review themselves.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
  update public.transport_operator_reviews set response_text = 'Thank you', responded_at = now() where trip_id = '60000000-0000-0000-0000-000000000004';
  failed := false;
  begin
    update public.transport_operator_reviews set rating = 5 where trip_id = '60000000-0000-0000-0000-000000000001';
  exception when others then failed := true;
  end;
  if not failed then raise exception 'operator must not change a rating'; end if;
  insert into public.transport_trips(id, fleet_id, passenger_id, status) values
    ('60000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'completed');
  select * into e from public.get_transport_review_eligibility('10000000-0000-0000-0000-000000000001');
  if e.eligible then raise exception 'operator must not review their own fleet'; end if;
end $$;

-- UrMall
insert into public.marketplace_orders(id, buyer_id, business_id, product_id, status, seller_responded_at) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', null, 'shipped', now());

do $$
declare
  e record;
  r public.marketplace_reviews;
  failed boolean;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select * into e from public.get_marketplace_review_eligibility('30000000-0000-0000-0000-000000000001');
  if e.eligible then raise exception 'a shipped (not completed) order must not be reviewable'; end if;

  update public.marketplace_orders set status = 'completed' where id = '70000000-0000-0000-0000-000000000001';
  r := public.submit_verified_marketplace_review('30000000-0000-0000-0000-000000000001', 3, 'ok');
  r := public.submit_verified_marketplace_review('30000000-0000-0000-0000-000000000001', 5, 'better than I said');
  if r.rating <> 5 or r.edit_count <> 1 then raise exception 'store edit wrong: %', r; end if;
  failed := false;
  begin
    perform public.submit_verified_marketplace_review('30000000-0000-0000-0000-000000000001', 1, 'again');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'second store edit must be refused'; end if;

  -- Store owner may reply but not change or rewrite the rating.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
  update public.marketplace_reviews set response = 'Thanks!';
  failed := false;
  begin
    update public.marketplace_reviews set rating = 5, comment = 'edited by owner';
  exception when others then failed := true;
  end;
  if not failed then raise exception 'owner must not change a review'; end if;
  if exists (select 1 from pg_policies where tablename = 'marketplace_reviews' and policyname = 'business owners manage reviews') then
    raise exception 'owner FOR ALL policy (insert/delete) must be gone';
  end if;
end $$;

-- Rentals
insert into public.transport_rental_reservations(id, rental_id, customer_user_id, status) values
  ('80000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'completed');

do $$
declare
  failed boolean;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform public.save_transport_rental_review('50000000-0000-0000-0000-000000000001', 3, 'fine');
  perform public.save_transport_rental_review('50000000-0000-0000-0000-000000000001', 4, 'clean van');
  if (select edit_count from public.transport_rental_reviews) <> 1 then raise exception 'rental edit should be counted'; end if;
  failed := false;
  begin
    perform public.save_transport_rental_review('50000000-0000-0000-0000-000000000001', 1, 'third');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'second rental edit must be refused'; end if;

  -- A second completed rental of the same vehicle allows a new review.
  insert into public.transport_rental_reservations(id, rental_id, customer_user_id, status) values
    ('80000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'completed');
  perform public.save_transport_rental_review('50000000-0000-0000-0000-000000000001', 5, 'second rental');
  if (select count(*) from public.transport_rental_reviews) <> 2 then raise exception 'second rental should add a review'; end if;
end $$;

\echo 'review_integrity: all assertions passed'
