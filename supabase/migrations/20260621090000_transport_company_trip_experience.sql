-- Give booked passengers a narrowly scoped operator contact lookup and record
-- company-fleet trip actions for the Fleet HQ owner/activity surfaces.

create or replace function public.get_transport_trip_operator_contacts(trip_ids uuid[])
returns table (
  trip_id uuid,
  operator_name text,
  operator_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    trip.id as trip_id,
    operator.full_name as operator_name,
    operator.phone as operator_phone
  from public.transport_trips trip
  join public.transport_fleets fleet on fleet.id = trip.fleet_id
  join public.transport_operators operator on operator.id = fleet.operator_id
  where trip.id = any(trip_ids)
    and trip.passenger_id = auth.uid();
$$;

revoke all on function public.get_transport_trip_operator_contacts(uuid[]) from public;
grant execute on function public.get_transport_trip_operator_contacts(uuid[]) to authenticated;

create or replace function public.transport_company_record_trip_status_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_company_id uuid;
  assigned_operator_name text;
  action_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select fleet.company_id, operator.full_name
  into assigned_company_id, assigned_operator_name
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  where fleet.id = new.fleet_id
    and fleet.company_fleet_id is not null;

  if assigned_company_id is null then
    return new;
  end if;

  action_label := case new.status
    when 'accepted' then 'accepted the booking'
    when 'arrived' then 'marked arrival at pickup'
    when 'start_requested' then 'requested passenger approval to start'
    when 'in_progress' then 'started the trip'
    when 'paused' then 'paused the trip'
    when 'completed' then 'completed the trip'
    when 'cancelled' then 'declined or cancelled the booking'
    else 'updated the trip to ' || replace(new.status, '_', ' ')
  end;

  insert into public.transport_company_activities (
    company_id,
    actor_user_id,
    activity_type,
    title,
    body,
    metadata
  ) values (
    assigned_company_id,
    auth.uid(),
    'trip_status_updated',
    'Company trip updated',
    coalesce(nullif(assigned_operator_name, ''), 'Company operator') || ' ' || action_label ||
      ' for ' || coalesce(nullif(new.passenger_name, ''), 'a passenger') || '.',
    jsonb_build_object(
      'tripId', new.id,
      'fleetId', new.fleet_id,
      'operatorName', assigned_operator_name,
      'passengerName', new.passenger_name,
      'previousStatus', old.status,
      'status', new.status,
      'updatedAt', new.updated_at
    )
  );

  return new;
end;
$$;

drop trigger if exists transport_company_record_trip_status_action_trigger on public.transport_trips;
create trigger transport_company_record_trip_status_action_trigger
after update of status on public.transport_trips
for each row execute function public.transport_company_record_trip_status_action();

-- Reassert the existing assigned-operator contract for both sole and company
-- runtime fleets. The fleet's operator owns trip actions; company owners read.
drop policy if exists "operators can update assigned trips" on public.transport_trips;
create policy "operators can update assigned trips"
on public.transport_trips
for update
to authenticated
using (
  exists (
    select 1
    from public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    where fleet.id = transport_trips.fleet_id
      and operator.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    where fleet.id = transport_trips.fleet_id
      and operator.user_id = auth.uid()
  )
);
