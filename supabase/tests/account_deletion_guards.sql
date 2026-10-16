-- Run ONLY against an isolated, disposable account_deletion_guards_test database:
-- createdb -h <host> -p <port> account_deletion_guards_test
-- psql -h <host> -p <port> -d account_deletion_guards_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/account_deletion_guards.sql
-- Reproduces the two production failures of "Delete my account" (review guard,
-- rental fleet guard), then loads files 18 and 20 (each twice) and asserts
-- both accounts delete while the guards still protect normal edits.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'account_deletion_guards_test' then raise exception 'This fixture requires the disposable account_deletion_guards_test database.'; end if; end $$;

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
create table public.transport_companies(id uuid primary key, owner_user_id uuid not null references auth.users on delete cascade, company_name text not null);
create table public.transport_company_members(
  id uuid primary key, company_id uuid not null references public.transport_companies on delete cascade,
  user_id uuid references auth.users on delete cascade, role text, status text, service_status text default 'active');
create table public.transport_company_fleets(
  id uuid primary key, company_id uuid not null references public.transport_companies on delete cascade,
  service_category text, operator_id uuid, operators jsonb default '[]');
create table public.transport_fleets(
  id uuid primary key, company_id uuid references public.transport_companies on delete set null,
  company_fleet_id uuid references public.transport_company_fleets on delete set null,
  operator_id uuid, active_status text default 'active', is_visible_to_passengers boolean default true, updated_at timestamptz);
create table public.transport_trips(id uuid primary key, fleet_id uuid references public.transport_fleets, status text);
create table public.transport_company_rentals(
  id uuid primary key, company_id uuid not null references public.transport_companies on delete cascade,
  company_fleet_id uuid not null unique references public.transport_company_fleets on delete restrict);
create table public.transport_operator_reviews(
  id uuid primary key, operator_id uuid, fleet_id uuid, trip_id uuid,
  passenger_id uuid references auth.users on delete set null, passenger_name text,
  created_at timestamptz default now(), rating int, review_text text, edit_count int default 0, edited_at timestamptz);

-- Production guards (20261006140000 / 20260905160000), trimmed to what matters.
create function public.review_edit_in_progress() returns boolean language sql stable as $$ select coalesce(current_setting('kunthai.review_edit', true), '') = 'on' $$;
create function public.guard_transport_review_update() returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.passenger_id is distinct from old.passenger_id or new.operator_id is distinct from old.operator_id then
    raise exception 'Review details cannot be changed.';
  end if;
  return new;
end;
$$;
create trigger transport_reviews_update_guard before update on public.transport_operator_reviews for each row execute function public.guard_transport_review_update();

create function public.can_manage_transport_rentals(p_company_id uuid) returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and exists (select 1 from public.transport_companies where id = p_company_id and owner_user_id = auth.uid());
$$;
create function public.guard_company_rental_fleet() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if tg_op = 'DELETE' then
    if old.service_category = 'Rental' and auth.uid() is not null and not public.can_manage_transport_rentals(old.company_id) then
      raise exception 'Only the company owner or an active admin can manage rentals.';
    end if;
    return old;
  end if;
  if new.service_category = 'Rental' and auth.uid() is not null and not public.can_manage_transport_rentals(new.company_id) then
    raise exception 'Only the company owner or an active admin can manage rentals.';
  end if;
  return new;
end;
$$;
create trigger guard_company_rental_fleet before insert or update or delete on public.transport_company_fleets for each row execute function public.guard_company_rental_fleet();

-- Pre-fix account deletion (20260705150000).
create function public.delete_kunthai_account() returns void language plpgsql security definer set search_path to 'public', 'auth', 'pg_catalog' as $$
declare uid uuid := auth.uid(); fk record;
begin
  if uid is null then raise exception 'You must be signed in to delete your account.'; end if;
  for fk in
    select n.nspname as sch, c.relname as tbl, a.attname as col
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_class t on t.oid = con.confrelid join pg_namespace tn on tn.oid = t.relnamespace
    join lateral unnest(con.conkey) as ck(attnum) on true join pg_attribute a on a.attrelid = c.oid and a.attnum = ck.attnum
    where con.contype = 'f' and tn.nspname = 'auth' and t.relname = 'users' and con.confdeltype not in ('c', 'n') and n.nspname = 'public'
  loop
    execute format('delete from %I.%I where %I = $1', fk.sch, fk.tbl, fk.col) using uid;
  end loop;
  delete from public.kunthai_account_identities where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;
grant execute on function public.delete_kunthai_account() to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- A: company owner with a rental fleet. S: passenger who wrote a review.
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001'), ('5e5e5e5e-0000-0000-0000-000000000002'), ('cccccccc-0000-0000-0000-000000000003');
insert into public.transport_companies values ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rain');
insert into public.transport_company_fleets values ('31111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Rental', null, '[]');
insert into public.transport_company_rentals values ('71111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '31111111-0000-0000-0000-000000000001');
insert into public.transport_operator_reviews (id, operator_id, passenger_id, rating, review_text) values
  ('a1111111-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', '5e5e5e5e-0000-0000-0000-000000000002', 5, 'Great'),
  ('a1111111-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 4, 'Fine');

create function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) = 0 then raise exception 'expected "%" got "%"', p_fragment, sqlerrm; end if;
    return;
  end;
  raise exception 'expected error "%" but statement succeeded', p_fragment;
end $$;

-- Before the fix: both production errors reproduce.
set role authenticated;
select set_config('request.jwt.claim.sub', '5e5e5e5e-0000-0000-0000-000000000002', false);
select pg_temp.expect_error($$select public.delete_kunthai_account()$$, 'Review details cannot be changed');
reset role;

\i supabase/migrations/20261015170000_urride_delete_company.sql
\i supabase/migrations/20261016120000_account_deletion_guards.sql
\i supabase/migrations/20261015170000_urride_delete_company.sql
\i supabase/migrations/20261016120000_account_deletion_guards.sql

-- Guards still protect ordinary edits.
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select pg_temp.expect_error($$update public.transport_operator_reviews set passenger_id = null where id = 'a1111111-0000-0000-0000-000000000001'$$, 'Review details cannot be changed');
select pg_temp.expect_error($$delete from public.transport_company_fleets where id = '31111111-0000-0000-0000-000000000001'$$, 'Only the company owner');
reset role;

-- After the fix: both accounts delete.
set role authenticated;
select set_config('request.jwt.claim.sub', '5e5e5e5e-0000-0000-0000-000000000002', false);
select public.delete_kunthai_account();
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.delete_kunthai_account();
reset role;

do $$ begin
  if exists (select 1 from auth.users where id in ('aaaaaaaa-0000-0000-0000-000000000001', '5e5e5e5e-0000-0000-0000-000000000002')) then
    raise exception 'both accounts should be deleted';
  end if;
  if (select passenger_id from public.transport_operator_reviews where id = 'a1111111-0000-0000-0000-000000000001') is not null then
    raise exception 'review should be kept with reviewer cleared';
  end if;
  if exists (select 1 from public.transport_companies) or exists (select 1 from public.transport_company_fleets) then
    raise exception 'owner company should be gone';
  end if;
  if not exists (select 1 from auth.users where id = 'cccccccc-0000-0000-0000-000000000003') then raise exception 'other account must stay'; end if;
end $$;

-- The flag does not leak past the transaction.
do $$ begin
  if public.account_deletion_in_progress() then raise exception 'flag leaked'; end if;
end $$;

select 'account_deletion_guards: all assertions passed' as result;
