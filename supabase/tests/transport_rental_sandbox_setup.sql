-- Isolated PostgreSQL fixture only. Never run against a deployed Supabase DB.
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
grant usage on schema auth,public to anon,authenticated;
create table public.transport_companies(id uuid primary key,owner_user_id uuid references auth.users,company_name text,phone text,email text,country text,city text);
create table public.transport_company_members(id uuid primary key,company_id uuid references transport_companies,user_id uuid references auth.users,role text,status text,service_status text);
create table public.transport_company_fleets(id uuid primary key,company_id uuid references transport_companies,service_category text,operator_id uuid,operators jsonb default '[]',fleet_name text, constraint transport_company_fleets_service_category_check check(service_category in ('Ride only','Delivery only','Ride and delivery')));
create table public.transport_company_operator_invites(id uuid primary key,company_fleet_id uuid references transport_company_fleets);
create table public.transport_fleets(id uuid primary key,company_fleet_id uuid references transport_company_fleets);
create table public.platform_notifications(id uuid primary key default gen_random_uuid(),user_id uuid,sector text,notification_type text,title text,body text,priority text,status text,category text,workspace text,workspace_id uuid,action_target text,action_data jsonb,channels text[],presentation text,dedupe_key text);
create unique index on public.platform_notifications(user_id,dedupe_key) where dedupe_key is not null;
\ir ../migrations/20260905160000_urride_company_rentals.sql

insert into auth.users select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n;
insert into transport_companies values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Fixture Rentals','+23200000000','fixture@example.invalid','Sierra Leone','Freetown');
insert into transport_company_members values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','admin','active','active'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','fleet_manager','active','active'),
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','admin','active','suspended');
insert into transport_company_fleets(id,company_id,service_category,fleet_name) values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Rental','Fixture car');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.save_transport_rental('30000000-0000-0000-0000-000000000001','{"title":"Fixture car","currency":"SLE","daily_rate":100,"deposit":50,"terms":"Return with full tank.","photos":["https://example.invalid/car.jpg"],"pickup_address":"Fixture entrance","latitude":8.48,"longitude":-13.2,"status":"available"}');
