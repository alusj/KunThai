-- UrRide: parcel deliveries are collected, not started, 2026-10-22.
--
-- A delivery (trip_type 'delivery', from Send Delivery) no longer goes
-- accepted -> arrived -> start_requested -> in_progress like a ride. The
-- operator taps "Item collected" after accepting, which moves the trip straight
-- to in_progress (status values are unchanged). This version of
-- transport_notify_trip_changes() tells the parcel owner about that step in
-- delivery words: type 'parcel_collected', "Your item has been collected",
-- with a hint to tap Track parcel. A delivery's completion says "Parcel
-- delivered". Rides keep every title and type from 20261017120000.
--
-- push_queue_urride_passenger_notification() is unchanged: the new type goes
-- out as an 'urride_trip' push like the other trip updates.
--
-- Function only: no table, column, row, trigger or policy changes.
-- Re-runnable.

begin;

create or replace function public.transport_notify_trip_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_operator_id uuid;
  status_changed boolean := false;
  previous_status text := null;
  trip_label text;
  route_summary text;
  passenger_name text;
  actor_is_passenger boolean;
  passenger_notification_type text;
  passenger_notification_title text;
  passenger_notification_body text;
  operator_alert_title text;
begin
  if tg_op = 'INSERT' then
    status_changed := true;
  else
    previous_status := old.status;
    status_changed := old.status is distinct from new.status;
  end if;

  select f.operator_id
    into assigned_operator_id
  from public.transport_fleets f
  where f.id = new.fleet_id;

  -- New booking request: unchanged from production.
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

  if not status_changed or tg_op = 'INSERT' then
    return new;
  end if;

  trip_label := case when coalesce(new.trip_type, new.trip_mode) = 'delivery' then 'delivery' else 'ride' end;
  route_summary := concat_ws(' ',
    coalesce(nullif(new.title, ''), initcap(trip_label)),
    '-',
    coalesce(nullif(new.pickup_label, ''), 'pickup'),
    'to',
    coalesce(nullif(new.destination_label, ''), 'destination')
  );
  passenger_name := coalesce(nullif(btrim(new.passenger_name), ''), 'The passenger');
  actor_is_passenger := (auth.uid() is not null and auth.uid() = new.passenger_id)
    or (new.status in ('completed', 'cancelled') and new.ended_by = 'passenger');

  -- Passenger: what the operator (or the system) changed.
  if new.passenger_id is not null and not actor_is_passenger then
    passenger_notification_type := case
      -- Delivery: the operator picked the item up (accepted -> in_progress).
      when trip_label = 'delivery' and new.status = 'in_progress' and previous_status is distinct from 'paused' then 'parcel_collected'
      else case new.status
      when 'accepted' then 'trip_accepted'
      when 'arrived' then 'operator_arrived'
      when 'start_requested' then 'trip_start_requested'
      when 'in_progress' then 'trip_started'
      when 'paused' then 'trip_paused'
      when 'completed' then 'trip_completed'
      when 'cancelled' then
        case
          when new.ended_by = 'operator' and previous_status in ('requested', 'waiting_operator', 'pending_confirmation') then 'trip_declined'
          else 'trip_cancelled'
        end
      else null
    end
    end;

    passenger_notification_title := case
      when passenger_notification_type = 'parcel_collected' then 'Your item has been collected'
      when trip_label = 'delivery' and new.status = 'completed' then 'Parcel delivered'
      else case new.status
      when 'accepted' then 'Operator accepted your booking'
      when 'arrived' then 'Operator has arrived'
      when 'start_requested' then 'Operator is ready to start'
      when 'in_progress' then 'Trip started'
      when 'paused' then 'Trip paused'
      when 'completed' then 'Trip completed'
      when 'cancelled' then
        case
          when new.ended_by = 'operator' and previous_status in ('requested', 'waiting_operator', 'pending_confirmation') then 'Operator declined your request'
          else 'Trip cancelled'
        end
      else null
    end
    end;

    passenger_notification_body := case
      when passenger_notification_type = 'parcel_collected' then route_summary || '. Tap Track parcel to follow it.'
      else case new.status
      when 'arrived' then route_summary || '. Check the operator and vehicle before you board or hand over a package.'
      when 'start_requested' then route_summary || '. Confirm the start only when you are ready.'
      when 'completed' then route_summary || '. You can now review your trip.'
      else route_summary
    end
    end;

    if passenger_notification_type is not null then
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
        passenger_notification_type,
        passenger_notification_title,
        passenger_notification_body
      );
    end if;
  end if;

  -- Operator: what the passenger changed.
  if assigned_operator_id is not null and actor_is_passenger then
    operator_alert_title := case
      when new.status = 'paused' then concat(passenger_name, ' paused the ', trip_label)
      when new.status = 'in_progress' and previous_status = 'paused' then concat(passenger_name, ' resumed the ', trip_label)
      when new.status = 'in_progress' and previous_status = 'start_requested' then concat(passenger_name, ' confirmed the ', trip_label, ' start')
      when new.status = 'completed' then concat(passenger_name, ' ended the ', trip_label)
      when new.status = 'cancelled' then concat(passenger_name, ' cancelled the ', trip_label)
      else null
    end;

    if operator_alert_title is not null then
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
        'system',
        operator_alert_title,
        route_summary,
        'Open trip',
        new.id::text
      );
    end if;
  end if;

  return new;
end;
$$;

commit;
