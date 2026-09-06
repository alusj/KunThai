-- Passenger-facing transport company discovery, public profiles, and verified
-- company reviews. Company reviews intentionally remain separate from the
-- existing operator reviews.
begin;

create table if not exists public.transport_company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.transport_companies(id) on delete cascade,
  passenger_id uuid references auth.users(id) on delete set null,
  trip_id uuid references public.transport_trips(id) on delete set null,
  passenger_name text not null default 'Verified passenger',
  rating integer not null check (rating between 1 and 5),
  review_text text not null,
  company_response text not null default '',
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(review_text)) between 3 and 1000)
);

create unique index if not exists transport_company_reviews_trip_unique
  on public.transport_company_reviews(trip_id)
  where trip_id is not null;
create index if not exists transport_company_reviews_company_created
  on public.transport_company_reviews(company_id, created_at desc);
create index if not exists transport_companies_public_name_search
  on public.transport_companies(lower(company_name));
create index if not exists transport_companies_public_code_search
  on public.transport_companies(lower(company_code));

drop trigger if exists transport_company_reviews_set_updated_at on public.transport_company_reviews;
create trigger transport_company_reviews_set_updated_at
before update on public.transport_company_reviews
for each row execute function public.transport_company_set_updated_at();

alter table public.transport_company_reviews enable row level security;
revoke all on table public.transport_company_reviews from anon, authenticated;

create or replace function public.transport_company_has_public_profile(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.transport_companies c
    where c.id = p_company_id
      and c.account_status not in ('draft', 'rejected', 'suspended', 'archived')
      and (
        exists (
          select 1
          from public.transport_fleets tf
          where tf.company_id = c.id and tf.is_visible_to_passengers
        )
        or exists (
          select 1
          from public.transport_company_rentals rental
          where rental.company_id = c.id and rental.status <> 'hidden'
        )
        or (
          c.account_status = 'approved'
          and exists (
            select 1
            from public.transport_company_fleets cf
            where cf.company_id = c.id
              and cf.service_category <> 'Rental'
              and cf.verification_status = 'verified'
          )
        )
      )
  );
$$;

create or replace function public.search_public_transport_companies(
  p_query text,
  p_country text default null,
  p_limit integer default 20
)
returns setof jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'id', c.id,
    'company_name', c.company_name,
    'company_code', c.company_code,
    'company_type', c.company_type,
    'country', c.country,
    'city', c.city,
    'verification_status', c.verification_status,
    'fleet_types', coalesce(fleet_summary.fleet_types, '[]'::jsonb),
    'fleet_count', coalesce(fleet_summary.fleet_count, 0),
    'rental_count', coalesce(rental_summary.rental_count, 0),
    'rating', coalesce(review_summary.rating, 0),
    'review_count', coalesce(review_summary.review_count, 0)
  )
  from public.transport_companies c
  left join lateral (
    select
      count(distinct cf.id)::integer as fleet_count,
      coalesce(jsonb_agg(distinct cf.fleet_type) filter (where cf.fleet_type is not null), '[]'::jsonb) as fleet_types
    from public.transport_company_fleets cf
    left join public.transport_fleets tf on tf.company_fleet_id = cf.id
    where cf.company_id = c.id
      and cf.service_category <> 'Rental'
      and (cf.verification_status = 'verified' or tf.id is not null)
  ) fleet_summary on true
  left join lateral (
    select count(*)::integer as rental_count
    from public.transport_company_rentals rental
    where rental.company_id = c.id and rental.status <> 'hidden'
  ) rental_summary on true
  left join lateral (
    select coalesce(avg(review.rating), 0)::numeric(3,2) as rating, count(*)::integer as review_count
    from public.transport_company_reviews review
    where review.company_id = c.id
  ) review_summary on true
  where length(btrim(coalesce(p_query, ''))) >= 2
    and public.transport_company_has_public_profile(c.id)
    and (nullif(btrim(coalesce(p_country, '')), '') is null or lower(c.country) = lower(btrim(p_country)))
    and (
      c.company_name ilike '%' || btrim(p_query) || '%'
      or c.company_code ilike '%' || btrim(p_query) || '%'
      or regexp_replace(lower(c.company_code), '[^a-z0-9]', '', 'g') like
         '%' || regexp_replace(lower(btrim(p_query)), '[^a-z0-9]', '', 'g') || '%'
    )
  order by
    case when lower(c.company_code) = lower(btrim(p_query)) then 0
         when lower(c.company_name) = lower(btrim(p_query)) then 1
         when lower(c.company_name) like lower(btrim(p_query)) || '%' then 2
         else 3 end,
    review_summary.rating desc,
    c.company_name
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
$$;

create or replace function public.get_public_transport_company_profile(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not public.transport_company_has_public_profile(p_company_id) then
    return null;
  end if;

  select jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id,
      'company_name', c.company_name,
      'company_code', c.company_code,
      'company_type', c.company_type,
      'phone', c.phone,
      'email', c.email,
      'country', c.country,
      'city', c.city,
      'address', c.address,
      'operating_areas', c.operating_areas,
      'support_policy', c.support_policy,
      'verification_status', c.verification_status,
      'fleet_count', coalesce(fleet_summary.fleet_count, 0),
      'rental_count', coalesce(rental_summary.rental_count, 0),
      'rating', coalesce(review_summary.rating, 0),
      'review_count', coalesce(review_summary.review_count, 0)
    ),
    'fleets', coalesce(fleets.items, '[]'::jsonb),
    'rentals', coalesce(rentals.items, '[]'::jsonb),
    'reviews', coalesce(reviews.items, '[]'::jsonb)
  ) into result
  from public.transport_companies c
  left join lateral (
    select count(*)::integer as fleet_count
    from public.transport_company_fleets cf
    left join public.transport_fleets tf on tf.company_fleet_id = cf.id
    where cf.company_id = c.id and cf.service_category <> 'Rental'
      and (cf.verification_status = 'verified' or tf.id is not null)
  ) fleet_summary on true
  left join lateral (
    select count(*)::integer as rental_count
    from public.transport_company_rentals rental
    where rental.company_id = c.id and rental.status <> 'hidden'
  ) rental_summary on true
  left join lateral (
    select coalesce(avg(review.rating), 0)::numeric(3,2) as rating, count(*)::integer as review_count
    from public.transport_company_reviews review where review.company_id = c.id
  ) review_summary on true
  left join lateral (
    select jsonb_agg(item order by item->>'fleet_type', item->>'fleet_name') as items
    from (
      select jsonb_build_object(
        'company_fleet_id', cf.id,
        'runtime_fleet_id', case when coalesce(tf.is_visible_to_passengers, false) then tf.id else null end,
        'fleet_code', cf.fleet_code,
        'fleet_name', coalesce(nullif(btrim(cf.fleet_name), ''), cf.fleet_type || ' fleet'),
        'fleet_type', cf.fleet_type,
        'service_category', cf.service_category,
        'operator_name', op.full_name,
        'operator_code', coalesce(op.display_code, op.operator_code::text),
        'plate_number', cf.plate_number,
        'make', cf.make,
        'model', cf.model,
        'color', cf.color,
        'verification_status', cf.verification_status,
        'active_status', coalesce(tf.active_status, cf.active_status),
        'is_available', coalesce(tf.is_visible_to_passengers, false) and coalesce(tf.active_status, '') = 'active',
        'rating', coalesce(operator_reviews.rating, 0),
        'review_count', coalesce(operator_reviews.review_count, 0),
        'photos', coalesce(tf.public_fleet_photos, cf.public_fleet_photos, '[]'::jsonb)
      ) as item
      from public.transport_company_fleets cf
      left join lateral (
        select runtime.* from public.transport_fleets runtime
        where runtime.company_fleet_id = cf.id
        order by runtime.updated_at desc limit 1
      ) tf on true
      left join public.transport_operators op on op.id = tf.operator_id
      left join lateral (
        select coalesce(avg(r.rating), 0)::numeric(3,2) as rating, count(*)::integer as review_count
        from public.transport_operator_reviews r where r.operator_id = op.id
      ) operator_reviews on true
      where cf.company_id = c.id and cf.service_category <> 'Rental'
        and (cf.verification_status = 'verified' or tf.id is not null)
    ) public_fleet
  ) fleets on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', rental.id,
      'title', rental.title,
      'fleet_code', cf.fleet_code,
      'fleet_type', cf.fleet_type,
      'status', rental.status,
      'currency', rental.currency,
      'rate_per_hour', rental.hourly_rate,
      'rate_per_day', rental.daily_rate,
      'rate_per_week', rental.weekly_rate,
      'pickup_address', rental.pickup_address,
      'photos', to_jsonb(rental.photos)
    ) order by rental.updated_at desc) as items
    from public.transport_company_rentals rental
    join public.transport_company_fleets cf on cf.id = rental.company_fleet_id
    where rental.company_id = c.id and rental.status <> 'hidden'
  ) rentals on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', review.id,
      'passenger_name', review.passenger_name,
      'rating', review.rating,
      'review_text', review.review_text,
      'company_response', review.company_response,
      'created_at', review.created_at,
      'responded_at', review.responded_at
    ) order by review.created_at desc) as items
    from (
      select * from public.transport_company_reviews
      where company_id = c.id order by created_at desc limit 50
    ) review
  ) reviews on true
  where c.id = p_company_id;

  return result;
end;
$$;

create or replace function public.find_transport_company_review_trip(p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select trip.id
  from public.transport_trips trip
  join public.transport_fleets fleet on fleet.id = trip.fleet_id
  left join public.transport_company_fleets company_fleet on company_fleet.id = fleet.company_fleet_id
  where auth.uid() is not null
    and trip.passenger_id = auth.uid()
    and trip.status = 'completed'
    and coalesce(fleet.company_id, company_fleet.company_id) = p_company_id
    and not exists (
      select 1 from public.transport_company_reviews review where review.trip_id = trip.id
    )
  order by trip.completed_at desc nulls last, trip.updated_at desc
  limit 1;
$$;

create or replace function public.get_transport_company_review_eligibility(p_company_id uuid)
returns table(eligible boolean, trip_id uuid, reason text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  matched_trip uuid;
begin
  if auth.uid() is null then
    return query select false, null::uuid, 'Sign in and complete a trip with this company before reviewing it.'::text;
    return;
  end if;
  if not public.transport_company_has_public_profile(p_company_id) then
    return query select false, null::uuid, 'This company profile is not available.'::text;
    return;
  end if;

  matched_trip := public.find_transport_company_review_trip(p_company_id);
  if matched_trip is null then
    return query select false, null::uuid, 'Complete a trip with this company before reviewing the company.'::text;
  else
    return query select true, matched_trip, 'Your completed trip is eligible for a company review.'::text;
  end if;
end;
$$;

create or replace function public.submit_verified_transport_company_review(
  p_company_id uuid,
  p_trip_id uuid,
  p_rating integer,
  p_review_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  eligible_trip uuid;
  passenger_label text;
  created_review public.transport_company_reviews;
begin
  if auth.uid() is null then raise exception 'Sign in to review this company.'; end if;
  if p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5.'; end if;
  if length(btrim(coalesce(p_review_text, ''))) not between 3 and 1000 then
    raise exception 'Write a review between 3 and 1000 characters.';
  end if;

  eligible_trip := public.find_transport_company_review_trip(p_company_id);
  if eligible_trip is null or eligible_trip <> p_trip_id then
    raise exception 'Complete an eligible trip with this company before reviewing it.';
  end if;

  select coalesce(
    nullif(btrim(raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(raw_user_meta_data->>'name'), ''),
    split_part(coalesce(email, 'Verified passenger'), '@', 1),
    'Verified passenger'
  ) into passenger_label
  from auth.users where id = auth.uid();

  insert into public.transport_company_reviews(
    company_id, passenger_id, trip_id, passenger_name, rating, review_text
  ) values (
    p_company_id, auth.uid(), p_trip_id, passenger_label, p_rating, btrim(p_review_text)
  ) returning * into created_review;

  return jsonb_build_object(
    'id', created_review.id,
    'company_id', created_review.company_id,
    'rating', created_review.rating,
    'review_text', created_review.review_text,
    'created_at', created_review.created_at
  );
end;
$$;

revoke all on function public.transport_company_has_public_profile(uuid) from public;
revoke all on function public.search_public_transport_companies(text, text, integer) from public;
revoke all on function public.get_public_transport_company_profile(uuid) from public;
revoke all on function public.find_transport_company_review_trip(uuid) from public;
revoke all on function public.get_transport_company_review_eligibility(uuid) from public;
revoke all on function public.submit_verified_transport_company_review(uuid, uuid, integer, text) from public;

grant execute on function public.search_public_transport_companies(text, text, integer) to anon, authenticated;
grant execute on function public.get_public_transport_company_profile(uuid) to anon, authenticated;
grant execute on function public.get_transport_company_review_eligibility(uuid) to anon, authenticated;
grant execute on function public.submit_verified_transport_company_review(uuid, uuid, integer, text) to authenticated;

commit;
