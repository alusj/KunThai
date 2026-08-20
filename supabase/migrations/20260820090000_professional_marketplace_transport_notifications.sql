-- Actionable UrMall and UrRide notifications.
-- Financial and moderation notifications are intentionally excluded until
-- those product areas are active.

create or replace function public.notify_marketplace_seller_about_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  review_subject text;
  review_description text;
  review_meta text;
begin
  review_subject := case
    when new.review_type = 'product' then coalesce(nullif(new.product_name, ''), 'your product')
    else 'your store'
  end;

  review_description := concat(
    coalesce(nullif(new.buyer_name, ''), 'A verified buyer'),
    ' left a ',
    new.rating,
    '-star review for ',
    review_subject,
    case
      when nullif(trim(coalesce(new.comment, '')), '') is not null
        then concat(': “', left(trim(new.comment), 120), case when length(trim(new.comment)) > 120 then '…' else '' end, '”')
      else '.'
    end
  );

  review_meta := concat(new.rating, '/5 stars · ', coalesce(nullif(new.buyer_name, ''), 'Verified buyer'));

  insert into public.marketplace_activities (
    business_id,
    product_id,
    activity_type,
    title,
    description,
    status,
    meta,
    action_label,
    action_target,
    created_at
  ) values (
    new.business_id,
    new.product_id,
    'review',
    case when new.review_type = 'product' then 'New product review' else 'New store review' end,
    review_description,
    'new',
    review_meta,
    case when new.product_id is not null then 'View product' else null end,
    case when new.product_id is not null then 'seller-product-detail' else null end,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists marketplace_reviews_notify_seller_trigger on public.marketplace_reviews;
create trigger marketplace_reviews_notify_seller_trigger
after insert on public.marketplace_reviews
for each row execute function public.notify_marketplace_seller_about_review();

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
  previous_status text := null;
  trip_label text;
  route_summary text;
  passenger_notification_type text;
  passenger_notification_title text;
  passenger_notification_body text;
begin
  if tg_op = 'INSERT' then
    status_changed := true;
  else
    previous_status := old.status;
    status_changed := old.status is distinct from new.status;
  end if;

  select fleet.operator_id, operator.full_name
    into assigned_operator_id, assigned_operator_name
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  where fleet.id = new.fleet_id;

  trip_label := case when coalesce(new.trip_type, new.trip_mode) = 'delivery' then 'delivery' else 'ride' end;
  route_summary := concat_ws(' ',
    coalesce(nullif(new.title, ''), initcap(trip_label) || ' request'),
    '·',
    coalesce(nullif(new.pickup_label, ''), 'pickup'),
    'to',
    coalesce(nullif(new.destination_label, ''), 'destination')
  );

  if tg_op = 'INSERT' and assigned_operator_id is not null then
    insert into public.transport_operator_alerts (
      operator_id,
      fleet_id,
      alert_type,
      title,
      body,
      action_label,
      action_target
    ) values (
      assigned_operator_id,
      new.fleet_id,
      'passenger_waiting',
      case when trip_label = 'delivery' then 'New delivery request' else 'New ride request' end,
      concat_ws(' ',
        coalesce(nullif(new.passenger_name, ''), 'A passenger'),
        'requested a', trip_label, 'from',
        coalesce(nullif(new.pickup_label, ''), 'the pickup point'),
        'to', coalesce(nullif(new.destination_label, ''), 'the destination')
      ),
      'Open request',
      'trip:' || new.id::text
    );
  end if;

  if status_changed and new.passenger_id is not null then
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
      when 'accepted' then concat(coalesce(nullif(assigned_operator_name, ''), 'An operator'), ' accepted your ', trip_label)
      when 'arrived' then concat(coalesce(nullif(assigned_operator_name, ''), 'Your operator'), ' has arrived')
      when 'start_requested' then concat(coalesce(nullif(assigned_operator_name, ''), 'Your operator'), ' is ready to start')
      when 'in_progress' then initcap(trip_label) || ' started'
      when 'paused' then initcap(trip_label) || ' paused'
      when 'completed' then initcap(trip_label) || ' completed'
      when 'cancelled' then
        case
          when new.ended_by = 'operator' and previous_status in ('requested', 'waiting_operator', 'pending_confirmation')
            then concat('Operator declined your ', trip_label, ' request')
          when new.ended_by = 'operator'
            then concat('Operator cancelled your ', trip_label)
          when new.ended_by = 'passenger'
            then initcap(trip_label) || ' cancellation confirmed'
          else initcap(trip_label) || ' cancelled'
        end
      else null
    end;

    passenger_notification_body := case new.status
      when 'accepted' then route_summary || '. Open the trip to view the operator and latest status.'
      when 'arrived' then route_summary || '. Please confirm the operator and vehicle before boarding or handing over a package.'
      when 'start_requested' then route_summary || '. Confirm the start only when you are ready.'
      when 'in_progress' then route_summary || '. Your active trip is now being tracked.'
      when 'paused' then route_summary || '. Open the trip for the current status.'
      when 'completed' then route_summary || '. You can now review your experience.'
      when 'cancelled' then route_summary || '. Open the trip for the latest details or request another operator.'
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
      ) values (
        new.passenger_id,
        new.id,
        new.fleet_id,
        passenger_notification_type,
        passenger_notification_title,
        passenger_notification_body
      );
    end if;
  end if;

  if status_changed and assigned_operator_id is not null then
    if new.status = 'cancelled' and new.ended_by = 'passenger' then
      insert into public.transport_operator_alerts (
        operator_id,
        fleet_id,
        alert_type,
        title,
        body,
        action_label,
        action_target
      ) values (
        assigned_operator_id,
        new.fleet_id,
        'system',
        concat(coalesce(nullif(new.passenger_name, ''), 'Passenger'), ' cancelled the ', trip_label),
        route_summary,
        'View trip',
        'trip:' || new.id::text
      );
    elsif new.status = 'in_progress' and previous_status = 'start_requested' then
      insert into public.transport_operator_alerts (
        operator_id,
        fleet_id,
        alert_type,
        title,
        body,
        action_label,
        action_target
      ) values (
        assigned_operator_id,
        new.fleet_id,
        'system',
        concat(coalesce(nullif(new.passenger_name, ''), 'Passenger'), ' confirmed the trip start'),
        route_summary,
        'Open trip',
        'trip:' || new.id::text
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.notify_transport_operator_about_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.transport_operator_alerts (
    operator_id,
    fleet_id,
    alert_type,
    title,
    body,
    action_label,
    action_target,
    created_at
  ) values (
    new.operator_id,
    new.fleet_id,
    'review',
    'New passenger review',
    concat(
      coalesce(nullif(new.passenger_name, ''), 'A verified passenger'),
      ' left a ', new.rating, '-star review',
      case
        when nullif(trim(coalesce(new.review_text, '')), '') is not null
          then concat(': “', left(trim(new.review_text), 120), case when length(trim(new.review_text)) > 120 then '…' else '' end, '”')
        else '.'
      end
    ),
    'View reviews',
    'review:' || new.id::text,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists transport_reviews_notify_operator_trigger on public.transport_operator_reviews;
create trigger transport_reviews_notify_operator_trigger
after insert on public.transport_operator_reviews
for each row execute function public.notify_transport_operator_about_review();
