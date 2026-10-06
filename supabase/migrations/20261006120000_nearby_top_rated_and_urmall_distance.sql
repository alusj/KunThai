-- Nearby-first discovery for UrRide "Top Rated Fleets" and UrMall products.
--
-- KunThai is global, so "top rated" means top rated NEAR THE PASSENGER, not
-- across a whole country. Operators already publish their position to
-- public.transport_operator_locations while online (on movement and every
-- 60 s); this ranks fleets around the passenger from that position.
--
-- Privacy: callers send only their own position. Operator coordinates never
-- leave the database here; only a distance rounded to 0.1 km is returned.

-- ---------------------------------------------------------------------------
-- UrRide: top rated fleets near a passenger
-- ---------------------------------------------------------------------------
--
-- Position per fleet: the operator's live position (seen within 10 minutes,
-- online/busy) or, failing that, their last known position from the past 3
-- hours ("recent"; older positions could be across town). Fleets with neither are left out rather than shown with a
-- made-up distance.
--
-- Radius: the smallest of 5 / 10 / 25 / 50 km holding at least 10 rated
-- fleets (otherwise 50 km), so dense cities stay local and rural areas still
-- get a useful list.
--
-- Score: a Bayesian average, (5 x area_mean + sum_of_ratings) / (5 + n), so a
-- single 5-star review cannot outrank a long, strong record; plus a small
-- boost for completed trips and verification. Distance only breaks ties.
--
-- Unrated fleets inside the radius are returned separately (is_rated =
-- false, nearest first) for a "New near you" section.

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
  )
  select * from rated
  union all
  select * from unrated
  order by is_rated desc, score desc, distance_km asc;
$$;

revoke all on function public.transport_top_rated_nearby(double precision, double precision, text, text, integer) from public;
grant execute on function public.transport_top_rated_nearby(double precision, double precision, text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- UrMall: distance from a buyer to the nearest location of each store
-- ---------------------------------------------------------------------------
--
-- A store can have a main location plus up to nine branches
-- (marketplace_business_locations). The buyer is matched to the NEAREST one,
-- so a chain's products rank by the branch closest to them. Runs with the
-- caller's rights (RLS applies) and only returns rounded distances for the
-- stores the caller asked about.

create or replace function public.marketplace_nearest_store_distances(
  p_lat double precision,
  p_lng double precision,
  p_business_ids uuid[]
)
returns table (business_id uuid, distance_km numeric)
language sql
stable
set search_path = public
as $$
  select
    points.business_id,
    round(min(public.transport_open_booking_distance_km(p_lat, p_lng, points.latitude, points.longitude))::numeric, 1)
  from (
    select business.id as business_id, business.latitude, business.longitude
    from public.marketplace_businesses business
    where business.id = any(p_business_ids)
    union all
    select location.business_id, location.latitude, location.longitude
    from public.marketplace_business_locations location
    where location.business_id = any(p_business_ids)
  ) points
  where p_lat between -90 and 90
    and p_lng between -180 and 180
    and coalesce(array_length(p_business_ids, 1), 0) between 1 and 500
    and points.latitude between -90 and 90
    and points.longitude between -180 and 180
  group by points.business_id;
$$;

revoke all on function public.marketplace_nearest_store_distances(double precision, double precision, uuid[]) from public;
grant execute on function public.marketplace_nearest_store_distances(double precision, double precision, uuid[]) to anon, authenticated;
