-- KUNTHAI AREA VIEW HARDENING SQL
-- Tables: search history, locations, live operators, reports, navigation sessions, traffic, weather

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- Updated timestamp trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admin table
create table if not exists public.nearby_area_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_nearby_area_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nearby_area_admins
    where user_id = auth.uid()
  );
$$;

-- 1. Search History
create table if not exists public.nearby_area_search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_text text not null,
  place_name text,
  place_address text,
  category text,
  lat double precision,
  lng double precision,
  source text default 'area_view',
  selected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  searched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.nearby_area_search_history enable row level security;

drop policy if exists "Users can insert own search history" on public.nearby_area_search_history;
create policy "Users can insert own search history"
on public.nearby_area_search_history
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can view own search history" on public.nearby_area_search_history;
create policy "Users can view own search history"
on public.nearby_area_search_history
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can delete own search history" on public.nearby_area_search_history;
create policy "Users can delete own search history"
on public.nearby_area_search_history
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists nearby_area_search_history_user_time_idx
on public.nearby_area_search_history(user_id, searched_at desc);

-- 2. Missing / Saved / Approved Locations
create table if not exists public.nearby_area_locations (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id) on delete set null,
  name text not null,
  category text not null,
  type text,
  description text,
  address text,
  landmark text,
  phone text,
  opening_hours text,
  lat double precision not null,
  lng double precision not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'hidden')),
  visibility text not null default 'public'
    check (visibility in ('public', 'private', 'admin_only')),
  verification_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nearby_area_locations_updated_at on public.nearby_area_locations;
create trigger set_nearby_area_locations_updated_at
before update on public.nearby_area_locations
for each row execute function public.set_updated_at();

alter table public.nearby_area_locations enable row level security;

drop policy if exists "Anyone can view approved public locations" on public.nearby_area_locations;
create policy "Anyone can view approved public locations"
on public.nearby_area_locations
for select
to anon, authenticated
using (status = 'approved' and visibility = 'public');

drop policy if exists "Users can view own submitted locations" on public.nearby_area_locations;
create policy "Users can view own submitted locations"
on public.nearby_area_locations
for select
to authenticated
using (submitted_by = auth.uid() or public.is_nearby_area_admin());

drop policy if exists "Users can submit locations" on public.nearby_area_locations;
create policy "Users can submit locations"
on public.nearby_area_locations
for insert
to authenticated
with check (submitted_by = auth.uid());

drop policy if exists "Users can update own pending locations" on public.nearby_area_locations;
create policy "Users can update own pending locations"
on public.nearby_area_locations
for update
to authenticated
using (submitted_by = auth.uid() and status = 'pending')
with check (submitted_by = auth.uid() and status = 'pending');

drop policy if exists "Admins can manage locations" on public.nearby_area_locations;
create policy "Admins can manage locations"
on public.nearby_area_locations
for all
to authenticated
using (public.is_nearby_area_admin())
with check (public.is_nearby_area_admin());

create index if not exists nearby_area_locations_status_category_idx
on public.nearby_area_locations(status, category);

create index if not exists nearby_area_locations_lat_lng_idx
on public.nearby_area_locations(lat, lng);

-- 3. Live Operator Locations
create table if not exists public.transport_operator_locations (
  operator_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  transport_type text not null default 'bike'
    check (transport_type in ('bike', 'keke', 'car', 'van', 'truck', 'other')),
  available boolean not null default false,
  status text not null default 'offline'
    check (status in ('offline', 'online', 'busy', 'paused', 'emergency')),
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed_mps double precision,
  accuracy_meters double precision,
  battery_percent integer,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_transport_operator_locations_updated_at on public.transport_operator_locations;
create trigger set_transport_operator_locations_updated_at
before update on public.transport_operator_locations
for each row execute function public.set_updated_at();

alter table public.transport_operator_locations enable row level security;

drop policy if exists "Anyone can view active nearby operators" on public.transport_operator_locations;
create policy "Anyone can view active nearby operators"
on public.transport_operator_locations
for select
to anon, authenticated
using (
  status in ('online', 'busy')
  and last_seen_at > now() - interval '10 minutes'
  and (
    available = true
    or status = 'busy'
    or lower(coalesce(metadata->>'booked', 'false')) in ('true', '1', 'yes')
    or lower(coalesce(metadata->>'isBooked', 'false')) in ('true', '1', 'yes')
  )
);

drop policy if exists "Operators can insert own live location" on public.transport_operator_locations;
create policy "Operators can insert own live location"
on public.transport_operator_locations
for insert
to authenticated
with check (operator_id = auth.uid());

drop policy if exists "Operators can update own live location" on public.transport_operator_locations;
create policy "Operators can update own live location"
on public.transport_operator_locations
for update
to authenticated
using (operator_id = auth.uid())
with check (operator_id = auth.uid());

drop policy if exists "Admins can manage operator locations" on public.transport_operator_locations;
create policy "Admins can manage operator locations"
on public.transport_operator_locations
for all
to authenticated
using (public.is_nearby_area_admin())
with check (public.is_nearby_area_admin());

create index if not exists transport_operator_locations_active_idx
on public.transport_operator_locations(available, status, last_seen_at desc);

create index if not exists transport_operator_locations_lat_lng_idx
on public.transport_operator_locations(lat, lng);

-- 4. Road / Emergency / Traffic Reports
create table if not exists public.nearby_area_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  report_type text not null
    check (report_type in ('traffic', 'accident', 'road_block', 'police_checkpoint', 'flooding', 'bad_road', 'danger', 'emergency', 'other')),
  title text,
  description text,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'submitted'
    check (status in ('submitted', 'verified', 'cleared', 'rejected')),
  lat double precision not null,
  lng double precision not null,
  road_name text,
  expires_at timestamptz default (now() + interval '6 hours'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nearby_area_reports_updated_at on public.nearby_area_reports;
create trigger set_nearby_area_reports_updated_at
before update on public.nearby_area_reports
for each row execute function public.set_updated_at();

alter table public.nearby_area_reports enable row level security;

drop policy if exists "Anyone can view verified active reports" on public.nearby_area_reports;
create policy "Anyone can view verified active reports"
on public.nearby_area_reports
for select
to anon, authenticated
using (
  status = 'verified'
  and (expires_at is null or expires_at > now())
);

drop policy if exists "Users can view own reports" on public.nearby_area_reports;
create policy "Users can view own reports"
on public.nearby_area_reports
for select
to authenticated
using (reporter_id = auth.uid() or public.is_nearby_area_admin());

drop policy if exists "Users can submit reports" on public.nearby_area_reports;
create policy "Users can submit reports"
on public.nearby_area_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "Admins can manage reports" on public.nearby_area_reports;
create policy "Admins can manage reports"
on public.nearby_area_reports
for all
to authenticated
using (public.is_nearby_area_admin())
with check (public.is_nearby_area_admin());

create index if not exists nearby_area_reports_active_idx
on public.nearby_area_reports(status, report_type, expires_at);

create index if not exists nearby_area_reports_lat_lng_idx
on public.nearby_area_reports(lat, lng);

-- 5. Navigation Sessions
create table if not exists public.transport_navigation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operator_id uuid references auth.users(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled', 'rerouted', 'failed')),
  start_label text,
  start_lat double precision not null,
  start_lng double precision not null,
  destination_label text,
  destination_lat double precision not null,
  destination_lng double precision not null,
  distance_meters double precision,
  duration_seconds double precision,
  route_status text default 'correct'
    check (route_status in ('correct', 'warning', 'wrong')),
  route_geometry jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_transport_navigation_sessions_updated_at on public.transport_navigation_sessions;
create trigger set_transport_navigation_sessions_updated_at
before update on public.transport_navigation_sessions
for each row execute function public.set_updated_at();

alter table public.transport_navigation_sessions enable row level security;

drop policy if exists "Users can insert own navigation sessions" on public.transport_navigation_sessions;
create policy "Users can insert own navigation sessions"
on public.transport_navigation_sessions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users and operators can view related navigation sessions" on public.transport_navigation_sessions;
create policy "Users and operators can view related navigation sessions"
on public.transport_navigation_sessions
for select
to authenticated
using (
  user_id = auth.uid()
  or operator_id = auth.uid()
  or public.is_nearby_area_admin()
);

drop policy if exists "Users can update own active navigation sessions" on public.transport_navigation_sessions;
create policy "Users can update own active navigation sessions"
on public.transport_navigation_sessions
for update
to authenticated
using (user_id = auth.uid() and status = 'active')
with check (user_id = auth.uid());

drop policy if exists "Admins can manage navigation sessions" on public.transport_navigation_sessions;
create policy "Admins can manage navigation sessions"
on public.transport_navigation_sessions
for all
to authenticated
using (public.is_nearby_area_admin())
with check (public.is_nearby_area_admin());

create index if not exists transport_navigation_sessions_user_time_idx
on public.transport_navigation_sessions(user_id, started_at desc);

create index if not exists transport_navigation_sessions_operator_time_idx
on public.transport_navigation_sessions(operator_id, started_at desc);

-- 6. Traffic Intelligence Snapshots
create table if not exists public.nearby_area_traffic_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'system'
    check (source in ('system', 'operator', 'report', 'admin')),
  road_name text,
  area_name text,
  status text not null default 'green'
    check (status in ('green', 'yellow', 'red')),
  message text,
  average_speed_mps double precision,
  confidence_score numeric(4,2) default 0.50,
  lat double precision,
  lng double precision,
  radius_meters integer default 500,
  expires_at timestamptz default (now() + interval '30 minutes'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nearby_area_traffic_snapshots_updated_at on public.nearby_area_traffic_snapshots;
create trigger set_nearby_area_traffic_snapshots_updated_at
before update on public.nearby_area_traffic_snapshots
for each row execute function public.set_updated_at();

alter table public.nearby_area_traffic_snapshots enable row level security;

drop policy if exists "Anyone can view active traffic snapshots" on public.nearby_area_traffic_snapshots;
create policy "Anyone can view active traffic snapshots"
on public.nearby_area_traffic_snapshots
for select
to anon, authenticated
using (expires_at is null or expires_at > now());

drop policy if exists "Admins can manage traffic snapshots" on public.nearby_area_traffic_snapshots;
create policy "Admins can manage traffic snapshots"
on public.nearby_area_traffic_snapshots
for all
to authenticated
using (public.is_nearby_area_admin())
with check (public.is_nearby_area_admin());

create index if not exists nearby_area_traffic_snapshots_active_idx
on public.nearby_area_traffic_snapshots(status, expires_at);

-- 7. Weather Cache
create table if not exists public.nearby_area_weather_cache (
  id uuid primary key default gen_random_uuid(),
  area_key text not null unique,
  area_name text,
  lat double precision,
  lng double precision,
  temperature_c numeric(5,2),
  condition text,
  description text,
  wind_speed_mps numeric(6,2),
  rain_1h_mm numeric(6,2),
  visibility_meters integer,
  risk_level text not null default 'normal'
    check (risk_level in ('normal', 'caution', 'risky', 'danger')),
  message text,
  provider text default 'openweather',
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nearby_area_weather_cache_updated_at on public.nearby_area_weather_cache;
create trigger set_nearby_area_weather_cache_updated_at
before update on public.nearby_area_weather_cache
for each row execute function public.set_updated_at();

alter table public.nearby_area_weather_cache enable row level security;

drop policy if exists "Anyone can view active weather cache" on public.nearby_area_weather_cache;
create policy "Anyone can view active weather cache"
on public.nearby_area_weather_cache
for select
to anon, authenticated
using (expires_at > now());

drop policy if exists "Admins can manage weather cache" on public.nearby_area_weather_cache;
create policy "Admins can manage weather cache"
on public.nearby_area_weather_cache
for all
to authenticated
using (public.is_nearby_area_admin())
with check (public.is_nearby_area_admin());

create index if not exists nearby_area_weather_cache_area_idx
on public.nearby_area_weather_cache(area_key, expires_at);

-- Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'nearby_area_locations'
  ) then
    alter publication supabase_realtime add table public.nearby_area_locations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'transport_operator_locations'
  ) then
    alter publication supabase_realtime add table public.transport_operator_locations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'nearby_area_reports'
  ) then
    alter publication supabase_realtime add table public.nearby_area_reports;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'nearby_area_traffic_snapshots'
  ) then
    alter publication supabase_realtime add table public.nearby_area_traffic_snapshots;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'nearby_area_weather_cache'
  ) then
    alter publication supabase_realtime add table public.nearby_area_weather_cache;
  end if;
end $$;

-- Grants
grant usage on schema public to anon, authenticated;

grant select on public.nearby_area_locations to anon, authenticated;
grant select on public.transport_operator_locations to anon, authenticated;
grant select on public.nearby_area_reports to anon, authenticated;
grant select on public.nearby_area_traffic_snapshots to anon, authenticated;
grant select on public.nearby_area_weather_cache to anon, authenticated;

grant select, insert, update, delete on public.nearby_area_search_history to authenticated;
grant select, insert, update on public.nearby_area_locations to authenticated;
grant select, insert, update on public.transport_operator_locations to authenticated;
grant select, insert, update on public.nearby_area_reports to authenticated;
grant select, insert, update on public.transport_navigation_sessions to authenticated;
grant select on public.nearby_area_admins to authenticated;

-- Optional helper view for recent public operators
create or replace view public.active_transport_operators_public as
select
  operator_id,
  display_name,
  transport_type,
  available,
  status,
  lat,
  lng,
  heading,
  speed_mps,
  accuracy_meters,
  last_seen_at,
  metadata
from public.transport_operator_locations
where
  status in ('online', 'busy')
  and last_seen_at > now() - interval '10 minutes'
  and (
    available = true
    or status = 'busy'
    or lower(coalesce(metadata->>'booked', 'false')) in ('true', '1', 'yes')
    or lower(coalesce(metadata->>'isBooked', 'false')) in ('true', '1', 'yes')
  );

grant select on public.active_transport_operators_public to anon, authenticated;
