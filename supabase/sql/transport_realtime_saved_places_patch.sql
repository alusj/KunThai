create extension if not exists pgcrypto;

do $$ begin
  create type transport_operator_alert_type as enum (
    'passenger_waiting',
    'verification',
    'payment',
    'review',
    'system'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type transport_operator_alert_status as enum ('unread', 'read', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.transport_trips (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid references auth.users(id) on delete set null,
  passenger_name text,
  fleet_id uuid references public.transport_fleets(id) on delete set null,
  trip_mode text default 'ride',
  trip_type text default 'ride',
  title text,
  status text not null default 'requested',
  pickup_label text,
  pickup_latitude numeric(10, 7),
  pickup_longitude numeric(10, 7),
  destination_label text,
  destination_latitude numeric(10, 7),
  destination_longitude numeric(10, 7),
  contact_phone text,
  package_description text,
  trip_note text,
  fare_amount numeric(12, 2),
  fare_currency text not null default 'SLE',
  eta_minutes int,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transport_trips
  add column if not exists passenger_name text,
  add column if not exists trip_mode text default 'ride',
  add column if not exists trip_type text default 'ride',
  add column if not exists title text,
  add column if not exists contact_phone text,
  add column if not exists package_description text,
  add column if not exists trip_note text,
  add column if not exists eta_minutes int;

do $$ begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transport_trips'
      and column_name = 'trip_mode'
  ) then
    alter table public.transport_trips alter column trip_mode drop not null;
    alter table public.transport_trips alter column trip_mode set default 'ride';
  end if;
end $$;

update public.transport_trips
set trip_type = coalesce(trip_type, trip_mode, 'ride')
where trip_type is null;

do $$ begin
  alter table public.transport_trips
    add constraint transport_trips_trip_type_check
    check (trip_type in ('ride', 'delivery'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.transport_normalize_trip_fields()
returns trigger
language plpgsql
as $$
begin
  new.trip_type := coalesce(new.trip_type, new.trip_mode, 'ride');
  new.trip_mode := coalesce(new.trip_mode, new.trip_type, 'ride');
  new.updated_at := now();

  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists transport_normalize_trip_fields_trigger on public.transport_trips;
create trigger transport_normalize_trip_fields_trigger
  before insert or update on public.transport_trips
  for each row
  execute function public.transport_normalize_trip_fields();

create table if not exists public.transport_operator_alerts (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.transport_operators(id) on delete cascade,
  fleet_id uuid references public.transport_fleets(id) on delete cascade,
  alert_type transport_operator_alert_type not null default 'system',
  status transport_operator_alert_status not null default 'unread',
  title text not null,
  body text,
  action_label text,
  action_target text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.transport_operator_reviews (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.transport_operators(id) on delete cascade,
  fleet_id uuid references public.transport_fleets(id) on delete cascade,
  trip_id uuid references public.transport_trips(id) on delete set null,
  passenger_id uuid references auth.users(id) on delete set null,
  passenger_name text,
  rating int not null check (rating between 1 and 5),
  review_text text,
  response_text text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.transport_passenger_notifications (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.transport_trips(id) on delete cascade,
  fleet_id uuid references public.transport_fleets(id) on delete set null,
  notification_type text not null default 'trip_update',
  status text not null default 'unread' check (status in ('unread', 'read', 'archived')),
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.transport_saved_operators (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.transport_fleets(id) on delete cascade,
  saved_as text,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (passenger_id, fleet_id)
);

do $$
begin
  if to_regclass('public.passenger_saved_operators') is not null then
    insert into public.transport_saved_operators (passenger_id, fleet_id, saved_as, created_at, updated_at)
    select passenger_id, fleet_id, saved_label, created_at, coalesce(last_used_at, created_at)
    from public.passenger_saved_operators
    on conflict (passenger_id, fleet_id) do nothing;
  end if;
end $$;

create table if not exists public.transport_saved_places (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Home',
  custom_category text,
  place_name text,
  contact_name text,
  phone text,
  street text,
  note text,
  front_picture_url text,
  detected_address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_support_tickets (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references auth.users(id) on delete cascade,
  passenger_name text,
  trip_id uuid references public.transport_trips(id) on delete set null,
  fleet_id uuid references public.transport_fleets(id) on delete set null,
  topic text not null default 'Trip support',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  body text not null,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transport_trips_passenger_status_idx
  on public.transport_trips (passenger_id, status, created_at desc);

create index if not exists transport_trips_fleet_status_idx
  on public.transport_trips (fleet_id, status, created_at desc);

create index if not exists transport_saved_operators_passenger_idx
  on public.transport_saved_operators (passenger_id, updated_at desc);

create index if not exists transport_saved_places_passenger_idx
  on public.transport_saved_places (passenger_id, updated_at desc);

create index if not exists transport_support_tickets_passenger_idx
  on public.transport_support_tickets (passenger_id, created_at desc);

create index if not exists transport_support_tickets_fleet_idx
  on public.transport_support_tickets (fleet_id, status, created_at desc);

create index if not exists transport_passenger_notifications_passenger_idx
  on public.transport_passenger_notifications (passenger_id, status, created_at desc);

create index if not exists transport_operator_alerts_operator_status_idx
  on public.transport_operator_alerts (operator_id, status, created_at desc);

create or replace function public.transport_notify_trip_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_operator_id uuid;
  status_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    status_changed := true;
  else
    status_changed := old.status is distinct from new.status;
  end if;

  select f.operator_id
    into assigned_operator_id
  from public.transport_fleets f
  where f.id = new.fleet_id;

  if tg_op = 'INSERT' and assigned_operator_id is not null then
    insert into public.transport_operator_alerts (
      operator_id,
      fleet_id,
      alert_type,
      title,
      body,
      action_label,
      action_target
    )
    values (
      assigned_operator_id,
      new.fleet_id,
      'passenger_waiting',
      'New booking request',
      concat_ws(' ', coalesce(new.passenger_name, 'Passenger'), 'requested', coalesce(new.title, new.trip_type, 'transport'), 'from', coalesce(new.pickup_label, 'pickup'), 'to', coalesce(new.destination_label, 'destination')),
      'Open trip',
      new.id::text
    );
  end if;

  if status_changed
    and new.passenger_id is not null
    and new.status in ('accepted', 'arrived', 'in_progress', 'completed', 'cancelled')
  then
    insert into public.transport_passenger_notifications (
      passenger_id,
      trip_id,
      fleet_id,
      notification_type,
      title,
      body
    )
    values (
      new.passenger_id,
      new.id,
      new.fleet_id,
      'trip_status',
      case new.status
        when 'accepted' then 'Operator accepted your booking'
        when 'arrived' then 'Operator has arrived'
        when 'in_progress' then 'Trip started'
        when 'completed' then 'Trip completed'
        when 'cancelled' then 'Trip cancelled'
        else 'Trip updated'
      end,
      concat_ws(' ', coalesce(new.title, 'Transport trip'), '-', coalesce(new.pickup_label, 'pickup'), 'to', coalesce(new.destination_label, 'destination'))
    );
  end if;

  return new;
end;
$$;

drop trigger if exists transport_notify_trip_changes_trigger on public.transport_trips;
create trigger transport_notify_trip_changes_trigger
  after insert or update of status on public.transport_trips
  for each row
  execute function public.transport_notify_trip_changes();

alter table public.transport_trips enable row level security;
alter table public.transport_operator_alerts enable row level security;
alter table public.transport_operator_reviews enable row level security;
alter table public.transport_passenger_notifications enable row level security;
alter table public.transport_saved_operators enable row level security;
alter table public.transport_saved_places enable row level security;
alter table public.transport_support_tickets enable row level security;

drop policy if exists "passengers can manage own trips" on public.transport_trips;
create policy "passengers can manage own trips"
  on public.transport_trips for all
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

drop policy if exists "operators can read assigned trips" on public.transport_trips;
create policy "operators can read assigned trips"
  on public.transport_trips for select
  using (
    exists (
      select 1
      from public.transport_fleets f
      join public.transport_operators o on o.id = f.operator_id
      where f.id = transport_trips.fleet_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can update assigned trips" on public.transport_trips;
create policy "operators can update assigned trips"
  on public.transport_trips for update
  using (
    exists (
      select 1
      from public.transport_fleets f
      join public.transport_operators o on o.id = f.operator_id
      where f.id = transport_trips.fleet_id
        and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.transport_fleets f
      join public.transport_operators o on o.id = f.operator_id
      where f.id = transport_trips.fleet_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "passengers can manage saved operators" on public.transport_saved_operators;
create policy "passengers can manage saved operators"
  on public.transport_saved_operators for all
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

drop policy if exists "passengers can manage saved places" on public.transport_saved_places;
create policy "passengers can manage saved places"
  on public.transport_saved_places for all
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

drop policy if exists "passengers can manage own support tickets" on public.transport_support_tickets;
create policy "passengers can manage own support tickets"
  on public.transport_support_tickets for all
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

drop policy if exists "operators can read assigned support tickets" on public.transport_support_tickets;
create policy "operators can read assigned support tickets"
  on public.transport_support_tickets for select
  using (
    exists (
      select 1
      from public.transport_fleets f
      join public.transport_operators o on o.id = f.operator_id
      where f.id = transport_support_tickets.fleet_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can read own alerts" on public.transport_operator_alerts;
create policy "operators can read own alerts"
  on public.transport_operator_alerts for select
  using (
    exists (
      select 1
      from public.transport_operators o
      where o.id = transport_operator_alerts.operator_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can update own alerts" on public.transport_operator_alerts;
create policy "operators can update own alerts"
  on public.transport_operator_alerts for update
  using (
    exists (
      select 1
      from public.transport_operators o
      where o.id = transport_operator_alerts.operator_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "passengers can read own transport notifications" on public.transport_passenger_notifications;
create policy "passengers can read own transport notifications"
  on public.transport_passenger_notifications for select
  using (auth.uid() = passenger_id);

drop policy if exists "passengers can update own transport notifications" on public.transport_passenger_notifications;
create policy "passengers can update own transport notifications"
  on public.transport_passenger_notifications for update
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

drop policy if exists "passengers can insert operator reviews" on public.transport_operator_reviews;
create policy "passengers can insert operator reviews"
  on public.transport_operator_reviews for insert
  with check (auth.role() = 'authenticated');

alter table public.transport_trips replica identity full;
alter table public.transport_operator_alerts replica identity full;
alter table public.transport_passenger_notifications replica identity full;
alter table public.transport_saved_places replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.transport_trips;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.transport_operator_alerts;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.transport_passenger_notifications;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.transport_saved_places;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;
