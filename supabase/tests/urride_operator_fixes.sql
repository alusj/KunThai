-- Run ONLY against the disposable operator_fixes_test database:
-- psql -h /tmp -p 55433 -U pgtest -d operator_fixes_test -v ON_ERROR_STOP=1 -f supabase/tests/urride_operator_fixes.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'operator_fixes_test' then raise exception 'This fixture requires the disposable operator_fixes_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.transport_operators(id uuid primary key, user_id uuid);
create table public.transport_companies(id uuid primary key);
create table public.transport_company_fleets(id uuid primary key default gen_random_uuid(), company_id uuid references public.transport_companies,
  fleet_code text not null, plate_number text);
create table public.transport_fleets(id uuid primary key default gen_random_uuid(), operator_id uuid references public.transport_operators,
  company_id uuid references public.transport_companies, company_fleet_id uuid references public.transport_company_fleets on delete set null,
  plate_number text);

\ir ../migrations/20261008130000_urride_operator_fixes.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;

-- Operator A (user ...01) has solo plate "AB 123"; operator B (user ...02) has none.
insert into public.transport_operators values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
insert into public.transport_companies values ('20000000-0000-4000-8000-000000000001'), ('20000000-0000-4000-8000-000000000002');
insert into public.transport_fleets(operator_id, plate_number) values ('10000000-0000-4000-8000-000000000001', ' ab   123 ');
insert into public.transport_company_fleets(id, company_id, fleet_code, plate_number) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'KTF-ONE', 'CO 777'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'KTF-TWO', 'no-plate');
-- The company fleet's runtime row is driven by operator B; it mirrors the company plate.
insert into public.transport_fleets(operator_id, company_id, company_fleet_id, plate_number) values
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'CO 777');

-- Signed out: refused
select as_user('');
do $$ begin
  begin
    perform transport_plate_number_in_use('AB 123');
    raise exception 'TEST FAILED: a signed-out caller checked a plate';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
end $$;

-- Solo saves
select as_user('00000000-0000-4000-8000-000000000001');
select test_assert(not transport_plate_number_in_use('AB 123'), 'an operator editing their own solo fleet keeps its plate');
select test_assert(transport_plate_number_in_use('co  777'), 'a solo fleet cannot reuse a company fleet plate');
select test_assert(not transport_plate_number_in_use('ZZ 1'), 'an unused plate is free');
select test_assert(not transport_plate_number_in_use('No-Plate'), 'placeholder plates never conflict');
select test_assert(not transport_plate_number_in_use('  '), 'an empty plate never conflicts');
select as_user('00000000-0000-4000-8000-000000000002');
select test_assert(transport_plate_number_in_use('ab 123'), 'another operator''s solo plate is taken (spacing and case ignored)');

-- Company saves
select test_assert(not transport_plate_number_in_use('CO 777', '20000000-0000-4000-8000-000000000001', 'KTF-ONE', true),
  'saving a company fleet keeps its own plate (its runtime row is not counted)');
select test_assert(transport_plate_number_in_use('CO 777', '20000000-0000-4000-8000-000000000001', 'KTF-NEW', true),
  'another fleet of the same company cannot reuse the plate');
select test_assert(transport_plate_number_in_use('CO 777', '20000000-0000-4000-8000-000000000002', 'KTF-ONE', true),
  'another company cannot reuse the plate');
select test_assert(transport_plate_number_in_use('AB 123', '20000000-0000-4000-8000-000000000002', 'KTF-X', true),
  'a company fleet cannot reuse a solo plate');
select test_assert(transport_plate_number_in_use('AB 123', null, 'KTF-X', true),
  'a brand-new company cannot reuse a solo plate');
select as_user('00000000-0000-4000-8000-000000000001');
select test_assert(transport_plate_number_in_use('AB 123', '20000000-0000-4000-8000-000000000002', 'KTF-X', true),
  'an operator cannot also register their own solo vehicle as a company fleet');

-- An orphaned runtime row (its company fleet was deleted) frees the plate.
delete from public.transport_company_fleets where id = '30000000-0000-4000-8000-000000000001';
select test_assert(not transport_plate_number_in_use('CO 777'), 'a deleted company fleet no longer holds its plate');

-- Grants
select test_assert(has_function_privilege('authenticated', 'public.transport_plate_number_in_use(text, uuid, text, boolean)', 'execute'), 'signed-in users can check plates');
select test_assert(not has_function_privilege('anon', 'public.transport_plate_number_in_use(text, uuid, text, boolean)', 'execute'), 'anonymous users cannot check plates');

select 'urride_operator_fixes: all tests passed' as result;
