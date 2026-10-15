-- Run ONLY against an isolated, disposable urride_delete_company_test database:
-- createdb -h <host> -p <port> urride_delete_company_test
-- psql -h <host> -p <port> -d urride_delete_company_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/urride_delete_company.sql
-- Stubs the company tables with their production foreign keys (including the
-- RESTRICT links from rentals), loads the migration twice, asserts.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'urride_delete_company_test' then raise exception 'This fixture requires the disposable urride_delete_company_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated;

create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.kunthai_account_identities(user_id uuid references auth.users on delete cascade);
create table public.transport_companies(
  id uuid primary key, owner_user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null);
create table public.transport_company_members(
  id uuid primary key, company_id uuid not null references public.transport_companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade);
create table public.transport_company_fleets(
  id uuid primary key, company_id uuid not null references public.transport_companies(id) on delete cascade);
create table public.transport_company_operator_invites(
  id uuid primary key, company_id uuid not null references public.transport_companies(id) on delete cascade,
  company_fleet_id uuid references public.transport_company_fleets(id) on delete cascade);
create table public.transport_fleets(
  id uuid primary key, company_id uuid references public.transport_companies(id) on delete set null,
  company_fleet_id uuid references public.transport_company_fleets(id) on delete set null,
  active_status text default 'active', is_visible_to_passengers boolean default true, updated_at timestamptz);
create table public.transport_trips(id uuid primary key, fleet_id uuid references public.transport_fleets(id), status text);
create table public.transport_company_rentals(
  id uuid primary key, company_id uuid not null references public.transport_companies(id) on delete cascade,
  company_fleet_id uuid not null unique references public.transport_company_fleets(id) on delete restrict);
create table public.transport_rental_reservations(
  id uuid primary key, rental_id uuid not null references public.transport_company_rentals(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict, status text);
create table public.transport_rental_reviews(
  id uuid primary key, rental_id uuid not null references public.transport_company_rentals(id),
  reservation_id uuid references public.transport_rental_reservations(id));

\i supabase/migrations/20261015170000_urride_delete_company.sql
\i supabase/migrations/20261015170000_urride_delete_company.sql

-- owner A, operator B, renter C; company X owned by A with a rented fleet and history.
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002'), ('cccccccc-0000-0000-0000-000000000003');
insert into public.transport_companies values ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rain Movers');
insert into public.transport_company_members values ('21111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
insert into public.transport_company_fleets values ('31111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'), ('31111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001');
insert into public.transport_company_operator_invites values ('41111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '31111111-0000-0000-0000-000000000001');
insert into public.transport_fleets values ('51111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '31111111-0000-0000-0000-000000000001', 'active', true, null);
insert into public.transport_trips values ('61111111-0000-0000-0000-000000000001', '51111111-0000-0000-0000-000000000001', 'in_progress');
insert into public.transport_company_rentals values ('71111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '31111111-0000-0000-0000-000000000002');
insert into public.transport_rental_reservations values ('81111111-0000-0000-0000-000000000001', '71111111-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'active');
insert into public.transport_rental_reviews values ('91111111-0000-0000-0000-000000000001', '71111111-0000-0000-0000-000000000001', '81111111-0000-0000-0000-000000000001');

grant select, insert, update, delete on all tables in schema public to authenticated;

create function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) = 0 then raise exception 'expected "%" got "%"', p_fragment, sqlerrm; end if;
    return;
  end;
  raise exception 'expected error "%" but statement succeeded', p_fragment;
end $$;

-- Only the owner, only with the right name, not while busy.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.expect_error($$select public.delete_transport_company('11111111-0000-0000-0000-000000000001', 'Rain Movers')$$, 'Only the company creator');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select pg_temp.expect_error($$select public.delete_transport_company('11111111-0000-0000-0000-000000000001', 'Rain')$$, 'Type the company name');
select pg_temp.expect_error($$select public.delete_transport_company('11111111-0000-0000-0000-000000000001', 'rain movers')$$, 'trip is in progress');
reset role;
update public.transport_trips set status = 'completed';
set role authenticated;
select pg_temp.expect_error($$select public.delete_transport_company('11111111-0000-0000-0000-000000000001', ' rain movers ')$$, 'rental is confirmed or active');
select pg_temp.expect_error($$select public.kunthai_purge_dependents('public.transport_companies'::regclass, array['11111111-0000-0000-0000-000000000001'::uuid])$$, 'permission denied');
reset role;
update public.transport_rental_reservations set status = 'completed';

-- Owner deletes: everything company-owned goes, operator fleet survives offline, trips survive.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$ declare r jsonb; begin
  r := public.delete_transport_company('11111111-0000-0000-0000-000000000001', 'rain movers');
  if (r->>'deleted')::boolean is not true then raise exception 'unexpected result %', r; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.transport_companies) then raise exception 'company not deleted'; end if;
  if exists (select 1 from public.transport_company_members) then raise exception 'members not deleted'; end if;
  if exists (select 1 from public.transport_company_fleets) then raise exception 'company fleets not deleted'; end if;
  if exists (select 1 from public.transport_company_operator_invites) then raise exception 'invites not deleted'; end if;
  if exists (select 1 from public.transport_company_rentals) then raise exception 'rentals not deleted'; end if;
  if exists (select 1 from public.transport_rental_reservations) then raise exception 'reservations not deleted'; end if;
  if exists (select 1 from public.transport_rental_reviews) then raise exception 'reviews not deleted'; end if;
  if not exists (select 1 from public.transport_fleets where id = '51111111-0000-0000-0000-000000000001'
                 and company_id is null and active_status = 'offline' and is_visible_to_passengers = false) then
    raise exception 'operator fleet should survive offline and detached';
  end if;
  if (select count(*) from public.transport_trips) <> 1 then raise exception 'trip history must survive'; end if;
  if (select count(*) from auth.users) <> 3 then raise exception 'no account may be deleted'; end if;
end $$;

-- Account deletion is no longer blocked by the owner's company rental history.
insert into public.transport_companies values ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Second Co');
insert into public.transport_company_fleets values ('31111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002');
insert into public.transport_company_rentals values ('71111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', '31111111-0000-0000-0000-000000000003');
insert into public.transport_rental_reservations values ('81111111-0000-0000-0000-000000000002', '71111111-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'completed');
set role postgres;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.delete_kunthai_account();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001') then raise exception 'owner account not deleted'; end if;
  if exists (select 1 from public.transport_companies) then raise exception 'owned company not deleted'; end if;
  if not exists (select 1 from auth.users where id = 'cccccccc-0000-0000-0000-000000000003') then raise exception 'renter must survive'; end if;
end $$;

select 'urride_delete_company: all assertions passed' as result;
