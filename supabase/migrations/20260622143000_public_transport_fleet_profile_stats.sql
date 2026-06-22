-- Public passenger profiles need live aggregate trip and review data without
-- exposing transport trip rows or other passengers' private trip details.

drop function if exists public.get_public_transport_fleet_stats(uuid[]);
create function public.get_public_transport_fleet_stats(fleet_ids uuid[])
returns table (
  fleet_id uuid,
  completed_trips bigint,
  review_count bigint,
  average_rating numeric,
  latest_review_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    fleet.id as fleet_id,
    (
      select count(*)
      from public.transport_trips trip
      where trip.fleet_id = fleet.id
        and trip.status = 'completed'
    ) as completed_trips,
    (
      select count(*)
      from public.transport_operator_reviews review
      where review.operator_id = fleet.operator_id
    ) as review_count,
    (
      select coalesce(avg(review.rating::numeric), 0)
      from public.transport_operator_reviews review
      where review.operator_id = fleet.operator_id
    ) as average_rating,
    (
      select max(review.created_at)
      from public.transport_operator_reviews review
      where review.operator_id = fleet.operator_id
    ) as latest_review_at
  from public.transport_fleets fleet
  where fleet.id = any(fleet_ids)
    and (fleet.company_fleet_id is null or fleet.is_visible_to_passengers = true);
$$;

revoke all on function public.get_public_transport_fleet_stats(uuid[]) from public;
grant execute on function public.get_public_transport_fleet_stats(uuid[]) to anon, authenticated;

drop function if exists public.get_public_transport_operator_reviews(uuid);
create function public.get_public_transport_operator_reviews(operator_uuid uuid)
returns table (
  id uuid,
  passenger_name text,
  rating numeric,
  review_text text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    review.id,
    review.passenger_name,
    review.rating::numeric,
    review.review_text,
    review.created_at
  from public.transport_operator_reviews review
  where review.operator_id = operator_uuid
    and exists (
      select 1
      from public.transport_fleets fleet
      where fleet.operator_id = operator_uuid
        and (fleet.company_fleet_id is null or fleet.is_visible_to_passengers = true)
    )
  order by review.created_at desc
  limit 50;
$$;

revoke all on function public.get_public_transport_operator_reviews(uuid) from public;
grant execute on function public.get_public_transport_operator_reviews(uuid) to anon, authenticated;
