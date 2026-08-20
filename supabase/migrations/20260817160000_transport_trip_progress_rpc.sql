-- Monotonic, authorized live-trip distance progress.
--
-- Previously the passenger client wrote distance with a plain UPDATE that SET
-- distance_covered_meters to the client's own accumulator. That is unsafe once
-- more than one party (passenger AND the driver/operator) reports progress: a
-- lower or stale reading could overwrite a higher one and reduce the metered
-- distance -- which directly lowers the fare (fare = rate * distance at trip
-- end). This RPC makes progress writes MONOTONIC (distance can only increase)
-- and authorizes the caller (trip passenger or the assigned fleet operator), so
-- the driver's device can be the reliable distance source without any risk of
-- decreasing the fare. Distance only accrues while the trip is in_progress, so a
-- late write after pause/finish is ignored.
create or replace function public.record_transport_trip_progress(
  p_trip_id uuid,
  p_distance_meters numeric,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns public.transport_trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.transport_trips;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update trip progress.';
  end if;

  select * into v_trip from public.transport_trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'Trip not found.';
  end if;

  if not (
    v_trip.passenger_id = auth.uid()
    or exists (
      select 1
      from public.transport_fleets fleet
      join public.transport_operators operator on operator.id = fleet.operator_id
      where fleet.id = v_trip.fleet_id
        and operator.user_id = auth.uid()
    )
  ) then
    raise exception 'Not authorized to update this trip.';
  end if;

  -- Only a live trip accrues distance, and it never decreases.
  if v_trip.status <> 'in_progress' then
    return v_trip;
  end if;

  update public.transport_trips
  set distance_covered_meters = greatest(
        coalesce(distance_covered_meters, 0),
        greatest(0, coalesce(p_distance_meters, 0))
      ),
      last_location_latitude = coalesce(p_latitude, last_location_latitude),
      last_location_longitude = coalesce(p_longitude, last_location_longitude),
      last_location_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_trip_id
  returning * into v_trip;

  return v_trip;
end;
$$;

grant execute on function public.record_transport_trip_progress(uuid, numeric, numeric, numeric) to authenticated;
