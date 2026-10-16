-- Run ONLY against an isolated, disposable urride_leave_company_test database:
-- createdb -h <host> -p <port> urride_leave_company_test
-- psql -h <host> -p <port> -d urride_leave_company_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/urride_leave_company.sql
-- Stubs the company tables (with row-level security that, like production,
-- does not let a member update their own membership), loads the migration
-- twice, asserts that leaving works through the function.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'urride_leave_company_test' then raise exception 'This fixture requires the disposable urride_leave_company_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated;

create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.transport_operators(id uuid primary key, user_id uuid unique references auth.users);
create table public.transport_companies(id uuid primary key, owner_user_id uuid not null references auth.users, company_name text);
create table public.transport_company_members(
  id uuid primary key, company_id uuid not null references public.transport_companies on delete cascade,
  user_id uuid references auth.users, operator_id uuid references public.transport_operators,
  role text default 'operator', status text default 'active', service_status text default 'active',
  managed_by uuid, updated_at timestamptz);
create table public.transport_company_fleets(
  id uuid primary key, company_id uuid not null references public.transport_companies on delete cascade,
  operator_id uuid references public.transport_operators, operators jsonb default '[]',
  is_visible_to_passengers boolean default true, updated_at timestamptz);
create table public.transport_company_operator_invites(
  id uuid primary key, company_id uuid not null references public.transport_companies on delete cascade,
  company_fleet_id uuid references public.transport_company_fleets on delete cascade,
  operator_id uuid, operator_user_id uuid, status text, updated_at timestamptz);
create table public.transport_fleets(
  id uuid primary key, operator_id uuid references public.transport_operators,
  company_id uuid references public.transport_companies on delete set null,
  company_fleet_id uuid references public.transport_company_fleets on delete set null,
  active_status text default 'active', is_visible_to_passengers boolean default true, updated_at timestamptz);
create table public.transport_trips(id uuid primary key, fleet_id uuid references public.transport_fleets, status text);

-- Production RLS: members may read their own row; only owners update.
alter table public.transport_company_members enable row level security;
create policy "members read own" on public.transport_company_members for select using (user_id = auth.uid());
create policy "owners manage" on public.transport_company_members for all
  using (exists (select 1 from public.transport_companies c where c.id = company_id and c.owner_user_id = auth.uid()));
grant select, insert, update, delete on all tables in schema public to authenticated;

\i supabase/migrations/20261016100000_urride_leave_company.sql
\i supabase/migrations/20261016100000_urride_leave_company.sql

insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002'), ('cccccccc-0000-0000-0000-000000000003');
insert into public.transport_operators values ('0b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002'), ('0c000000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003');
insert into public.transport_companies values ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rain');
insert into public.transport_company_members (id, company_id, user_id, operator_id, role) values
  ('21111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'owner'),
  ('21111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000002', 'operator'),
  ('21111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000003', 'operator');
insert into public.transport_company_fleets values
  ('31111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000002',
   '[{"userId":"bbbbbbbb-0000-0000-0000-000000000002","status":"accepted"},{"userId":"cccccccc-0000-0000-0000-000000000003","status":"accepted"}]', true, null);
insert into public.transport_company_operator_invites values
  ('41111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '31111111-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'accepted', null),
  ('41111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', null, '0c000000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 'accepted', null);
insert into public.transport_fleets values ('51111111-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '31111111-0000-0000-0000-000000000001', 'active', true, null);
insert into public.transport_trips values ('61111111-0000-0000-0000-000000000001', '51111111-0000-0000-0000-000000000001', 'in_progress');

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

-- The bug: a direct update by the member changes nothing under RLS.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
update public.transport_company_members set status = 'removed' where id = '21111111-0000-0000-0000-000000000002';
do $$ begin
  if (select status from public.transport_company_members where id = '21111111-0000-0000-0000-000000000002') <> 'active' then
    raise exception 'fixture RLS should block a direct self-update';
  end if;
end $$;

-- Owner cannot leave; busy operator cannot leave.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select pg_temp.expect_error($$select public.leave_transport_company('11111111-0000-0000-0000-000000000001')$$, 'creator cannot leave');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.expect_error($$select public.leave_transport_company('11111111-0000-0000-0000-000000000001')$$, 'trip in progress');
reset role;
update public.transport_trips set status = 'completed';
set role authenticated;

-- Operator B leaves.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select public.leave_transport_company('11111111-0000-0000-0000-000000000001');
select pg_temp.expect_error($$select public.leave_transport_company('11111111-0000-0000-0000-000000000001')$$, 'no longer a member');
reset role;

do $$ begin
  if (select status from public.transport_company_members where id = '21111111-0000-0000-0000-000000000002') <> 'removed' then raise exception 'B should be removed'; end if;
  if (select status from public.transport_company_members where id = '21111111-0000-0000-0000-000000000003') <> 'active' then raise exception 'C must stay'; end if;
  if (select status from public.transport_company_members where id = '21111111-0000-0000-0000-000000000001') <> 'active' then raise exception 'owner must stay'; end if;
  if (select status from public.transport_company_operator_invites where id = '41111111-0000-0000-0000-000000000001') <> 'revoked' then raise exception 'B invite should be revoked'; end if;
  if (select status from public.transport_company_operator_invites where id = '41111111-0000-0000-0000-000000000002') <> 'accepted' then raise exception 'C invite must stay'; end if;
  if (select operator_id from public.transport_company_fleets where id = '31111111-0000-0000-0000-000000000001') is not null then raise exception 'B should be off the company fleet'; end if;
  if (select operators -> 0 ->> 'status' from public.transport_company_fleets) <> 'revoked'
     or (select operators -> 1 ->> 'status' from public.transport_company_fleets) <> 'accepted' then
    raise exception 'only B entry should be revoked';
  end if;
  if exists (select 1 from public.transport_fleets where active_status <> 'offline' or is_visible_to_passengers) then raise exception 'B vehicle should be offline'; end if;
  if (select count(*) from public.transport_companies) <> 1 then raise exception 'company must stay'; end if;
end $$;

select 'urride_leave_company: all assertions passed' as result;
