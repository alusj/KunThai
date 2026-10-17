-- UrRide trip alerts and the arrival horn, 2026-10-17.
--
-- 1. transport_notify_trip_changes() (trigger on transport_trips)
--    Production was running the June version (20260602090000): every passenger
--    update was typed 'trip_status' and operators heard nothing after a
--    booking was created. The app expects the August types
--    (20260820090000: operator_arrived, trip_start_requested, ...), so the
--    "operator arrived" sound never matched. This version:
--      * keeps the booking-request alert on INSERT exactly as production has it
--        (title, body, action_target = trip id), so open and broadcast
--        bookings behave as before;
--      * gives passenger updates their own types again and also announces
--        start_requested and paused; 'taken', 'withdrawn', 'expired' and
--        'declined' stay silent as before;
--      * skips a passenger update the passenger caused themselves (they just
--        tapped it);
--      * tells the operator when the passenger paused, resumed, ended or
--        cancelled the trip, or confirmed its start. Reviews already alert the
--        operator (notify_transport_operator_about_review, unchanged).
--    Who acted: auth.uid() = passenger_id, or ended_by = 'passenger' for an
--    end or cancellation.
--
-- 2. push_queue_urride_passenger_notification()
--    "Operator arrived" goes out with the push kind 'urride_arrival', which
--    send-native-push plays with the UrRide horn (kt_horn.wav, channel
--    kunthai_horn). Every other passenger update keeps 'urride_trip'.
--    Operators' new-request alerts already use 'urride_request', which now
--    also maps to the horn in send-native-push.
--
-- Functions only: no table, column, row, trigger or policy changes.
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
    passenger_notification_type := case new.status
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
    end;

    passenger_notification_title := case new.status
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
    end;

    passenger_notification_body := case new.status
      when 'arrived' then route_summary || '. Check the operator and vehicle before you board or hand over a package.'
      when 'start_requested' then route_summary || '. Confirm the start only when you are ready.'
      when 'completed' then route_summary || '. You can now review your trip.'
      else route_summary
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

create or replace function public.push_queue_urride_passenger_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    if new.passenger_id is null or not public.push_transport_recipient_allows(new.passenger_id) then
      return new;
    end if;
    insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
    values (new.passenger_id,
            coalesce(nullif(public.push_short_text(new.title, 100), ''), 'UrRide'),
            public.push_short_text(new.body, 180),
            public.push_urride_trip_route(new.trip_id::text, new.passenger_id, null),
            case when new.notification_type = 'operator_arrived' then 'urride_arrival' else 'urride_trip' end,
            'urride_passenger:' || coalesce(new.trip_id, new.id)::text || ':' || new.passenger_id::text || ':' || txid_current()::text)
    on conflict (dedupe_key) do nothing;
  exception when others then
    raise warning 'push_queue_urride_passenger_notification skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

commit;
