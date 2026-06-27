alter table public.transport_fleets
  add column if not exists price_per_km numeric(12, 2),
  add column if not exists price_per_hour numeric(12, 2);

alter table public.transport_trips
  add column if not exists booking_method text not null default 'distance',
  add column if not exists estimated_distance_km numeric(10, 3),
  add column if not exists booked_hours numeric(8, 2),
  add column if not exists base_fare_snapshot numeric(12, 2),
  add column if not exists rate_snapshot numeric(12, 2),
  add column if not exists distance_covered_meters numeric(14, 2) not null default 0,
  add column if not exists start_requested_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_seconds int not null default 0,
  add column if not exists last_location_latitude numeric(10, 7),
  add column if not exists last_location_longitude numeric(10, 7),
  add column if not exists last_location_at timestamptz,
  add column if not exists ended_by text;

do $$ begin
  alter table public.transport_trips
    add constraint transport_trips_booking_method_check
    check (booking_method in ('distance', 'time'));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.transport_trips
    add constraint transport_trips_paused_seconds_check
    check (paused_seconds >= 0);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.transport_trips
    add constraint transport_trips_distance_covered_check
    check (distance_covered_meters >= 0);
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
  new.booking_method := coalesce(new.booking_method, 'distance');
  new.distance_covered_meters := greatest(coalesce(new.distance_covered_meters, 0), 0);
  new.paused_seconds := greatest(coalesce(new.paused_seconds, 0), 0);
  new.updated_at := now();

  if new.status = 'start_requested' and new.start_requested_at is null then
    new.start_requested_at := now();
  end if;

  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.status = 'paused' and new.paused_at is null then
    new.paused_at := now();
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

create or replace function public.transport_notify_trip_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_operator_id uuid;
  assigned_operator_name text;
  status_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    status_changed := true;
  else
    status_changed := old.status is distinct from new.status;
  end if;

  select f.operator_id, o.full_name
    into assigned_operator_id, assigned_operator_name
  from public.transport_fleets f
  join public.transport_operators o on o.id = f.operator_id
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
      case when new.trip_type = 'delivery' then 'New package delivery request' else 'New passenger request' end,
      concat_ws(' ', coalesce(new.passenger_name, 'Passenger'), 'requested', coalesce(new.title, new.trip_type, 'transport'), 'from', coalesce(new.pickup_label, 'pickup'), 'to', coalesce(new.destination_label, 'destination')),
      'Open trip',
      new.id::text
    );
  end if;

  if status_changed
    and new.passenger_id is not null
    and new.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed', 'cancelled')
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
        when 'start_requested' then concat(coalesce(assigned_operator_name, 'Your operator'), ' wants to start the trip')
        when 'in_progress' then 'Trip started'
        when 'paused' then 'Trip paused'
        when 'completed' then 'Your trip has ended'
        when 'cancelled' then 'Trip cancelled'
        else 'Trip updated'
      end,
      concat_ws(' ', coalesce(new.title, 'Transport trip'), '-', coalesce(new.pickup_label, 'pickup'), 'to', coalesce(new.destination_label, 'destination'))
    );
  end if;

  return new;
end;
$$;

drop view if exists public.passenger_visible_transport_fleets;

create view public.passenger_visible_transport_fleets as
select
  f.id,
  o.display_code as operator_code,
  o.full_name as operator_name,
  f.service_category,
  f.fleet_type,
  f.fleet_name,
  f.plate_number,
  f.operating_area,
  f.home_base_location,
  f.delivery_body_type,
  f.verification_status,
  f.active_status,
  f.current_location_name,
  f.last_known_location_name,
  f.last_active_at,
  f.rating,
  f.completed_jobs,
  f.base_fare,
  f.price_per_km,
  f.price_per_hour,
  f.price_hint,
  f.created_at
from public.transport_fleets f
join public.transport_operators o on o.id = f.operator_id
where f.is_visible_to_passengers = true;
