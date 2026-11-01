-- Fleet HQ: a new booking on a company fleet reaches the company's admins at
-- once (2026-11-01).
--
-- Company admins get pushes from transport_company_activities
-- (push_queue_urride_company_activity), but a trip only wrote an activity when
-- its status changed (transport_company_record_trip_status_action, AFTER
-- UPDATE). A new booking is an INSERT, so the operator got "New booking
-- request" at once (transport_notify_trip_changes -> operator alert) while the
-- owner and admins heard nothing until the operator accepted, unless they had
-- Fleet HQ open.
--
-- Now an INSERT on a company fleet records a 'trip_requested' activity, which
-- queues a push for the owner and the members allowed to view company
-- activity. Each person's new "New bookings" switch (settings key
-- newBookings) can turn it off. The app lists new bookings from its booking
-- queue, not from this activity, so nothing shows twice.
--
-- Only adds a function and a trigger, and teaches the preference-key function
-- the new type; a failure here never stops the booking from being saved.
-- Re-runnable.

create or replace function public.transport_company_record_trip_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_operator_name text;
  v_trip_label text := case when coalesce(new.trip_type, new.trip_mode) = 'delivery' then 'delivery' else 'ride' end;
begin
  begin
    select fleet.company_id, operator.full_name
    into v_company_id, v_operator_name
    from public.transport_fleets fleet
    left join public.transport_operators operator on operator.id = fleet.operator_id
    where fleet.id = new.fleet_id
      and fleet.company_fleet_id is not null;

    if v_company_id is null then
      return new;
    end if;

    insert into public.transport_company_activities (
      company_id,
      actor_user_id,
      activity_type,
      title,
      body,
      metadata
    ) values (
      v_company_id,
      auth.uid(),
      'trip_requested',
      'New booking request',
      coalesce(nullif(btrim(new.passenger_name), ''), 'A passenger') || ' booked a ' || v_trip_label ||
        ' with ' || coalesce(nullif(v_operator_name, ''), 'a company operator') ||
        ' from ' || coalesce(nullif(new.pickup_label, ''), 'pickup') ||
        ' to ' || coalesce(nullif(new.destination_label, ''), 'destination') || '.',
      jsonb_build_object(
        'tripId', new.id,
        'fleetId', new.fleet_id,
        'operatorName', v_operator_name,
        'passengerName', new.passenger_name,
        'status', new.status,
        'createdAt', new.created_at
      )
    );
  exception when others then
    raise warning 'transport_company_record_trip_request skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists transport_company_record_trip_request_trigger on public.transport_trips;
create trigger transport_company_record_trip_request_trigger
after insert on public.transport_trips
for each row execute function public.transport_company_record_trip_request();

revoke all on function public.transport_company_record_trip_request() from public;
do $$ begin
  revoke all on function public.transport_company_record_trip_request() from anon, authenticated;
exception when undefined_object then null; end $$;

-- The switch that controls each company activity push.
create or replace function public.push_company_activity_preference_key(p_activity_type text, p_metadata jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_activity_type, '') like 'operator\_invite\_%' then 'operatorInvitations'
    when coalesce(p_activity_type, '') = 'trip_requested' then 'newBookings'
    when coalesce(p_activity_type, '') <> 'trip_status_updated' then 'otherTripUpdates'
    else case lower(coalesce(p_metadata ->> 'status', ''))
      when 'accepted' then 'bookingAccepted'
      when 'arrived' then 'operatorArrived'
      when 'start_requested' then 'startApproval'
      when 'in_progress' then 'tripStarted'
      when 'paused' then 'tripPaused'
      when 'completed' then 'tripCompleted'
      when 'cancelled' then 'tripCancelled'
      else 'otherTripUpdates'
    end
  end;
$$;
