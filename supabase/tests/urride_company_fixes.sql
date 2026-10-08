-- Run ONLY against the disposable company_fixes_test database:
-- psql -h /tmp -p 55434 -U pgtest -d company_fixes_test -v ON_ERROR_STOP=1 -f supabase/tests/urride_company_fixes.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'company_fixes_test' then raise exception 'This fixture requires the disposable company_fixes_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Minimal stand-ins for the tables and helpers the migration builds on.
create table public.transport_companies(id uuid primary key, owner_user_id uuid, company_name text default 'Co', phone text, email text, country text default 'Sierra Leone', city text);
create table public.transport_company_members(id uuid primary key default gen_random_uuid(), company_id uuid, user_id uuid, operator_id uuid, public_id text, role text default 'operator',
  status text default 'active', service_status text default 'active', permissions jsonb default '{}', suspended_at timestamptz, managed_by uuid, updated_at timestamptz);
create table public.transport_company_fleets(id uuid primary key, company_id uuid references public.transport_companies, operator_id uuid, service_category text default 'Ride and delivery',
  operators jsonb not null default '[]', is_visible_to_passengers boolean default true, updated_at timestamptz);
create table public.transport_operators(id uuid primary key, user_id uuid);
create table public.transport_fleets(id uuid primary key default gen_random_uuid(), operator_id uuid, company_id uuid, company_fleet_id uuid references public.transport_company_fleets on delete set null,
  active_status text default 'active', is_visible_to_passengers boolean default true, updated_at timestamptz);
create table public.transport_trips(id uuid primary key default gen_random_uuid(), fleet_id uuid references public.transport_fleets on delete set null);
create table public.transport_company_operator_invites(id uuid primary key default gen_random_uuid(), company_id uuid,
  company_fleet_id uuid references public.transport_company_fleets on delete cascade, operator_id uuid, operator_user_id uuid, operator_public_id text,
  status text default 'pending', created_at timestamptz default now(), updated_at timestamptz);
create table public.transport_company_rentals(id uuid primary key default gen_random_uuid(), company_id uuid, company_fleet_id uuid unique references public.transport_company_fleets on delete restrict,
  title text default 'Car', status text default 'available', deleted_at timestamptz, created_at timestamptz default now(), updated_at timestamptz);
create table public.transport_rental_reservations(id uuid primary key default gen_random_uuid(), rental_id uuid references public.transport_company_rentals, customer_user_id uuid,
  starts_at timestamptz, ends_at timestamptz, total_price numeric default 10, proposed_total numeric, status text default 'requested'
    check (status in ('requested','confirmed','active','completed','declined','cancelled')),
  managed_by uuid, completed_at timestamptz, updated_at timestamptz);
create table public.transport_rental_reviews(id uuid primary key default gen_random_uuid(), rental_id uuid, reservation_id uuid, customer_user_id uuid, edit_count integer default 0, created_at timestamptz default now());
create function public.transport_company_user_has_permission(c uuid, p text, u uuid default auth.uid()) returns boolean language sql stable as $$
  select exists(select 1 from public.transport_companies where id = c and owner_user_id = u)
    or exists(select 1 from public.transport_company_members where company_id = c and user_id = u and status = 'active' and coalesce(service_status, 'active') = 'active'
      and (role = 'admin' or (role = 'fleet_manager' and p = 'manage_fleets'))) $$;
create function public.can_manage_transport_rentals(c uuid) returns boolean language sql stable as $$
  select exists(select 1 from public.transport_companies where id = c and owner_user_id = auth.uid()) $$;
create function public.kunthai_business_effective_entitlement(s text, e uuid) returns table(vehicle_limit integer, plan_code text) language sql as $$ select 2, 'free'::text $$;
create function public.kunthai_raise_capacity_limit(s text, r text, c integer, l integer, p text) returns void language plpgsql as $$ begin raise exception 'capacity % %/%', r, c, l using errcode = 'P0001'; end $$;
create function public.kunthai_business_usage_before_urmall_retention(s text, e uuid) returns jsonb language sql as $$ select '{"products":0,"operators":99,"vehicles":99,"admins":0}'::jsonb $$;
create table public.kunthai_urmall_retention_inventory(business_id uuid, eligible_to_keep boolean);
create function public.kunthai_guard_urride_vehicle_capacity() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger kunthai_guard_urride_vehicle_capacity before insert or update of company_id on public.transport_company_fleets
  for each row execute function public.kunthai_guard_urride_vehicle_capacity();
-- The public profile as the 2026-09-06 migration shaped its operator join.
create function public.get_public_transport_company_profile(p_company_id uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('fleet', cf.id, 'operator_name', op.id)), '[]'::jsonb)
  from public.transport_company_fleets cf
  left join lateral (select runtime.* from public.transport_fleets runtime where runtime.company_fleet_id = cf.id limit 1) tf on true
  left join public.transport_operators op on op.id = tf.operator_id
  where cf.company_id = p_company_id $$;

-- Invite triggers as production had them before this migration. A legacy
-- accepted invite with no linked operator made the old guard reject the
-- expires_at backfill, which rolled the whole migration back.
create table public.transport_operator_company_access(user_id uuid primary key, unlocked_at timestamptz, solo_started_at timestamptz, unlock_reason text, first_invite_id uuid);
create function public.transport_company_invite_is_for_user(i uuid, u uuid default auth.uid()) returns boolean language sql stable as $$
  select exists(select 1 from public.transport_company_operator_invites where id = i and operator_user_id = u) $$;
create table public.legacy_member_sync_log(invite_id uuid);
insert into public.transport_companies(id, owner_user_id) values ('00000000-0000-0000-0000-00000000c0de', '00000000-0000-0000-0000-00000000000a');
insert into public.transport_company_operator_invites(id, company_id, status, operator_user_id, operator_id)
values ('00000000-0000-0000-0000-0000000001e9', '00000000-0000-0000-0000-00000000c0de', 'accepted', null, null);
create function public.transport_guard_company_invite_acceptance() returns trigger language plpgsql as $$
begin
  if new.status = 'accepted' and new.operator_user_id is null
    and not exists (select 1 from public.transport_operators where id = new.operator_id and user_id is not null) then
    raise exception 'Link your operator profile before accepting this invitation.';
  end if;
  return new;
end $$;
create trigger transport_guard_company_invite_acceptance_trigger before insert or update on public.transport_company_operator_invites
  for each row execute function public.transport_guard_company_invite_acceptance();
create function public.legacy_member_sync() returns trigger language plpgsql as $$
begin insert into public.legacy_member_sync_log values (new.id); return new; end $$;
create trigger legacy_member_sync_trigger after update on public.transport_company_operator_invites
  for each row execute function public.legacy_member_sync();

\ir ../migrations/20261008140000_urride_company_fixes.sql

-- The backfill ran past the legacy invite without firing the invite triggers.
do $$ begin
  if (select expires_at is null from public.transport_company_operator_invites where id = '00000000-0000-0000-0000-0000000001e9') then
    raise exception 'TEST FAILED: legacy accepted invite gets an expiry date'; end if;
  if exists (select 1 from public.legacy_member_sync_log) then raise exception 'TEST FAILED: backfill does not fire member sync'; end if;
end $$;

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create function public.expect_error(statement text, message text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    return;
  end;
  raise exception 'TEST FAILED: %', message;
end $$;

-- Owner ...01, admin ...02, operator user ...11 (operator ...a1), stranger ...99
insert into public.transport_companies(id, owner_user_id) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
insert into public.transport_operators values ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000011');
insert into public.transport_company_members(id, company_id, user_id, role) values
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'admin');
insert into public.transport_company_members(id, company_id, user_id, operator_id) values
  ('40000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-0000000000a1');
insert into public.transport_company_fleets(id, company_id, operator_id, operators) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a1', '[{"status":"accepted","operatorId":"10000000-0000-4000-8000-0000000000a1"}]'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a1', '[{"status":"accepted","userId":"00000000-0000-4000-8000-000000000011"}]');
insert into public.transport_fleets(id, operator_id, company_id, company_fleet_id) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002');
-- Seed accepted invites directly, as the app's earlier acceptance did.
alter table public.transport_company_operator_invites disable trigger transport_guard_company_invite_acceptance_trigger;
insert into public.transport_company_operator_invites(company_id, company_fleet_id, operator_id, operator_user_id, status) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000011', 'accepted'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', null, '00000000-0000-4000-8000-000000000011', 'accepted');

alter table public.transport_company_operator_invites enable trigger transport_guard_company_invite_acceptance_trigger;

-- 0. Editing an accepted legacy invite no longer trips the acceptance checks,
--    but accepting an invite still needs a linked operator profile.
update public.transport_company_operator_invites set updated_at = now() where id = '00000000-0000-0000-0000-0000000001e9';
select public.expect_error($q$insert into public.transport_company_operator_invites(company_id, status) values ('00000000-0000-0000-0000-00000000c0de', 'accepted')$q$,
  'Link your operator profile');

-- 1. Invitations expire after 30 days and cannot be accepted
insert into public.transport_company_operator_invites(id, company_id, operator_user_id, status, expires_at) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000021', 'pending', now() + interval '1 year');
select test_assert((select expires_at < now() + interval '31 days' from public.transport_company_operator_invites where id = '50000000-0000-4000-8000-000000000001'), 'a client cannot choose its own expiry');
alter table public.transport_company_operator_invites disable trigger guard_transport_company_invite_expiry_trigger;
update public.transport_company_operator_invites set expires_at = now() - interval '1 day' where id = '50000000-0000-4000-8000-000000000001';
alter table public.transport_company_operator_invites enable trigger guard_transport_company_invite_expiry_trigger;
select expect_error($$update public.transport_company_operator_invites set status = 'accepted' where id = '50000000-0000-4000-8000-000000000001'$$, 'an expired invitation was accepted');
update public.transport_company_operator_invites set status = 'revoked' where id = '50000000-0000-4000-8000-000000000001';
update public.transport_company_operator_invites set status = 'pending' where id = '50000000-0000-4000-8000-000000000001';
select public.as_user('00000000-0000-4000-8000-000000000021');
update public.transport_company_operator_invites set status = 'accepted' where id = '50000000-0000-4000-8000-000000000001';
select public.as_user('');
select test_assert((select status = 'accepted' from public.transport_company_operator_invites where id = '50000000-0000-4000-8000-000000000001'), 'a reopened invitation gets a fresh 30 days');

-- 1b. The owner cannot be invited as an operator
select expect_error($$insert into public.transport_company_operator_invites(company_id, operator_user_id, status) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'pending')$$, 'the owner was invited as an operator');

-- 2. Removing a member: permission, owner and self checks
select as_user('00000000-0000-4000-8000-000000000099');
select expect_error($$select manage_transport_company_member('40000000-0000-4000-8000-000000000011', 'remove')$$, 'a stranger removed an operator');
select as_user('00000000-0000-4000-8000-000000000002');
select expect_error($$select manage_transport_company_member('40000000-0000-4000-8000-000000000002', 'remove')$$, 'an admin removed themselves');

-- Suspension keeps accepted assignments but takes vehicles offline
insert into public.transport_company_operator_invites(company_id, operator_user_id, status) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'pending');
select manage_transport_company_member('40000000-0000-4000-8000-000000000011', 'suspend');
select test_assert((select service_status = 'suspended' from public.transport_company_members where id = '40000000-0000-4000-8000-000000000011'), 'the member is suspended');
select test_assert((select count(*) = 2 from public.transport_company_operator_invites where operator_user_id = '00000000-0000-4000-8000-000000000011' and status = 'accepted'), 'suspension keeps accepted assignments');
select test_assert((select count(*) = 0 from public.transport_company_operator_invites where operator_user_id = '00000000-0000-4000-8000-000000000011' and status = 'pending'), 'suspension withdraws pending invitations');
select test_assert((select bool_and(active_status = 'offline' and not is_visible_to_passengers) from public.transport_fleets), 'suspension takes the vehicles offline');

-- Removal revokes every invitation and clears both fleets
select manage_transport_company_member('40000000-0000-4000-8000-000000000011', 'remove');
select test_assert((select status = 'removed' from public.transport_company_members where id = '40000000-0000-4000-8000-000000000011'), 'the member is removed');
select test_assert((select count(*) = 0 from public.transport_company_operator_invites where operator_user_id = '00000000-0000-4000-8000-000000000011' and status in ('pending', 'accepted')), 'every invitation in the company is revoked');
select test_assert((select bool_and(operator_id is null and operators -> 0 ->> 'status' = 'revoked') from public.transport_company_fleets), 'the operator is cleared from both fleets');

-- 3. The public profile no longer names the removed operator
select test_assert((select bool_and(item ->> 'operator_name' is null) from jsonb_array_elements(get_public_transport_company_profile('20000000-0000-4000-8000-000000000001')) item), 'the public profile hides a removed operator');

-- 4. Deleting a fleet deletes its live vehicle without trips, keeps one with trips
insert into public.transport_trips(fleet_id) values ('60000000-0000-4000-8000-000000000002');
select as_user('00000000-0000-4000-8000-000000000001');
select manage_transport_company_fleet('30000000-0000-4000-8000-000000000001', 'delete');
select manage_transport_company_fleet('30000000-0000-4000-8000-000000000002', 'delete');
select test_assert((select count(*) = 0 from public.transport_fleets where id = '60000000-0000-4000-8000-000000000001'), 'a vehicle without trips is deleted with its fleet');
select test_assert((select company_fleet_id is null and company_id is not null and active_status = 'offline' and not is_visible_to_passengers
  from public.transport_fleets where id = '60000000-0000-4000-8000-000000000002'), 'a vehicle with trips is kept offline and still tagged with the company');

-- 5/6. Rentals
insert into public.transport_company_fleets(id, company_id, service_category) values
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Rental'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Rental');
insert into public.transport_company_rentals(id, company_id, company_fleet_id, status) values
  ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'available'),
  ('70000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'hidden');
select test_assert(transport_company_counted_fleets('20000000-0000-4000-8000-000000000001') = 2, 'two rental fleets count');

-- A request whose pickup passed no longer blocks deletion
insert into public.transport_rental_reservations(id, rental_id, customer_user_id, starts_at, ends_at) values
  ('80000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000031', now() - interval '1 day', now() + interval '1 day');
select delete_transport_rental_fleet('70000000-0000-4000-8000-000000000003');
select test_assert((select status = 'declined' from public.transport_rental_reservations where id = '80000000-0000-4000-8000-000000000001'), 'the stale request is declined');
select test_assert((select archived_at is not null from public.transport_company_fleets where id = '30000000-0000-4000-8000-000000000003'), 'the deleted rental fleet is archived');
select test_assert(transport_company_counted_fleets('20000000-0000-4000-8000-000000000001') = 1, 'a deleted rental uses no vehicle slot');
select test_assert((kunthai_business_usage('urride', '20000000-0000-4000-8000-000000000001') ->> 'vehicles')::integer = 1, 'plan usage leaves out the deleted rental');

-- A hidden vehicle can still confirm an existing request
insert into public.transport_rental_reservations(id, rental_id, customer_user_id, starts_at, ends_at) values
  ('80000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000031', now() + interval '1 day', now() + interval '2 days'),
  ('80000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000031', now() - interval '1 hour', now() + interval '2 hours');
select update_transport_rental_reservation('80000000-0000-4000-8000-000000000002', 'confirmed');
select test_assert((select status = 'confirmed' from public.transport_rental_reservations where id = '80000000-0000-4000-8000-000000000002'), 'a hidden vehicle confirms an existing request');
select expect_error($$select update_transport_rental_reservation('80000000-0000-4000-8000-000000000003', 'confirmed')$$, 'a request with a passed pickup was confirmed');

-- Display status follows the booking covering now; listing pages
update public.transport_rental_reservations set status = 'active' where id = '80000000-0000-4000-8000-000000000003';
select test_assert((select item ->> 'display_status' = 'rented_out' from list_transport_rentals('70000000-0000-4000-8000-000000000004') item), 'a vehicle on rent shows as rented out');
select test_assert((select count(*) = 1 from list_transport_rentals(null, '20000000-0000-4000-8000-000000000001', null, 1, 0)), 'one row per page of one');
select test_assert((select count(*) = 1 from list_transport_rentals(null, '20000000-0000-4000-8000-000000000001', null, 1, 1)), 'the second page holds the second rental');

-- 7. Review eligibility mirrors the save rules
select as_user('00000000-0000-4000-8000-000000000031');
select test_assert((select not eligible from get_transport_rental_review_eligibility('70000000-0000-4000-8000-000000000004')), 'no completed rental, no review');
update public.transport_rental_reservations set status = 'completed', completed_at = now() - interval '40 days' where id = '80000000-0000-4000-8000-000000000003';
select test_assert((select not eligible from get_transport_rental_review_eligibility('70000000-0000-4000-8000-000000000004')), 'a rental completed over 30 days ago cannot be reviewed');
update public.transport_rental_reservations set completed_at = now() - interval '2 days' where id = '80000000-0000-4000-8000-000000000003';
select test_assert((select eligible and mode = 'new' from get_transport_rental_review_eligibility('70000000-0000-4000-8000-000000000004')), 'a recent completed rental can be reviewed');
insert into public.transport_rental_reviews(rental_id, reservation_id, customer_user_id) values
  ('70000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000031');
select test_assert((select eligible and mode = 'edit' from get_transport_rental_review_eligibility('70000000-0000-4000-8000-000000000004')), 'a fresh review can be edited once');
update public.transport_rental_reviews set edit_count = 1;
select test_assert((select not eligible from get_transport_rental_review_eligibility('70000000-0000-4000-8000-000000000004')), 'an edited review is locked');

select 'urride company fixes: all assertions passed' as result;
