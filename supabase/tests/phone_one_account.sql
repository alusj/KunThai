-- Run ONLY against an isolated, disposable phone_one_account_test database:
-- createdb -h <host> -p <port> phone_one_account_test
-- psql -h <host> -p <port> -d phone_one_account_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/phone_one_account.sql
-- Stubs the four contact-phone tables and a simple normalize_kunthai_phone,
-- loads the migration twice, asserts the one-number-one-account rule.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'phone_one_account_test' then raise exception 'This fixture requires the disposable phone_one_account_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated;

create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Simplified production normaliser: Sierra Leone national numbers get +232.
create function public.normalize_kunthai_phone(input_phone text, country_hint text default null) returns text language plpgsql stable as $$
declare d text := regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g');
begin
  if d = '' then return null; end if;
  if btrim(input_phone) like '+%' or d like '232%' then return '+' || d; end if;
  if upper(coalesce(country_hint, '')) in ('SL', 'SIERRA LEONE') then return '+232' || ltrim(d, '0'); end if;
  return '+' || d;
end $$;

create table public.kunthai_account_identities(user_id uuid primary key references auth.users, normalized_phone text);
create table public.marketplace_businesses(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, phone text, country_iso text, name text);
create table public.transport_operators(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, phone text, emergency_contact text, country text);
create table public.transport_companies(id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users, phone text, country text);
create table public.explore_spaces(id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users, phone text, name text);
grant select, insert, update, delete on all tables in schema public to authenticated;

\i supabase/migrations/20261016140000_phone_one_account.sql
\i supabase/migrations/20261016140000_phone_one_account.sql

-- A owns +23276111111 (account phone). B owns +23277222222.
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.kunthai_account_identities values
  ('aaaaaaaa-0000-0000-0000-000000000001', '+23276111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '+23277222222');

create function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) = 0 then raise exception 'expected "%" got "%"', p_fragment, sqlerrm; end if;
    return;
  end;
  raise exception 'expected error "%" but statement succeeded', p_fragment;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- Inline check: own number free, other account's number taken (any format), unknown free.
do $$ begin
  if public.kunthai_phone_in_use('+23276111111', 'SL') then raise exception 'own number must be free'; end if;
  if not public.kunthai_phone_in_use('077 222 222', 'SL') then raise exception 'B number (national format) must be taken'; end if;
  if not public.kunthai_phone_in_use('+232 77 222222', null) then raise exception 'B number (international) must be taken'; end if;
  if public.kunthai_phone_in_use('+23278999999', 'SL') then raise exception 'unknown number must be free'; end if;
end $$;
select pg_temp.expect_error($$select public.kunthai_phone_taken_by_other('+23277222222', null, null)$$, 'permission denied');

-- A may use own number on all four registrations.
insert into public.marketplace_businesses (user_id, phone, country_iso, name) values ('aaaaaaaa-0000-0000-0000-000000000001', '076111111', 'SL', 'A shop');
insert into public.transport_operators (user_id, phone, country) values ('aaaaaaaa-0000-0000-0000-000000000001', '+23276111111', 'Sierra Leone');
insert into public.transport_companies (owner_user_id, phone, country) values ('aaaaaaaa-0000-0000-0000-000000000001', '+23276111111', 'SL');
insert into public.explore_spaces (owner_user_id, phone, name) values ('aaaaaaaa-0000-0000-0000-000000000001', '+23276111111', 'A space');

-- A may not use B's number anywhere.
select pg_temp.expect_error($$insert into public.marketplace_businesses (user_id, phone, country_iso) values ('aaaaaaaa-0000-0000-0000-000000000001', '077222222', 'SL')$$, 'KT_PHONE_IN_USE');
select pg_temp.expect_error($$update public.explore_spaces set phone = '+23277222222'$$, 'KT_PHONE_IN_USE');

-- Emergency contact is not checked; editing other fields with an unchanged phone is fine.
update public.transport_operators set emergency_contact = '+23277222222';
update public.marketplace_businesses set name = 'A shop 2', phone = phone;

-- A new number used only on A's business becomes A's: B cannot take it.
update public.marketplace_businesses set phone = '+23278555555';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  if not public.kunthai_phone_in_use('078555555', 'SL') then raise exception 'A business number must be taken for B'; end if;
  if public.kunthai_phone_in_use('+23277222222', 'SL') then raise exception 'B own number free for B'; end if;
end $$;
select pg_temp.expect_error($$insert into public.transport_companies (owner_user_id, phone, country) values ('bbbbbbbb-0000-0000-0000-000000000002', '+23278555555', 'SL')$$, 'KT_PHONE_IN_USE');
select pg_temp.expect_error($$insert into public.transport_operators (user_id, phone) values ('bbbbbbbb-0000-0000-0000-000000000002', '+23276111111')$$, 'KT_PHONE_IN_USE');
insert into public.transport_operators (user_id, phone, emergency_contact) values ('bbbbbbbb-0000-0000-0000-000000000002', '+23277222222', '+23276111111');
reset role;

select 'phone_one_account: all assertions passed' as result;
