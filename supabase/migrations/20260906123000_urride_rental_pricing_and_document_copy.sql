-- Flexible rental pricing and clearer optional-document wording.
begin;

alter table public.transport_company_rentals
  add column if not exists distance_rate numeric(14,2),
  add column if not exists time_negotiable boolean not null default false,
  add column if not exists distance_negotiable boolean not null default false;

do $$ begin
  alter table public.transport_company_rentals
    add constraint transport_company_rentals_distance_rate_check
    check (distance_rate is null or distance_rate > 0);
exception
  when duplicate_object then null;
end $$;

comment on column public.transport_company_rentals.distance_rate is
  'Optional price per kilometre, confirmed with the renter because final mileage is not known at booking time.';
comment on column public.transport_company_rentals.time_negotiable is
  'When true, time pricing is agreed directly with the company and automatic quote booking is disabled.';
comment on column public.transport_company_rentals.distance_negotiable is
  'When true, the distance charge is agreed directly with the company.';

create or replace function public.save_transport_rental(p_fleet_id uuid, p_details jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  f public.transport_company_fleets;
  result_id uuid;
  v_status text;
  v_lat double precision;
  v_lng double precision;
  v_hourly numeric;
  v_daily numeric;
  v_weekly numeric;
  v_distance numeric;
  v_time_negotiable boolean;
  v_distance_negotiable boolean;
begin
  select * into f from public.transport_company_fleets where id = p_fleet_id for update;
  if not found or not public.can_manage_transport_rentals(f.company_id) then
    raise exception 'Only the company owner or an active admin can manage rentals.';
  end if;
  if f.service_category <> 'Rental' then
    raise exception 'Select Rental as this fleet service category first.';
  end if;

  v_status := coalesce(p_details->>'status', 'hidden');
  v_lat := nullif(p_details->>'latitude', '')::double precision;
  v_lng := nullif(p_details->>'longitude', '')::double precision;
  v_time_negotiable := coalesce(nullif(p_details->>'time_negotiable', '')::boolean, false);
  v_distance_negotiable := coalesce(nullif(p_details->>'distance_negotiable', '')::boolean, false);
  v_hourly := case when v_time_negotiable then null else nullif(p_details->>'hourly_rate', '')::numeric end;
  v_daily := case when v_time_negotiable then null else nullif(p_details->>'daily_rate', '')::numeric end;
  v_weekly := case when v_time_negotiable then null else nullif(p_details->>'weekly_rate', '')::numeric end;
  v_distance := case when v_distance_negotiable then null else nullif(p_details->>'distance_rate', '')::numeric end;

  if v_status <> 'hidden' and (
    length(btrim(coalesce(p_details->>'title', ''))) = 0
    or length(btrim(coalesce(p_details->>'terms', ''))) = 0
    or length(btrim(coalesce(p_details->>'pickup_address', ''))) = 0
    or v_lat is null
    or v_lng is null
    or jsonb_array_length(coalesce(p_details->'photos', '[]'::jsonb)) = 0
    or not (
      coalesce(v_hourly, 0) > 0
      or coalesce(v_daily, 0) > 0
      or coalesce(v_weekly, 0) > 0
      or coalesce(v_distance, 0) > 0
      or v_time_negotiable
      or v_distance_negotiable
    )
  ) then
    raise exception 'Add a title, photo, fixed or negotiable rental price, rental conditions, and confirmed pickup pin before publishing.';
  end if;

  insert into public.transport_company_rentals(
    company_id, company_fleet_id, title, specifications, photos, currency,
    hourly_rate, daily_rate, weekly_rate, distance_rate, time_negotiable,
    distance_negotiable, deposit, terms, pickup_address, latitude, longitude, status
  )
  values(
    f.company_id,
    f.id,
    btrim(coalesce(p_details->>'title', f.fleet_name)),
    coalesce(p_details->>'specifications', ''),
    array(select jsonb_array_elements_text(coalesce(p_details->'photos', '[]'::jsonb))),
    upper(coalesce(nullif(p_details->>'currency', ''), 'SLE')),
    v_hourly,
    v_daily,
    v_weekly,
    v_distance,
    v_time_negotiable,
    v_distance_negotiable,
    coalesce(nullif(p_details->>'deposit', '')::numeric, 0),
    coalesce(p_details->>'terms', ''),
    coalesce(p_details->>'pickup_address', ''),
    v_lat,
    v_lng,
    v_status
  )
  on conflict(company_fleet_id) do update set
    title = excluded.title,
    specifications = excluded.specifications,
    photos = excluded.photos,
    currency = excluded.currency,
    hourly_rate = excluded.hourly_rate,
    daily_rate = excluded.daily_rate,
    weekly_rate = excluded.weekly_rate,
    distance_rate = excluded.distance_rate,
    time_negotiable = excluded.time_negotiable,
    distance_negotiable = excluded.distance_negotiable,
    deposit = excluded.deposit,
    terms = excluded.terms,
    pickup_address = excluded.pickup_address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    status = excluded.status,
    updated_at = now()
  returning id into result_id;

  return result_id;
end;
$$;

-- Public company cards need the same pricing information as the rental detail RPC.
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
      'distance_rate', rental.distance_rate,
      'time_negotiable', rental.time_negotiable,
      'distance_negotiable', rental.distance_negotiable,
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

alter table public.kunthai_document_requirements
  alter column inline_note set default 'if available';

update public.kunthai_document_requirements
set inline_note = 'if available', updated_at = now()
where surface in ('urmall', 'urride')
  and lower(btrim(coalesce(inline_note, ''))) = 'if applicable';

revoke all on function public.save_transport_rental(uuid, jsonb) from public, anon;
grant execute on function public.save_transport_rental(uuid, jsonb) to authenticated;

commit;
