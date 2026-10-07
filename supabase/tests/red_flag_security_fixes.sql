-- Run ONLY against the disposable redflag_test database:
-- psql -h /tmp -p 55432 -U pgtest -d redflag_test -v ON_ERROR_STOP=1 -f supabase/tests/red_flag_security_fixes.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'redflag_test' then raise exception 'This fixture requires the disposable redflag_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists storage cascade;
create schema public;
create schema auth;
create schema storage;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth, storage to authenticated;

create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
-- The old open policy the migration replaces.
create policy "business owners read marketplace media" on storage.objects for select using (bucket_id = 'marketplace-business-media');

create table public.kunthai_admins(user_id uuid primary key);
create function public.is_kunthai_admin(user_uuid uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public
  as $$ select exists(select 1 from public.kunthai_admins where user_id = user_uuid) $$;
create function public.admin_has_permission(permission_key text, sector text) returns boolean language sql stable security definer set search_path = public
  as $$ select public.is_kunthai_admin() $$;

create type public.transport_verification_status as enum ('verified','not_verified','verification_pending');
create table public.transport_operators(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, verification_status public.transport_verification_status default 'not_verified', account_status text default 'draft');
create table public.transport_companies(id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users,
  verification_status text default 'pending', account_status text default 'draft', admin_note text, rejection_reason text, reviewed_by uuid, reviewed_at timestamptz, company_name text);
create table public.transport_company_fleets(id uuid primary key default gen_random_uuid(), company_id uuid references public.transport_companies, verification_status text default 'pending_review', fleet_name text);
create table public.transport_fleets(id uuid primary key default gen_random_uuid(), operator_id uuid references public.transport_operators, company_fleet_id uuid, verification_status public.transport_verification_status default 'not_verified', fleet_name text);
create table public.transport_company_operator_invites(id uuid primary key default gen_random_uuid(), company_id uuid references public.transport_companies, operator_id uuid references public.transport_operators, operator_user_id uuid references auth.users, operator_public_id text, operator_name text, status text default 'pending', responded_at timestamptz);
create table public.transport_company_members(id uuid primary key default gen_random_uuid(), company_id uuid references public.transport_companies, user_id uuid references auth.users, operator_id uuid references public.transport_operators, public_id text, full_name text, role text default 'operator', status text default 'active', service_status text default 'active', permissions jsonb not null default '{}', responsibilities text[] not null default '{}', joined_at timestamptz, updated_at timestamptz default now(), unique(company_id, user_id));

create table public.marketplace_businesses(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users);
create table public.marketplace_business_documents(id uuid primary key default gen_random_uuid(), business_id uuid references public.marketplace_businesses on delete cascade, document_type text not null default '', file_name text not null default '', file_url text not null default '');
create table public.marketplace_orders(id uuid primary key default gen_random_uuid(), business_id uuid references public.marketplace_businesses on delete cascade, buyer_id uuid references auth.users, status text not null default 'pending');
alter table public.marketplace_orders enable row level security;
grant select, insert, update, delete on public.marketplace_orders to authenticated;
create policy "business owners manage orders" on public.marketplace_orders for all
  using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));
create policy "Buyers can cancel their pending marketplace orders" on public.marketplace_orders for update
  using (buyer_id = auth.uid() and status = 'pending') with check (buyer_id = auth.uid() and status in ('pending', 'cancelled'));
create policy "buyers read own marketplace orders" on public.marketplace_orders for select using (buyer_id = auth.uid());
grant select on public.marketplace_businesses to authenticated;

-- Users: 1 owner/seller, 2 buyer, 3 operator, 4 KunThai admin, 5 removed admin.
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004'),('00000000-0000-4000-8000-000000000005');
insert into public.kunthai_admins values ('00000000-0000-4000-8000-000000000004');

\ir ../migrations/20261007150000_red_flag_security_fixes.sql

create trigger transport_company_sync_operator_member_trigger after insert or update of status on public.transport_company_operator_invites
  for each row execute function public.transport_company_sync_operator_member();
create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;

-- ---------- 1. Documents bucket ----------
select test_assert((select public = false from storage.buckets where id = 'marketplace-business-documents'), 'documents bucket is private');
insert into storage.objects(bucket_id, name) values
  ('marketplace-business-media', '00000000-0000-4000-8000-000000000001/documents/id.png'),
  ('marketplace-business-documents', '00000000-0000-4000-8000-000000000001/registration/id.pdf');
set role authenticated;
select as_user('00000000-0000-4000-8000-000000000002');
select test_assert((select count(*) from storage.objects) = 0, 'a stranger cannot list another seller''s media or documents');
select as_user('00000000-0000-4000-8000-000000000001');
select test_assert((select count(*) from storage.objects) = 2, 'the owner sees their own files');
select as_user('00000000-0000-4000-8000-000000000004');
select test_assert((select count(*) from storage.objects where bucket_id = 'marketplace-business-documents') = 1, 'a KunThai admin can read documents for review');
select as_user('00000000-0000-4000-8000-000000000001');
delete from storage.objects where bucket_id = 'marketplace-business-documents';
select test_assert((select count(*) from storage.objects where bucket_id = 'marketplace-business-documents') = 0, 'the owner can delete their own document');
reset role;

-- ---------- 2. Verification guards ----------
select as_user('00000000-0000-4000-8000-000000000003');
insert into public.transport_operators(id, user_id, verification_status, account_status)
  values ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'verified', 'approved');
select test_assert((select verification_status::text = 'verification_pending' and account_status = 'submitted' from public.transport_operators where id = '10000000-0000-4000-8000-000000000003'), 'a new operator cannot start verified/approved');

insert into public.transport_fleets(id, operator_id, verification_status) values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'verified');
select test_assert((select verification_status::text = 'verification_pending' from public.transport_fleets where id = '40000000-0000-4000-8000-000000000001'), 'a new solo fleet cannot start verified');
update public.transport_fleets set verification_status = 'verified' where id = '40000000-0000-4000-8000-000000000001';
select test_assert((select verification_status::text = 'verification_pending' from public.transport_fleets where id = '40000000-0000-4000-8000-000000000001'), 'an operator cannot verify their own fleet');
update public.transport_fleets set verification_status = 'not_verified' where id = '40000000-0000-4000-8000-000000000001';
select test_assert((select verification_status::text = 'not_verified' from public.transport_fleets where id = '40000000-0000-4000-8000-000000000001'), 'unreviewed states can still change (pending -> not verified)');

select as_user('00000000-0000-4000-8000-000000000004');
update public.transport_fleets set verification_status = 'verified' where id = '40000000-0000-4000-8000-000000000001';
select test_assert((select verification_status::text = 'verified' from public.transport_fleets where id = '40000000-0000-4000-8000-000000000001'), 'an admin can verify a fleet');
select as_user('00000000-0000-4000-8000-000000000003');
update public.transport_fleets set verification_status = 'verification_pending', fleet_name = 'Edited' where id = '40000000-0000-4000-8000-000000000001';
select test_assert((select verification_status::text = 'verified' and fleet_name = 'Edited' from public.transport_fleets where id = '40000000-0000-4000-8000-000000000001'), 'editing a verified fleet keeps it verified and saves the edit');

-- Company, company fleet and its runtime fleet
select as_user('00000000-0000-4000-8000-000000000001');
insert into public.transport_companies(id, owner_user_id, verification_status, account_status)
  values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'verified', 'approved');
select test_assert((select verification_status = 'pending' and account_status = 'submitted' from public.transport_companies where id = '20000000-0000-4000-8000-000000000001'), 'a new company cannot start verified/approved');
insert into public.transport_company_fleets(id, company_id, verification_status) values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'verified');
select test_assert((select verification_status = 'pending_review' from public.transport_company_fleets where id = '30000000-0000-4000-8000-000000000001'), 'a new company fleet cannot start verified');

select as_user('00000000-0000-4000-8000-000000000004');
update public.transport_companies set verification_status = 'rejected', account_status = 'suspended', admin_note = 'Fake papers' where id = '20000000-0000-4000-8000-000000000001';
select as_user('00000000-0000-4000-8000-000000000001');
update public.transport_companies set verification_status = 'pending', account_status = 'submitted', admin_note = '', company_name = 'Renamed' where id = '20000000-0000-4000-8000-000000000001';
select test_assert((select verification_status = 'rejected' and account_status = 'suspended' and admin_note = 'Fake papers' and company_name = 'Renamed' from public.transport_companies where id = '20000000-0000-4000-8000-000000000001'), 'a suspended company stays suspended after editing, keeps the admin note, and the edit saves');
update public.transport_companies set account_status = 'approved' where id = '20000000-0000-4000-8000-000000000001';
select test_assert((select account_status = 'suspended' from public.transport_companies where id = '20000000-0000-4000-8000-000000000001'), 'an owner cannot approve their own company');

select as_user('00000000-0000-4000-8000-000000000003');
insert into public.transport_fleets(id, operator_id, company_fleet_id, verification_status) values ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'verified');
select test_assert((select verification_status::text = 'verification_pending' from public.transport_fleets where id = '40000000-0000-4000-8000-000000000002'), 'a runtime fleet mirrors its unreviewed company fleet');
select as_user('00000000-0000-4000-8000-000000000004');
update public.transport_company_fleets set verification_status = 'verified' where id = '30000000-0000-4000-8000-000000000001';
select as_user('00000000-0000-4000-8000-000000000003');
-- The company sync (run as the operator) writes the mirrored value.
update public.transport_fleets set verification_status = 'verified' where id = '40000000-0000-4000-8000-000000000002';
select test_assert((select verification_status::text = 'verified' from public.transport_fleets where id = '40000000-0000-4000-8000-000000000002'), 'a runtime fleet follows its verified company fleet');
select as_user('00000000-0000-4000-8000-000000000004');
update public.transport_company_fleets set verification_status = 'suspended' where id = '30000000-0000-4000-8000-000000000001';
select as_user('00000000-0000-4000-8000-000000000003');
update public.transport_fleets set verification_status = 'verification_pending' where id = '40000000-0000-4000-8000-000000000002';
select test_assert((select verification_status::text = 'not_verified' from public.transport_fleets where id = '40000000-0000-4000-8000-000000000002'), 'a runtime fleet of a suspended company fleet cannot claim another status');

-- ---------- 3. Removed admin re-joins as operator ----------
select as_user('00000000-0000-4000-8000-000000000001');
insert into public.transport_company_members(company_id, user_id, role, status, service_status, permissions, responsibilities)
  values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'admin', 'removed', 'removed', '{"manage_operators": true}', '{finance}');
insert into public.transport_company_members(company_id, user_id, role, status, service_status, permissions)
  values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'operator', 'active', 'active', '{"dispatch_bookings": true}');
insert into public.transport_company_operator_invites(id, company_id, operator_user_id, status) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'pending'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'pending');
update public.transport_company_operator_invites set status = 'accepted' where id in ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002');
select test_assert((select role = 'operator' and status = 'active' and permissions = '{}'::jsonb and responsibilities = '{}'::text[] from public.transport_company_members where user_id = '00000000-0000-4000-8000-000000000005'), 'a removed admin returns as a plain operator');
select test_assert((select permissions = '{"dispatch_bookings": true}'::jsonb from public.transport_company_members where user_id = '00000000-0000-4000-8000-000000000003'), 'an active operator keeps their permissions');

-- ---------- 4. Orders ----------
reset role;
insert into public.marketplace_businesses(id, user_id) values ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
insert into public.marketplace_orders(id, business_id, buyer_id, status) values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'pending'),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'completed'),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'pending');
set role authenticated;
select as_user('00000000-0000-4000-8000-000000000002');
update public.marketplace_orders set status = 'cancelled' where id = '70000000-0000-4000-8000-000000000001';
select as_user('00000000-0000-4000-8000-000000000001');
do $$ begin
  begin
    update public.marketplace_orders set status = 'shipped' where id = '70000000-0000-4000-8000-000000000001';
    raise exception 'TEST FAILED: seller overwrote a buyer cancellation';
  exception when check_violation then null;
  end;
end $$;
update public.marketplace_orders set status = 'shipped' where id = '70000000-0000-4000-8000-000000000003';
update public.marketplace_orders set status = 'completed' where id = '70000000-0000-4000-8000-000000000003';
select test_assert((select status = 'completed' from public.marketplace_orders where id = '70000000-0000-4000-8000-000000000003'), 'pending -> shipped -> completed works');
delete from public.marketplace_orders where id = '70000000-0000-4000-8000-000000000002';
select test_assert((select count(*) = 1 from public.marketplace_orders where id = '70000000-0000-4000-8000-000000000002'), 'a completed order cannot be deleted');
delete from public.marketplace_orders where id = '70000000-0000-4000-8000-000000000001';
select test_assert((select count(*) = 0 from public.marketplace_orders where id = '70000000-0000-4000-8000-000000000001'), 'a cancelled order can be deleted');
reset role;
delete from public.marketplace_businesses where id = '60000000-0000-4000-8000-000000000001';
select test_assert((select count(*) = 0 from public.marketplace_orders), 'deleting the business still removes its orders');

select 'red flag security fixes: all assertions passed' as result;
