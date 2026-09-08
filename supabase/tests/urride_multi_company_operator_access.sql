-- Run ONLY against the isolated, disposable membership_test database:
-- psql -h 127.0.0.1 -p 55437 -U postgres -d membership_test -v ON_ERROR_STOP=1 -f supabase/tests/urride_multi_company_operator_access.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'membership_test' then raise exception 'This fixture requires the disposable membership_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.transport_operators(id uuid primary key, user_id uuid unique not null references auth.users);
create table public.transport_companies(id uuid primary key, owner_user_id uuid references auth.users);
create table public.transport_company_fleets(id uuid primary key, company_id uuid references transport_companies, service_category text default 'Ride only', operator_id uuid, transport_fleet_id uuid, active_status text default 'offline', is_visible_to_passengers boolean default false);
create table public.transport_fleets(id uuid primary key default gen_random_uuid(), operator_id uuid references transport_operators, company_id uuid, company_fleet_id uuid unique, active_status text default 'offline', is_visible_to_passengers boolean default false, pause_reason text default '', created_at timestamptz default now(), updated_at timestamptz default now(), last_active_at timestamptz);
create table public.transport_company_operator_invites(id uuid primary key, company_id uuid references transport_companies, company_fleet_id uuid references transport_company_fleets, operator_id uuid references transport_operators, operator_user_id uuid references auth.users, operator_public_id text, operator_name text, status text default 'pending', documents jsonb default '{}', responded_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.transport_company_members(id uuid primary key default gen_random_uuid(), company_id uuid references transport_companies, user_id uuid references auth.users, operator_id uuid references transport_operators, public_id text, full_name text, role text default 'operator', status text default 'active', service_status text default 'active', joined_at timestamptz, updated_at timestamptz default now(), unique(company_id, user_id));
create table public.transport_trips(id uuid primary key default gen_random_uuid(), fleet_id uuid references transport_fleets, status text default 'requested');
create table public.transport_operator_transactions(id uuid);
create table public.transport_operator_alerts(id uuid);
create table public.visibility_credit_wallets(user_id uuid primary key references auth.users, balance integer not null default 0 check(balance >= 0), lifetime_spent integer not null default 0, updated_at timestamptz default now());
create table public.visibility_credit_transactions(id uuid default gen_random_uuid(), user_id uuid references auth.users, amount integer, balance_after integer, transaction_type text, surface text, reference_type text, reference_id uuid, metadata jsonb);
create type public.transport_service_category as enum ('transport','delivery','both');
create type public.transport_fleet_type as enum ('car','motorcycle','tricycle');
create type public.transport_verification_status as enum ('verified','not_verified','verification_pending');
alter table public.transport_companies add column country_iso text default 'SL', add column country text default 'Sierra Leone', add column currency text default 'SLE', add column city text default 'Freetown', add column address text default 'Juba';
alter table public.transport_company_fleets add column fleet_type text default 'Car', add column verification_status text default 'pending', add column plate_number text default 'SL-TEST', add column fleet_name text default 'Company car', add column make text, add column model text, add column manufacture_year integer, add column color text, add column operating_area text, add column home_base_location text, add column safety_answers jsonb default '{}', add column fleet_code text, add column updated_at timestamptz default now();
alter table public.transport_fleets add column service_category public.transport_service_category, add column fleet_type public.transport_fleet_type, add column verification_status public.transport_verification_status, add column plate_number text default 'SL-TEST', add column fleet_name text, add column make text, add column model text, add column manufacture_year integer, add column color text, add column operating_area text, add column home_base_location text, add column safety_answers jsonb default '{}', add column accepts_ride boolean, add column accepts_delivery boolean, add column country text, add column country_iso text, add column currency text, add column fleet_code text;
create function public.kunthai_resolve_country_iso(text) returns text language sql as $$ select 'SL'::text $$;
create function public.kunthai_resolve_currency(text,text) returns text language sql as $$ select 'SLE'::text $$;
create function public.transport_company_is_owner(c uuid, u uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.transport_companies where id=c and owner_user_id=u) $$;
create function public.transport_company_user_has_permission(c uuid, p text, u uuid) returns boolean language sql stable security definer as $$ select public.transport_company_is_owner(c,u) or exists(select 1 from public.transport_company_members where company_id=c and user_id=u and role='admin' and status='active' and service_status='active') $$;
create function public.transport_company_invite_is_for_user(i uuid, u uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.transport_company_operator_invites invite left join public.transport_operators operator on operator.id=invite.operator_id where invite.id=i and (invite.operator_user_id=u or operator.user_id=u)) $$;
-- Real provisioning/acceptance/access/membership/work-context functions are
-- loaded from the production migration against this minimal legacy schema.

insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004'),('00000000-0000-4000-8000-000000000005');
insert into transport_operators values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004');
insert into transport_companies values ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005'),('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');
insert into transport_company_fleets(id,company_id) values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002'),('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001');
insert into transport_fleets(id,operator_id) values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004');
insert into visibility_credit_wallets(user_id,balance) values ('00000000-0000-4000-8000-000000000001',300),('00000000-0000-4000-8000-000000000002',149),('00000000-0000-4000-8000-000000000003',0),('00000000-0000-4000-8000-000000000004',0);
insert into transport_company_operator_invites(id,company_id,company_fleet_id,operator_id,operator_user_id) values
('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
('50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
('50000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003');
insert into transport_company_members(company_id,user_id,operator_id) values ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004');

\ir ../migrations/20260905140000_urride_multi_company_operator_access.sql
\ir ../migrations/20260908120000_company_assignment_save_repair.sql
create trigger transport_company_sync_operator_member_trigger after insert or update of status,operator_id,operator_user_id on public.transport_company_operator_invites for each row execute function public.transport_company_sync_operator_member();
create trigger transport_company_sync_accepted_operator_fleet_trigger after insert or update of status,operator_id,company_fleet_id on public.transport_company_operator_invites for each row execute function public.transport_company_sync_accepted_operator_fleet();
create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %',message; end if; end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select test_assert((get_transport_operator_company_access()->>'feeRequired')::boolean,'solo operator requires fee');
do $$ begin
  begin perform accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000001','{}',false); raise exception 'TEST FAILED: consent bypass';
  exception when others then if sqlerrm not like 'Confirm the one-time 150%' then raise; end if; end;
  begin update transport_company_operator_invites set status='accepted' where id='50000000-0000-4000-8000-000000000001'; raise exception 'TEST FAILED: direct update bypass';
  exception when others then if sqlerrm not like 'Confirm the one-time 150%' then raise; end if; end;
end $$;
select test_assert((select balance=300 from visibility_credit_wallets where user_id=auth.uid()),'no silent charge');
-- Legacy fleet metadata must not put a newly assigned operator on duty before
-- the membership trigger has run (accepted-fleet trigger sorts before member).
update transport_company_fleets set active_status='active', is_visible_to_passengers=true
where id='30000000-0000-4000-8000-000000000001';
select transport_company_provision_runtime_fleet('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
select test_assert((select active_status='offline' and not is_visible_to_passengers from transport_fleets where company_fleet_id='30000000-0000-4000-8000-000000000001'),'stale company availability does not activate an assignment');
select accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000001','{}',true);
select test_assert((select active_status='offline' and not is_visible_to_passengers from transport_fleets where company_fleet_id='30000000-0000-4000-8000-000000000001'),'new assignment remains offline');
select accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000001','{}',true);
select accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000002','{}',false);
select test_assert((select balance=150 from visibility_credit_wallets where user_id=auth.uid()),'first, retry and second company total only 150');
select test_assert((select count(*)=1 from visibility_credit_transactions where user_id=auth.uid()),'one ledger debit');
select test_assert((select count(*)=2 from transport_company_members where user_id=auth.uid()),'two company memberships preserved');
select test_assert((select company_id is null and company_fleet_id is null from transport_fleets where id='40000000-0000-4000-8000-000000000001'),'same-plate company registration cannot steal solo fleet');
select test_assert((select count(*)=3 from transport_fleets where operator_id='10000000-0000-4000-8000-000000000001'),'same-plate runtime fleets stay separate');
select set_transport_operator_availability('40000000-0000-4000-8000-000000000001',true);
select set_transport_company_operator_availability('30000000-0000-4000-8000-000000000001',true);
select test_assert((select count(*)=1 from transport_fleets where operator_id='10000000-0000-4000-8000-000000000001' and active_status='active'),'one context only');
select test_assert((select active_status='offline' from transport_fleets where id='40000000-0000-4000-8000-000000000001'),'solo offline after company activation');
insert into transport_trips(fleet_id,status) select transport_fleet_id,'accepted' from transport_company_fleets where id='30000000-0000-4000-8000-000000000001';
do $$ begin
  begin perform set_transport_operator_availability((select transport_fleet_id from transport_company_fleets where id='30000000-0000-4000-8000-000000000002'),true); raise exception 'TEST FAILED: ongoing trip switch';
  exception when others then if sqlerrm not like 'Complete your ongoing trip%' then raise; end if; end;
  begin insert into transport_trips(fleet_id,status) values ('40000000-0000-4000-8000-000000000001','accepted'); raise exception 'TEST FAILED: inactive context trip accepted';
  exception when others then if sqlerrm not like 'Make this assigned fleet active%' then raise; end if; end;
end $$;
do $$ declare v_status text; v_trip uuid; begin
  insert into transport_trips(fleet_id,status) values ('40000000-0000-4000-8000-000000000001','requested') returning id into v_trip;
  foreach v_status in array array['arrived','start_requested','in_progress','paused'] loop
    begin update transport_trips set status=v_status where id=v_trip; raise exception 'TEST FAILED: alternate active trip status bypass';
    exception when others then if sqlerrm not like 'Make this assigned fleet active%' then raise; end if; end;
  end loop;
  delete from transport_trips where id=v_trip;
end $$;
update transport_trips set status='completed';
select set_transport_company_operator_availability('30000000-0000-4000-8000-000000000002',true);
update transport_company_members set service_status='suspended' where user_id=auth.uid() and company_id='20000000-0000-4000-8000-000000000001';
select accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000001','{"document":"updated"}',false);
select test_assert((select service_status='suspended' from transport_company_members where user_id=auth.uid() and company_id='20000000-0000-4000-8000-000000000001'),'documents cannot undo suspension');
do $$ begin
  begin update transport_company_operator_invites set status='pending' where id='50000000-0000-4000-8000-000000000001'; raise exception 'TEST FAILED: accepted->pending reset bypass';
  exception when others then if sqlerrm not like 'This invitation cannot be reopened%' then raise; end if; end;
end $$;
update transport_company_operator_invites set status='revoked' where id='50000000-0000-4000-8000-000000000001';
do $$ begin
  begin update transport_company_operator_invites set status='accepted' where id='50000000-0000-4000-8000-000000000001'; raise exception 'TEST FAILED: revoked->accepted resurrection';
  exception when others then if sqlerrm not like 'This invitation cannot be reopened%' then raise; end if; end;
  begin update transport_company_operator_invites set status='pending' where id='50000000-0000-4000-8000-000000000001'; raise exception 'TEST FAILED: revoked->pending reset';
  exception when others then if sqlerrm not like 'This invitation cannot be reopened%' then raise; end if; end;
end $$;
select test_assert((select service_status='suspended' from transport_company_members where user_id=auth.uid() and company_id='20000000-0000-4000-8000-000000000001'),'recipient cannot reactivate suspended membership');
-- Owner reissuing a genuine invitation is still supported.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
update transport_company_operator_invites set status='pending' where id='50000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000001','{}',false);
select test_assert((select service_status='active' from transport_company_members where user_id=auth.uid() and company_id='20000000-0000-4000-8000-000000000001'),'owner can authorize rejoin without a new fee');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin perform accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000003','{}',true); raise exception 'TEST FAILED: insufficient accepted';
  exception when others then if sqlerrm not like 'Not enough Visibility Credits%' then raise; end if; end;
end $$;
select test_assert((select balance=149 from visibility_credit_wallets where user_id=auth.uid()),'insufficient wallet unchanged');
select test_assert((select unlocked_at is null from transport_operator_company_access where user_id=auth.uid()),'insufficient access stays locked');
select test_assert((select status='pending' from transport_company_operator_invites where id='50000000-0000-4000-8000-000000000003'),'insufficient invite stays pending');
-- A later provisioning failure must also roll back an otherwise valid debit.
create function public.test_fail_runtime_provisioning() returns trigger language plpgsql as $$ begin raise exception 'TEST simulated fleet provisioning failure'; end $$;
create trigger test_fail_runtime_provisioning_trigger before insert on public.transport_fleets for each row execute function public.test_fail_runtime_provisioning();
update visibility_credit_wallets set balance=300 where user_id=auth.uid();
do $$ begin
  begin perform accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000003','{}',true); raise exception 'TEST FAILED: expected provisioning failure';
  exception when others then if sqlerrm <> 'TEST simulated fleet provisioning failure' then raise; end if; end;
end $$;
select test_assert((select balance=300 from visibility_credit_wallets where user_id=auth.uid()),'provisioning failure rolls back debit');
select test_assert((select unlocked_at is null from transport_operator_company_access where user_id=auth.uid()),'provisioning failure rolls back access');
select test_assert(not exists(select 1 from visibility_credit_transactions where user_id=auth.uid()),'provisioning failure rolls back ledger');
drop trigger test_fail_runtime_provisioning_trigger on public.transport_fleets;
drop function public.test_fail_runtime_provisioning();
delete from transport_fleets where id='40000000-0000-4000-8000-000000000002';
select test_assert((get_transport_operator_company_access()->>'feeRequired')::boolean,'deleting solo fleet cannot bypass fee');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
select accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000004','{}',false);
select test_assert((select credits_paid=0 and unlock_reason='company_first' from transport_operator_company_access where user_id=auth.uid()),'new company-first operator free');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
select test_assert(not (get_transport_operator_company_access()->>'feeRequired')::boolean,'existing member grandfathered');
do $$ begin
  begin perform accept_transport_company_operator_invite('50000000-0000-4000-8000-000000000003','{}',true); raise exception 'TEST FAILED: accepted another user invite';
  exception when others then if sqlerrm not like 'This company invitation is not available%' then raise; end if; end;
end $$;
select 'PASS: one-time debit, consent, retries, multi-membership, insufficient funds, solo history, grandfathering, work isolation, ongoing trip guard, suspension preservation, and invite ownership' as result;

-- Exercise actual RLS as a company owner, not the fixture's superuser.
grant usage on schema public, auth to authenticated;
grant select on transport_fleets, transport_trips to authenticated;
alter table transport_fleets enable row level security;
alter table transport_trips enable row level security;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
set role authenticated;
select test_assert(not exists(select 1 from transport_fleets where company_id is null or company_id <> '20000000-0000-4000-8000-000000000001'),'owner cannot see solo/other-company fleets');
select test_assert(exists(select 1 from transport_fleets where company_id='20000000-0000-4000-8000-000000000001'),'owner sees own fleets');
select test_assert(not has_table_privilege('authenticated','transport_operator_company_access','UPDATE'),'access unlock is not client writable');
reset role;
select 'PASS: company fleet visibility RLS and access table write protection' as result;

-- Authorized admins can add a rental and send a pending fleet invitation.
insert into transport_company_members(company_id,user_id,role,status,service_status)
values ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','admin','active','active')
on conflict(company_id,user_id) do update set role='admin',status='active',service_status='active';
grant select,insert,update on transport_company_fleets,transport_company_operator_invites to authenticated;
alter table transport_company_fleets enable row level security;
alter table transport_company_operator_invites enable row level security;
create policy fixture_staff_read_fleets on transport_company_fleets for select to authenticated
using (transport_company_user_has_permission(company_id,'manage_fleets',auth.uid()));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
insert into transport_company_fleets(id,company_id,service_category)
values ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','Rental');
insert into transport_company_operator_invites(id,company_id,company_fleet_id,operator_user_id,status)
values ('50000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','pending');
do $$ begin
  begin
    insert into transport_company_fleets(id,company_id)
    values ('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000002');
    raise exception 'TEST FAILED: staff created another company fleet';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_assert((select owner_user_id='00000000-0000-4000-8000-000000000005' from transport_companies where id='20000000-0000-4000-8000-000000000001'),'admin submission preserves company owner');
select 'PASS: admin rental and pending invitation creation, cross-company isolation';
