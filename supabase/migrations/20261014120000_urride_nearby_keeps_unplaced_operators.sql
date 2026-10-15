-- UrRide "Top rated near you" keeps online operators who left KunThai.
--
-- An operator who switches Active on and then leaves the app stops sharing
-- GPS (phones pause the app). After 3 hours without a position they used to
-- vanish from "near you" while still online and bookable. They now stay in
-- the list, after every fleet with a known distance (rated ones after the
-- rated, new ones after the new), with no distance (location_source
-- 'unknown'). Same function as 20261006120000 otherwise; same signature.

create or replace function public.transport_top_rated_nearby(
  p_lat double precision,
  p_lng double precision,
  p_country text,
  p_fleet_type text default null,
  p_limit integer default 20
)
returns table (
  fleet_id uuid,
  distance_km numeric,
  location_source text,
  radius_km numeric,
  is_rated boolean,
  review_count bigint,
  average_rating numeric,
  completed_trips bigint,
  score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      upper(btrim(coalesce(p_country, ''))) as country,
      nullif(lower(btrim(coalesce(p_fleet_type, ''))), '') as fleet_type,
      least(greatest(coalesce(p_limit, 20), 1), 50) as row_limit
    where p_lat between -90 and 90
      and p_lng between -180 and 180
      and upper(btrim(coalesce(p_country, ''))) ~ '^[A-Z]{2}$'
  ),
  candidates as (
    select
      fleet.id as fleet_id,
      public.transport_open_booking_distance_km(p_lat, p_lng, location.lat, location.lng) as distance_km,
      case
        when location.status in ('online', 'busy') and location.last_seen_at > now() - interval '10 minutes' then 'live'
        else 'recent'
      end as location_source,
      coalesce(reviews.review_count, 0) as review_count,
      coalesce(reviews.average_rating, 0) as average_rating,
      coalesce(trips.completed_trips, 0) as completed_trips,
      lower(coalesce(fleet.verification_status::text, operator.verification_status::text, ''))
        in ('verified', 'verified_recommended', 'recommended') as verified
    from params
    cross join public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    join public.transport_operator_locations location on location.operator_id = operator.user_id
    left join lateral (
      select count(*) as review_count, avg(review.rating::numeric) as average_rating
      from public.transport_operator_reviews review
      where review.operator_id = fleet.operator_id
    ) reviews on true
    left join lateral (
      select count(*) as completed_trips
      from public.transport_trips trip
      where trip.fleet_id = fleet.id
        and trip.status::text = 'completed'
    ) trips on true
    where lower(coalesce(fleet.active_status::text, '')) = 'active'
      and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
      and upper(coalesce(fleet.country_iso::text, '')) = params.country
      and (params.fleet_type is null or lower(coalesce(fleet.fleet_type::text, '')) = params.fleet_type)
      and location.last_seen_at > now() - interval '3 hours'
      and location.lat between -90 and 90
      and location.lng between -180 and 180
  ),
  nearby as (
    select * from candidates where distance_km <= 50
  ),
  -- Smallest radius holding at least 10 rated fleets, otherwise 50 km.
  chosen as (
    select coalesce(
      (
        select step
        from unnest(array[5, 10, 25]::numeric[]) as step
        where (select count(*) from nearby where review_count > 0 and distance_km <= step) >= 10
        order by step
        limit 1
      ),
      50::numeric
    ) as radius
  ),
  -- Area mean as the prior, so ratings are compared with local operators.
  prior as (
    select coalesce(avg(nearby.average_rating), 4.0) as mean
    from nearby, chosen
    where nearby.review_count > 0 and nearby.distance_km <= chosen.radius
  ),
  rated as (
    select
      nearby.fleet_id,
      round(nearby.distance_km::numeric, 1) as distance_km,
      nearby.location_source,
      chosen.radius as radius_km,
      true as is_rated,
      nearby.review_count,
      round(nearby.average_rating, 2) as average_rating,
      nearby.completed_trips,
      round(
        (5 * prior.mean + nearby.average_rating * nearby.review_count) / (5 + nearby.review_count)
        + 0.05 * ln(1 + nearby.completed_trips)::numeric
        + case when nearby.verified then 0.1 else 0 end,
        4
      ) as score
    from nearby, chosen, prior
    where nearby.review_count > 0 and nearby.distance_km <= chosen.radius
    order by score desc, nearby.distance_km asc
    limit (select row_limit from params)
  ),
  unrated as (
    select
      nearby.fleet_id,
      round(nearby.distance_km::numeric, 1) as distance_km,
      nearby.location_source,
      chosen.radius as radius_km,
      false as is_rated,
      0::bigint as review_count,
      0::numeric as average_rating,
      nearby.completed_trips,
      0::numeric as score
    from nearby, chosen
    where nearby.review_count = 0 and nearby.distance_km <= chosen.radius
    order by nearby.distance_km asc
    limit 10
  ),
  -- Online fleets with no position from the past 3 hours (the operator left
  -- KunThai, so the phone stopped sharing GPS). They stay in the list, after
  -- every fleet with a known distance, and carry no distance at all.
  unplaced as (
    select
      fleet.id as fleet_id,
      null::numeric as distance_km,
      'unknown'::text as location_source,
      (select radius from chosen) as radius_km,
      coalesce(reviews.review_count, 0) > 0 as is_rated,
      coalesce(reviews.review_count, 0)::bigint as review_count,
      round(coalesce(reviews.average_rating, 0), 2) as average_rating,
      coalesce(trips.completed_trips, 0)::bigint as completed_trips,
      round(
        case when coalesce(reviews.review_count, 0) > 0
          then (5 * (select mean from prior) + reviews.average_rating * reviews.review_count) / (5 + reviews.review_count)
          else 0 end
        + 0.05 * ln(1 + coalesce(trips.completed_trips, 0))::numeric
        + case when lower(coalesce(fleet.verification_status::text, operator.verification_status::text, ''))
            in ('verified', 'verified_recommended', 'recommended') then 0.1 else 0 end,
        4
      ) as score
    from params
    cross join public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    left join public.transport_operator_locations location on location.operator_id = operator.user_id
    left join lateral (
      select count(*) as review_count, avg(review.rating::numeric) as average_rating
      from public.transport_operator_reviews review
      where review.operator_id = fleet.operator_id
    ) reviews on true
    left join lateral (
      select count(*) as completed_trips
      from public.transport_trips trip
      where trip.fleet_id = fleet.id
        and trip.status::text = 'completed'
    ) trips on true
    where lower(coalesce(fleet.active_status::text, '')) = 'active'
      and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
      and upper(coalesce(fleet.country_iso::text, '')) = params.country
      and (params.fleet_type is null or lower(coalesce(fleet.fleet_type::text, '')) = params.fleet_type)
      and not exists (select 1 from candidates where candidates.fleet_id = fleet.id)
    order by score desc
    limit 20
  ),
  combined as (
    select rated.*, 1 as tier from rated
    union all
    select unplaced.*, 2 as tier from unplaced where unplaced.is_rated
    union all
    select unrated.*, 3 as tier from unrated
    union all
    select unplaced.*, 4 as tier from unplaced where not unplaced.is_rated
  )
  select fleet_id, distance_km, location_source, radius_km, is_rated, review_count, average_rating, completed_trips, score
  from combined
  order by tier, score desc, distance_km asc nulls last;
$$;

revoke all on function public.transport_top_rated_nearby(double precision, double precision, text, text, integer) from public;
grant execute on function public.transport_top_rated_nearby(double precision, double precision, text, text, integer) to anon, authenticated;
