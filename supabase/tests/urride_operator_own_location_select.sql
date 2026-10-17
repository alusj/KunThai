-- Run ONLY against an isolated, disposable urride_own_location_test database:
-- createdb -h <host> -p <port> urride_own_location_test
-- psql -h <host> -p <port> -d urride_own_location_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/urride_operator_own_location_select.sql
-- Recreates transport_operator_locations with its production policies, proves
-- the bug (a stale or offline row locks its own operator out), loads the fix
-- (twice, to prove it is re-runnable) and asserts operators can write their
-- own row again while passengers still only see fresh online/busy rows.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'urride_own_location_test' then raise exception 'This fixture requires the disposable urride_own_location_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated, anon;

create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create table public.transport_operator_locations(
  operator_id uuid primary key references auth.users on delete cascade,
  display_name text, transport_type text, available boolean not null default true,
  status text not null default 'online', lat double precision, lng double precision,
  last_seen_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.transport_operator_locations enable row level security;
grant select, insert, update on public.transport_operator_locations to authenticated, anon;

-- Production policies before the fix (pg_policies, 2026-10-17).
create policy "Anyone can view active nearby operators" on public.transport_operator_locations for select
  using (status = any (array['online', 'busy']) and last_seen_at > now() - interval '10 minutes'
    and (available = true or status = 'busy'
      or lower(coalesce(metadata ->> 'booked', 'false')) = any (array['true', '1', 'yes'])
      or lower(coalesce(metadata ->> 'isBooked', 'false')) = any (array['true', '1', 'yes'])));
create policy "Operators can insert own live location" on public.transport_operator_locations for insert
  with check (operator_id = auth.uid());
create policy "Operators can update own live location" on public.transport_operator_locations for update
  using (operator_id = auth.uid()) with check (operator_id = auth.uid());

-- a: the operator under test; b: another operator.
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.transport_operator_locations (operator_id, status, available, lat, lng, last_seen_at) values
  ('00000000-0000-0000-0000-00000000000a', 'online', true, 8.47, -13.27, now() - interval '6 hours'),
  ('00000000-0000-0000-0000-00000000000b', 'offline', false, 8.48, -13.26, now() - interval '6 hours');

-- The app's upsert (operatorLiveLocationService.publishRow) as operator a.
create function pg_temp.publish_as_a() returns void language sql as $$
  insert into public.transport_operator_locations (operator_id, display_name, transport_type, available, status, lat, lng, last_seen_at, updated_at)
  values ('00000000-0000-0000-0000-00000000000a', 'A', 'car', true, 'online', 8.471, -13.271, now(), now())
  on conflict (operator_id) do update set lat = excluded.lat, lng = excluded.lng, status = excluded.status,
    available = excluded.available, last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at;
$$;

-- Before the fix: the stale row locks operator a out (the production bug).
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
do $$
begin
  perform pg_temp.publish_as_a();
  raise exception 'expected the stale-row upsert to fail before the fix';
exception when insufficient_privilege then null;
end $$;
reset role;

\ir ../migrations/20261017100000_urride_operator_own_location_select.sql
\ir ../migrations/20261017100000_urride_operator_own_location_select.sql

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
do $$
declare v_rows integer; v_status text;
begin
  -- 1. Stale row: publishing works again.
  perform pg_temp.publish_as_a();
  select status into v_status from public.transport_operator_locations where operator_id = '00000000-0000-0000-0000-00000000000a';
  if v_status is distinct from 'online' then raise exception 'stale upsert: expected online, got %', v_status; end if;

  -- 2. Going offline (markOffline) updates the row instead of matching 0 rows.
  update public.transport_operator_locations set status = 'offline', available = false
    where operator_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'offline update: expected 1 row, got %', v_rows; end if;

  -- 3. Back online after going offline.
  perform pg_temp.publish_as_a();
  select status into v_status from public.transport_operator_locations where operator_id = '00000000-0000-0000-0000-00000000000a';
  if v_status is distinct from 'online' then raise exception 'online after offline: expected online, got %', v_status; end if;

  -- 4. Another operator's stale/offline row stays invisible and untouchable.
  if exists (select 1 from public.transport_operator_locations where operator_id = '00000000-0000-0000-0000-00000000000b') then
    raise exception 'operator a can see operator b''s offline row';
  end if;
  update public.transport_operator_locations set status = 'online' where operator_id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'operator a updated operator b''s row'; end if;
end $$;
reset role;

-- 5. Passengers (anon) see operator a's fresh row and still not b's offline row.
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$
begin
  if (select count(*) from public.transport_operator_locations) <> 1 then
    raise exception 'anon should see exactly the one fresh online row';
  end if;
end $$;
reset role;

select 'urride_operator_own_location_select: all assertions passed' as result;
