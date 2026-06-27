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
