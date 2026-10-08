-- Run ONLY against the disposable fleet_mgmt_test database:
-- psql -h /tmp -p 55432 -U pgtest -d fleet_mgmt_test -v ON_ERROR_STOP=1 -f supabase/tests/urride_fleet_management.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'fleet_mgmt_test' then raise exception 'This fixture requires the disposable fleet_mgmt_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.transport_companies(id uuid primary key, owner_user_id uuid);
create table public.transport_company_members(company_id uuid, user_id uuid, role text, status text default 'active');
create table public.transport_company_fleets(id uuid primary key, company_id uuid references public.transport_companies, operator_id uuid,
  operators jsonb not null default '[]', is_visible_to_passengers boolean default true, updated_at timestamptz);
create table public.transport_fleets(id uuid primary key default gen_random_uuid(), company_fleet_id uuid references public.transport_company_fleets on delete set null,
  active_status text default 'active', is_visible_to_passengers boolean default true, updated_at timestamptz);
create table public.transport_company_operator_invites(id uuid primary key default gen_random_uuid(), company_id uuid,
  company_fleet_id uuid references public.transport_company_fleets on delete cascade, operator_id uuid, operator_user_id uuid, status text default 'pending', updated_at timestamptz);
create function public.transport_company_user_has_permission(c uuid, p text, u uuid default auth.uid()) returns boolean language sql stable as $$
  select exists(select 1 from public.transport_companies where id = c and owner_user_id = u)
    or exists(select 1 from public.transport_company_members where company_id = c and user_id = u and status = 'active' and role in ('admin', 'fleet_manager') and p = 'manage_fleets') $$;

\ir ../migrations/20261007180000_urride_fleet_management.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;

insert into public.transport_companies values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
insert into public.transport_company_members values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'fleet_manager');
insert into public.transport_company_fleets(id, company_id, operator_id, operators) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '[{"status":"accepted","operatorId":"10000000-0000-4000-8000-000000000001"},{"status":"declined"}]'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', null, '[]');
insert into public.transport_fleets(company_fleet_id) values ('30000000-0000-4000-8000-000000000001'), ('30000000-0000-4000-8000-000000000002');
insert into public.transport_company_operator_invites(company_id, company_fleet_id, operator_id, operator_user_id, status) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'accepted');

-- One operator per fleet
do $$ begin
  begin
    insert into public.transport_company_operator_invites(company_id, company_fleet_id, operator_id, operator_user_id, status)
    values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000012', 'pending');
    raise exception 'TEST FAILED: a second operator was invited to an assigned fleet';
  exception when check_violation then null;
  end;
end $$;
insert into public.transport_company_operator_invites(id, company_id, company_fleet_id, operator_id, operator_user_id, status) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000013', 'pending'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000014', 'pending');
update public.transport_company_operator_invites set status = 'accepted' where id = '50000000-0000-4000-8000-000000000001';
do $$ begin
  begin
    update public.transport_company_operator_invites set status = 'accepted' where id = '50000000-0000-4000-8000-000000000002';
    raise exception 'TEST FAILED: two operators accepted the same fleet';
  exception when check_violation then null;
  end;
end $$;

-- A stranger cannot manage the fleet
select as_user('00000000-0000-4000-8000-000000000099');
do $$ begin
  begin
    perform manage_transport_company_fleet('30000000-0000-4000-8000-000000000001', 'delete');
    raise exception 'TEST FAILED: a stranger deleted a fleet';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
end $$;

-- The fleet manager removes the operator: offline, invites revoked, operator cleared
select as_user('00000000-0000-4000-8000-000000000002');
select manage_transport_company_fleet('30000000-0000-4000-8000-000000000001', 'removeOperator');
select test_assert((select operator_id is null and not is_visible_to_passengers and operators -> 0 ->> 'status' = 'revoked' and operators -> 1 ->> 'status' = 'declined'
  from public.transport_company_fleets where id = '30000000-0000-4000-8000-000000000001'), 'a fleet manager removes the operator');
select test_assert((select bool_and(status = 'revoked') from public.transport_company_operator_invites where company_fleet_id = '30000000-0000-4000-8000-000000000001'), 'the operator''s invites are revoked');
select test_assert((select active_status = 'offline' and not is_visible_to_passengers from public.transport_fleets where company_fleet_id = '30000000-0000-4000-8000-000000000001'), 'the vehicle goes offline');

-- After removal a new operator can be assigned
insert into public.transport_company_operator_invites(company_id, company_fleet_id, operator_id, operator_user_id, status)
values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000012', 'accepted');

-- The fleet manager deletes a fleet
select manage_transport_company_fleet('30000000-0000-4000-8000-000000000002', 'delete');
select test_assert((select count(*) = 0 from public.transport_company_fleets where id = '30000000-0000-4000-8000-000000000002'), 'a fleet manager can delete a fleet');

select 'urride fleet management: all assertions passed' as result;
