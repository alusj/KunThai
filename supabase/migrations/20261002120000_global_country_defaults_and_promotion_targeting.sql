-- Global country defaults + credit-based promotion targeting.
--
-- PART A — KunThai is global; Sierra Leone is only the launch market.
--   * kunthai_default_country_iso(): the caller's own account country first
--     (JWT user metadata), then the configured default, which is no longer
--     Sierra Leone but the international fallback (US / USD).
--   * kunthai_resolve_currency(): USD, not SLE, when nothing resolves.
--   * normalize_kunthai_phone(): every country's dial code (was West Africa
--     only), from kunthai_countries.
--   * Rental currency: resolved from the company's country (was a West-Africa
--     list defaulting to SLE); no literal 'SL' fallback for runtime fleets.
--
-- PART B — How many places a promotion may target is set by its Visibility
-- Credits (Explore adverts, UrMall product boosts, meal/property boosts):
--   * up to 10 credits  → one area (one state/district, or the whole country)
--   * 11 credits and up → one area per 5 credits (11 → 2, 15 → 3, 20 → 4 …, max 30)
--   * several countries → from 100 credits, one country per 50 credits
--     (100 → 2, 150 → 3 …), each country targeted as a whole.
--   Enforced by kunthai_assert_promotion_targeting (called by the *_in_regions
--   RPCs before credits are spent) and by a guard trigger on both tables.
--   Every new promotion records its countries (target_country_isos); Explore
--   advert delivery honours them. Mirrors promotionTargeting.js.

-- ===========================================================================
-- PART A
-- ===========================================================================

create or replace function public.kunthai_default_country_iso()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(public.kunthai_normalize_country_iso(coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'country_code', ''),
      nullif(auth.jwt() -> 'user_metadata' ->> 'country', '')
    )), ''),
    (select country.iso2 from public.kunthai_countries country where country.is_default order by country.iso2 limit 1),
    'US'
  );
$$;

-- One default at a time (partial unique index): clear, then set.
update public.kunthai_countries set is_default = false where is_default and iso2 <> 'US';
update public.kunthai_countries set is_default = true where iso2 = 'US' and not is_default;

CREATE OR REPLACE FUNCTION public.kunthai_resolve_currency(country_value text DEFAULT NULL::text, currency_value text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  supplied_currency text := upper(btrim(coalesce(currency_value, '')));
  resolved_iso text;
  resolved_currency text;
begin
  if supplied_currency ~ '^[A-Z]{3,5}$' then
    return supplied_currency;
  end if;

  resolved_iso := public.kunthai_resolve_country_iso(country_value);

  select country.currency_code into resolved_currency
  from public.kunthai_countries country
  where country.iso2 = resolved_iso
  limit 1;

  if resolved_currency is null then
    select country.currency_code into resolved_currency
    from public.kunthai_countries country
    where country.iso2 = public.kunthai_default_country_iso()
    limit 1;
  end if;

  return coalesce(resolved_currency, 'USD');
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_kunthai_phone(input_phone text, country_hint text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  raw_phone text := btrim(coalesce(input_phone, ''));
  phone_digits text := regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g');
  hint_key text := upper(regexp_replace(coalesce(country_hint, ''), '[^A-Za-z0-9]', '', 'g'));
  dial_digits text := '';
begin
  if raw_phone = '' or phone_digits = '' then
    return null;
  end if;

  -- Any country's dial code from the country table; the legacy name table
  -- below only remains as a fallback for hints the table cannot resolve.
  select regexp_replace(coalesce(country.dial_code, ''), '[^0-9]', '', 'g') into dial_digits
  from public.kunthai_countries country
  where country.iso2 = public.kunthai_normalize_country_iso(country_hint)
  limit 1;
  dial_digits := coalesce(dial_digits, '');
  if dial_digits = '' then
  dial_digits := case hint_key
    when 'SL' then '232'
    when 'SIERRALEONE' then '232'
    when 'LR' then '231'
    when 'LIBERIA' then '231'
    when 'GH' then '233'
    when 'GHANA' then '233'
    when 'NG' then '234'
    when 'NIGERIA' then '234'
    when 'GN' then '224'
    when 'GUINEA' then '224'
    when 'CI' then '225'
    when 'IVORYCOAST' then '225'
    when 'COTEDIVOIRE' then '225'
    when 'SN' then '221'
    when 'SENEGAL' then '221'
    when 'GM' then '220'
    when 'THEGAMBIA' then '220'
    when 'GAMBIA' then '220'
    when 'ML' then '223'
    when 'MALI' then '223'
    when 'BF' then '226'
    when 'BURKINAFASO' then '226'
    when 'BJ' then '229'
    when 'BENIN' then '229'
    when 'TG' then '228'
    when 'TOGO' then '228'
    when 'NE' then '227'
    when 'NIGER' then '227'
    when 'GW' then '245'
    when 'GUINEABISSAU' then '245'
    when 'CV' then '238'
    when 'CAPEVERDE' then '238'
    when 'CABOVERDE' then '238'
    when 'MR' then '222'
    when 'MAURITANIA' then '222'
    when 'MAURITANIE' then '222'
    else ''
  end;
  end if;

  if raw_phone ~ '^\s*\+' then
    null;
  elsif raw_phone ~ '^\s*00' then
    phone_digits := substring(phone_digits from 3);
  elsif dial_digits <> '' and phone_digits not like dial_digits || '%' then
    phone_digits := dial_digits || regexp_replace(phone_digits, '^0+', '');
  else
    phone_digits := regexp_replace(phone_digits, '^0+', '');
  end if;

  if length(phone_digits) < 8 or length(phone_digits) > 15 then
    return null;
  end if;

  return '+' || phone_digits;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_transport_rental(p_fleet_id uuid, p_details jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
    public.kunthai_resolve_currency(
      (select coalesce(nullif(company.country_iso, ''), company.country) from public.transport_companies company where company.id = f.company_id),
      p_details->>'currency'
    ),
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
$function$;

CREATE OR REPLACE FUNCTION public.sync_registered_rental_fleet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare c public.transport_companies; details jsonb; pics text[];
begin
  if new.service_category <> 'Rental' then return new; end if;
  select * into c from public.transport_companies where id=new.company_id;
  details := coalesce(new.safety_answers,'{}'::jsonb);
  select coalesce(array_agg(url order by ordinal),'{}') into pics from (
    select coalesce(photo->>'url',photo->>'publicUrl',photo->>'fileUrl',case when jsonb_typeof(photo)='string' then photo#>>'{}' end) url, ordinal
    from jsonb_array_elements(coalesce(new.public_fleet_photos,'[]'::jsonb)) with ordinality as p(photo,ordinal)
  ) p where nullif(url,'') is not null;
  insert into public.transport_company_rentals(company_id,company_fleet_id,title,specifications,photos,currency,hourly_rate,distance_rate,time_negotiable,distance_negotiable,deposit,terms,pickup_address,latitude,longitude,status)
  values(new.company_id,new.id,coalesce(nullif(new.fleet_name,''),new.fleet_code),concat_ws(' · ',new.make,new.model,new.manufacture_year,new.color),pics,
    public.kunthai_resolve_currency(coalesce(nullif(c.country_iso,''),c.country), details->>'rentalCurrency'),nullif(new.price_per_hour,0),nullif(new.price_per_km,0),
    coalesce((details->>'rentalTimeNegotiable')::boolean,false),coalesce((details->>'rentalDistanceNegotiable')::boolean,false),
    coalesce(nullif(details->>'rentalDeposit','')::numeric,0),coalesce(details->>'rentalTerms',''),
    coalesce(details#>>'{rentalPickup,address}',new.home_base_location,c.address,''),
    coalesce(nullif(details#>>'{rentalPickup,latitude}','')::double precision,case when coalesce(nullif(new.home_base_location,''),c.address)=c.address then c.latitude end),
    coalesce(nullif(details#>>'{rentalPickup,longitude}','')::double precision,case when coalesce(nullif(new.home_base_location,''),c.address)=c.address then c.longitude end),'hidden')
  on conflict(company_fleet_id) do nothing;
  if tg_op='UPDATE' then
    update public.transport_company_rentals set
      title=case when new.fleet_name is distinct from old.fleet_name then coalesce(nullif(new.fleet_name,''),new.fleet_code) else title end,
      specifications=case when row(new.make,new.model,new.manufacture_year,new.color) is distinct from row(old.make,old.model,old.manufacture_year,old.color) then concat_ws(' · ',new.make,new.model,new.manufacture_year,new.color) else specifications end,
      photos=case when new.public_fleet_photos is distinct from old.public_fleet_photos then pics else photos end,
      hourly_rate=case when new.price_per_hour is distinct from old.price_per_hour then nullif(new.price_per_hour,0) else hourly_rate end,
      distance_rate=case when new.price_per_km is distinct from old.price_per_km then nullif(new.price_per_km,0) else distance_rate end,
      terms=case when details->>'rentalTerms' is distinct from old.safety_answers->>'rentalTerms' then coalesce(details->>'rentalTerms','') else terms end,
      deposit=case when details->>'rentalDeposit' is distinct from old.safety_answers->>'rentalDeposit' then coalesce(nullif(details->>'rentalDeposit','')::numeric,0) else deposit end,
      time_negotiable=case when details->>'rentalTimeNegotiable' is distinct from old.safety_answers->>'rentalTimeNegotiable' then coalesce((details->>'rentalTimeNegotiable')::boolean,false) else time_negotiable end,
      distance_negotiable=case when details->>'rentalDistanceNegotiable' is distinct from old.safety_answers->>'rentalDistanceNegotiable' then coalesce((details->>'rentalDistanceNegotiable')::boolean,false) else distance_negotiable end,
      pickup_address=case when details->'rentalPickup' is distinct from old.safety_answers->'rentalPickup' then coalesce(details#>>'{rentalPickup,address}','') else pickup_address end,
      latitude=case when details->'rentalPickup' is distinct from old.safety_answers->'rentalPickup' then nullif(details#>>'{rentalPickup,latitude}','')::double precision else latitude end,
      longitude=case when details->'rentalPickup' is distinct from old.safety_answers->'rentalPickup' then nullif(details#>>'{rentalPickup,longitude}','')::double precision else longitude end,
      updated_at=now()
    where company_fleet_id=new.id and deleted_at is null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transport_company_provision_runtime_fleet(company_fleet_uuid uuid, operator_uuid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  company_fleet public.transport_company_fleets%rowtype;
  company_record public.transport_companies%rowtype;
  runtime_fleet_id uuid;
  runtime_service_category public.transport_service_category;
  runtime_fleet_type public.transport_fleet_type;
  runtime_verification public.transport_verification_status;
  runtime_active_status text;
  runtime_visible boolean;
  runtime_country_iso text;
  runtime_country text;
  runtime_currency text;
begin
  if company_fleet_uuid is null or operator_uuid is null then
    return null;
  end if;

  select * into company_fleet
  from public.transport_company_fleets
  where id = company_fleet_uuid
  for update;

  if not found then
    return null;
  end if;

  select * into company_record
  from public.transport_companies
  where id = company_fleet.company_id;

  runtime_service_category := case company_fleet.service_category
    when 'Ride only' then 'transport'::public.transport_service_category
    when 'Delivery only' then 'delivery'::public.transport_service_category
    else 'both'::public.transport_service_category
  end;
  runtime_fleet_type := case company_fleet.fleet_type
    when 'Motorbike' then 'motorcycle'::public.transport_fleet_type
    when 'Tricycle' then 'tricycle'::public.transport_fleet_type
    else 'car'::public.transport_fleet_type
  end;
  runtime_verification := case company_fleet.verification_status
    when 'verified' then 'verified'::public.transport_verification_status
    when 'rejected' then 'not_verified'::public.transport_verification_status
    when 'suspended' then 'not_verified'::public.transport_verification_status
    else 'verification_pending'::public.transport_verification_status
  end;
  -- Provisioning an assignment is not an operator request to go on duty.
  -- Preserve only this same operator's runtime availability, never stale company metadata.
  select case when fleet.active_status = 'active' then 'active' else 'offline' end
  into runtime_active_status from public.transport_fleets fleet
  where fleet.company_fleet_id = company_fleet.id and fleet.operator_id = operator_uuid;
  runtime_active_status := coalesce(runtime_active_status, 'offline');
  runtime_visible := coalesce(company_fleet.is_visible_to_passengers, false) and runtime_active_status = 'active';
  runtime_country_iso := public.kunthai_resolve_country_iso(
    coalesce(nullif(company_record.country_iso, ''), nullif(company_record.country, ''))
  );
  runtime_country := coalesce(nullif(company_record.country, ''), runtime_country_iso);
  runtime_currency := public.kunthai_resolve_currency(
    runtime_country_iso,
    nullif(company_record.currency, '')
  );

  select fleet.id into runtime_fleet_id
  from public.transport_fleets fleet
  where fleet.company_fleet_id = company_fleet.id
  limit 1;

  -- A company's runtime row is identified only by company_fleet_id.
  -- Reusing an operator's same-plate solo/other-company row would transfer
  -- its history and dispatch access to this company.

  if runtime_fleet_id is null then
    insert into public.transport_fleets (
      operator_id,
      service_category,
      fleet_type,
      fleet_name,
      plate_number,
      make,
      model,
      manufacture_year,
      color,
      operating_area,
      home_base_location,
      safety_answers,
      verification_status,
      active_status,
      is_visible_to_passengers,
      accepts_ride,
      accepts_delivery,
      country,
      country_iso,
      currency,
      company_id,
      company_fleet_id,
      fleet_code,
      public_fleet_photos,
      updated_at
    ) values (
      operator_uuid,
      runtime_service_category,
      runtime_fleet_type,
      coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), 'NO-PLATE'),
      company_fleet.make,
      company_fleet.model,
      company_fleet.manufacture_year,
      company_fleet.color,
      coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      coalesce(company_fleet.safety_answers, '{}'::jsonb),
      runtime_verification,
      runtime_active_status,
      runtime_visible,
      company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      runtime_country,
      runtime_country_iso,
      runtime_currency,
      company_fleet.company_id,
      company_fleet.id,
      company_fleet.fleet_code,
      coalesce(company_fleet.public_fleet_photos, '[]'::jsonb),
      now()
    )
    returning id into runtime_fleet_id;
  else
    update public.transport_fleets
    set
      operator_id = operator_uuid,
      service_category = runtime_service_category,
      fleet_type = runtime_fleet_type,
      fleet_name = coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      plate_number = coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), plate_number),
      make = company_fleet.make,
      model = company_fleet.model,
      manufacture_year = company_fleet.manufacture_year,
      color = company_fleet.color,
      operating_area = coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      home_base_location = coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      safety_answers = coalesce(company_fleet.safety_answers, '{}'::jsonb),
      verification_status = runtime_verification,
      active_status = runtime_active_status,
      is_visible_to_passengers = runtime_visible,
      accepts_ride = company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      accepts_delivery = company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      country = coalesce(nullif(company_record.country, ''), country),
      country_iso = coalesce(nullif(runtime_country_iso, ''), country_iso),
      currency = coalesce(nullif(runtime_currency, ''), currency),
      company_id = company_fleet.company_id,
      company_fleet_id = company_fleet.id,
      fleet_code = company_fleet.fleet_code,
      public_fleet_photos = coalesce(company_fleet.public_fleet_photos, public_fleet_photos),
      updated_at = now()
    where id = runtime_fleet_id;
  end if;

  update public.transport_company_fleets
  set
    operator_id = operator_uuid,
    transport_fleet_id = runtime_fleet_id,
    updated_at = now()
  where id = company_fleet.id;

  return runtime_fleet_id;
end;
$function$;

do $$
begin
  -- A literal SLE column default would label any direct insert in Leones.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transport_company_rentals'
      and column_name = 'currency' and column_default ilike '%SLE%'
  ) then
    alter table public.transport_company_rentals alter column currency set default 'USD';
  end if;
end;
$$;

-- ===========================================================================
-- PART B
-- ===========================================================================

alter table public.explore_ad_campaigns add column if not exists target_country_isos text[] not null default '{}';
alter table public.marketplace_promotions add column if not exists target_country_isos text[] not null default '{}';

-- Areas (states/districts, or the whole country) a budget may target.
create or replace function public.kunthai_promotion_max_areas(p_credits integer)
returns integer
language sql
immutable
as $$
  select case when coalesce(p_credits, 0) <= 10 then 1 else least(30, floor(p_credits / 5.0)::integer) end;
$$;

-- Countries a budget may target.
create or replace function public.kunthai_promotion_max_countries(p_credits integer)
returns integer
language sql
immutable
as $$
  select case when coalesce(p_credits, 0) < 100 then 1 else floor(p_credits / 50.0)::integer end;
$$;

-- Valid, de-duplicated ISO codes in the order given.
create or replace function public.kunthai_clean_country_isos(p_isos text[])
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(iso order by first_position), '{}')
  from (
    select country.iso2 as iso, min(candidate.position) as first_position
    from unnest(coalesce(p_isos, '{}')) with ordinality as candidate(value, position)
    join public.kunthai_countries country on country.iso2 = upper(btrim(candidate.value))
    group by country.iso2
  ) cleaned;
$$;

create or replace function public.kunthai_assert_promotion_targeting(
  p_credits integer,
  p_area_count integer,
  p_country_count integer,
  p_nearby boolean default false
)
returns void
language plpgsql
immutable
as $$
declare
  credits integer := coalesce(p_credits, 0);
  areas integer := coalesce(p_area_count, 0);
  countries integer := greatest(coalesce(p_country_count, 1), 1);
  max_areas integer := public.kunthai_promotion_max_areas(credits);
  max_countries integer := public.kunthai_promotion_max_countries(credits);
begin
  if countries > 1 then
    if credits < 100 then
      raise exception 'Targeting more than one country needs at least 100 Visibility Credits.' using errcode = 'P0001';
    end if;
    if countries > max_countries then
      raise exception '% Visibility Credits cover up to % countries. Add credits or remove a country.', credits, max_countries using errcode = 'P0001';
    end if;
    if areas > 0 then
      raise exception 'When you target several countries, each country is reached as a whole. Remove the states or districts.' using errcode = 'P0001';
    end if;
    return;
  end if;

  -- A nearby advert is one typed area, whatever it resolves to.
  if p_nearby then
    return;
  end if;

  if areas > max_areas then
    if credits <= 10 then
      raise exception 'Up to 10 Visibility Credits cover one area. Use 11 credits or more to target several areas.' using errcode = 'P0001';
    end if;
    raise exception '% Visibility Credits cover up to % areas. Add credits or remove an area.', credits, max_areas using errcode = 'P0001';
  end if;
end;
$$;

-- Saved-row guard for every path (base RPCs, wrappers, future code): fills in
-- the advertiser's country, keeps areas inside it, and enforces the limits.
-- Fires on insert and when targeting changes, so spending credits or pausing
-- an older promotion never trips it.
create or replace function public.kunthai_promotion_targeting_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  owner_country text;
  region_countries text[];
  is_nearby boolean := false;
begin
  new.target_region_ids := coalesce(new.target_region_ids, '{}');
  new.target_country_isos := public.kunthai_clean_country_isos(new.target_country_isos);

  if tg_table_name = 'explore_ad_campaigns' then
    owner_id := new.advertiser_id;
    is_nearby := coalesce(new.audience_type, '') = 'nearby';
  else
    select business.user_id into owner_id from public.marketplace_businesses business where business.id = new.business_id;
  end if;

  if cardinality(new.target_region_ids) > 0 then
    select coalesce(array_agg(distinct region.country_iso), '{}') into region_countries
    from public.kunthai_country_regions region
    where region.id = any(new.target_region_ids);
    if cardinality(region_countries) > 1 then
      raise exception 'Choose states or districts in one country.' using errcode = 'P0001';
    end if;
    if cardinality(new.target_country_isos) = 0 then
      new.target_country_isos := region_countries;
    elsif cardinality(new.target_country_isos) = 1 and cardinality(region_countries) = 1
          and new.target_country_isos[1] <> region_countries[1] then
      raise exception 'The chosen states or districts are not in the targeted country.' using errcode = 'P0001';
    end if;
  end if;

  owner_id := coalesce(owner_id, auth.uid());

  if tg_op = 'INSERT' and cardinality(new.target_country_isos) = 0 then
    select coalesce(
      nullif((select account.country_iso from public.kunthai_account_regions account where account.user_id = owner_id), ''),
      nullif((select public.kunthai_normalize_country_iso(coalesce(nullif(users.raw_user_meta_data->>'country_code', ''), nullif(users.raw_user_meta_data->>'country', ''))) from auth.users users where users.id = owner_id), ''),
      public.kunthai_default_country_iso()
    ) into owner_country;
    if owner_country is not null and owner_country <> '' then
      new.target_country_isos := array[owner_country];
    end if;
  end if;

  perform public.kunthai_assert_promotion_targeting(
    coalesce(new.credit_budget, 0),
    cardinality(new.target_region_ids),
    greatest(cardinality(new.target_country_isos), 1),
    is_nearby
  );
  return new;
end;
$$;

drop trigger if exists explore_ad_campaigns_targeting_guard on public.explore_ad_campaigns;
create trigger explore_ad_campaigns_targeting_guard
  before insert or update of target_region_ids, target_country_isos on public.explore_ad_campaigns
  for each row execute function public.kunthai_promotion_targeting_guard();

drop trigger if exists marketplace_promotions_targeting_guard on public.marketplace_promotions;
create trigger marketplace_promotions_targeting_guard
  before insert or update of target_region_ids, target_country_isos on public.marketplace_promotions
  for each row execute function public.kunthai_promotion_targeting_guard();

-- The wrappers gain p_target_country_isos (drop first: adding a parameter
-- would otherwise leave an ambiguous overload behind).
drop function if exists public.create_explore_ad_campaign_in_regions(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text, integer, uuid[]);
create function public.create_explore_ad_campaign_in_regions(
  p_post_id uuid,
  p_placement text default 'urfeed',
  p_objective text default 'brand_awareness',
  p_audience_type text default 'recommended',
  p_minimum_age integer default 13,
  p_maximum_age integer default null,
  p_gender_target text default 'all',
  p_interest_categories text[] default '{}',
  p_target_area text default null,
  p_duration_days integer default 14,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_budget_type text default 'total',
  p_budget_amount numeric default 0,
  p_currency text default null,
  p_credit_budget integer default null,
  p_target_region_ids uuid[] default '{}',
  p_target_country_isos text[] default '{}'
)
returns public.explore_ad_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regions uuid[] := public.kunthai_clean_region_ids(p_target_region_ids, 30);
  v_countries text[];
  v_campaign public.explore_ad_campaigns;
begin
  v_countries := public.kunthai_clean_country_isos(p_target_country_isos);
  if coalesce(cardinality(p_target_region_ids), 0) > 0 and cardinality(v_regions) = 0 then
    raise exception 'Choose at least one valid state or district.';
  end if;
  if coalesce(cardinality(p_target_region_ids), 0) > 30 then
    raise exception 'Choose at most 30 states or districts.';
  end if;
  if coalesce(cardinality(p_target_country_isos), 0) > 0 and cardinality(v_countries) = 0 then
    raise exception 'Choose at least one valid country.';
  end if;
  -- Checked before anything is created or any credit is spent; the targeting
  -- guard trigger re-checks the saved row.
  perform public.kunthai_assert_promotion_targeting(coalesce(p_credit_budget, 0), cardinality(v_regions), greatest(cardinality(v_countries), 1), coalesce(p_audience_type, '') = 'nearby');

  v_campaign := public.create_explore_ad_campaign(
    p_post_id => p_post_id,
    p_placement => p_placement,
    p_objective => p_objective,
    p_audience_type => p_audience_type,
    p_minimum_age => p_minimum_age,
    p_maximum_age => p_maximum_age,
    p_gender_target => p_gender_target,
    p_interest_categories => p_interest_categories,
    p_target_area => p_target_area,
    p_duration_days => p_duration_days,
    p_starts_at => p_starts_at,
    p_ends_at => p_ends_at,
    p_budget_type => p_budget_type,
    p_budget_amount => p_budget_amount,
    p_currency => p_currency,
    p_credit_budget => p_credit_budget
  );

  if cardinality(v_regions) > 0 or cardinality(v_countries) > 0 then
    update public.explore_ad_campaigns
    set target_region_ids = case when cardinality(v_regions) > 0 then v_regions else target_region_ids end,
        target_country_isos = case when cardinality(v_countries) > 0 then v_countries else target_country_isos end
    where id = v_campaign.id
    returning * into v_campaign;
  end if;

  return v_campaign;
end;
$$;

drop function if exists public.create_marketplace_visibility_promotion_in_regions(uuid, integer, text, uuid[]);
create function public.create_marketplace_visibility_promotion_in_regions(
  p_product_id uuid,
  p_credit_budget integer default 5,
  p_audience_type text default 'countrywide',
  p_target_region_ids uuid[] default '{}',
  p_target_country_isos text[] default '{}'
)
returns public.marketplace_promotions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regions uuid[] := public.kunthai_clean_region_ids(p_target_region_ids, 30);
  v_countries text[];
  v_promotion public.marketplace_promotions;
begin
  v_countries := public.kunthai_clean_country_isos(p_target_country_isos);
  if coalesce(cardinality(p_target_region_ids), 0) > 0 and cardinality(v_regions) = 0 then
    raise exception 'Choose at least one valid state or district.';
  end if;
  if coalesce(cardinality(p_target_region_ids), 0) > 30 then
    raise exception 'Choose at most 30 states or districts.';
  end if;
  if coalesce(cardinality(p_target_country_isos), 0) > 0 and cardinality(v_countries) = 0 then
    raise exception 'Choose at least one valid country.';
  end if;
  -- Checked before anything is created or any credit is spent; the targeting
  -- guard trigger re-checks the saved row.
  perform public.kunthai_assert_promotion_targeting(coalesce(p_credit_budget, 5), cardinality(v_regions), greatest(cardinality(v_countries), 1), false);

  v_promotion := public.create_marketplace_visibility_promotion(p_product_id, p_credit_budget, p_audience_type);

  update public.marketplace_promotions
  set target_region_ids = v_regions,
      target_country_isos = case when cardinality(v_countries) > 0 then v_countries else target_country_isos end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'audienceType', case
          when cardinality(v_countries) > 1 then 'countries'
          when cardinality(v_regions) > 0 then 'regions'
          else lower(coalesce(nullif(btrim(p_audience_type), ''), 'countrywide'))
        end,
        'targetRegions', public.kunthai_promotion_region_metadata(v_regions),
        'targetCountries', to_jsonb(coalesce(nullif(v_countries, '{}'), target_country_isos))
      ),
      updated_at = timezone('utc', now())
  where id = v_promotion.id
  returning * into v_promotion;

  return v_promotion;
end;
$$;

drop function if exists public.create_marketplace_listing_promotion_in_regions(text, uuid, integer, text, uuid[]);
create function public.create_marketplace_listing_promotion_in_regions(
  p_listing_type text,
  p_listing_id uuid,
  p_credit_budget integer default 5,
  p_audience_type text default 'countrywide',
  p_target_region_ids uuid[] default '{}',
  p_target_country_isos text[] default '{}'
)
returns public.marketplace_promotions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regions uuid[] := public.kunthai_clean_region_ids(p_target_region_ids, 30);
  v_countries text[];
  v_promotion public.marketplace_promotions;
begin
  v_countries := public.kunthai_clean_country_isos(p_target_country_isos);
  if coalesce(cardinality(p_target_region_ids), 0) > 0 and cardinality(v_regions) = 0 then
    raise exception 'Choose at least one valid state or district.';
  end if;
  if coalesce(cardinality(p_target_region_ids), 0) > 30 then
    raise exception 'Choose at most 30 states or districts.';
  end if;
  if coalesce(cardinality(p_target_country_isos), 0) > 0 and cardinality(v_countries) = 0 then
    raise exception 'Choose at least one valid country.';
  end if;
  -- Checked before anything is created or any credit is spent; the targeting
  -- guard trigger re-checks the saved row.
  perform public.kunthai_assert_promotion_targeting(coalesce(p_credit_budget, 5), cardinality(v_regions), greatest(cardinality(v_countries), 1), false);

  v_promotion := public.create_marketplace_listing_promotion(p_listing_type, p_listing_id, p_credit_budget, p_audience_type);

  update public.marketplace_promotions
  set target_region_ids = v_regions,
      target_country_isos = case when cardinality(v_countries) > 0 then v_countries else target_country_isos end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'audienceType', case
          when cardinality(v_countries) > 1 then 'countries'
          when cardinality(v_regions) > 0 then 'regions'
          else lower(coalesce(nullif(btrim(p_audience_type), ''), 'countrywide'))
        end,
        'targetRegions', public.kunthai_promotion_region_metadata(v_regions),
        'targetCountries', to_jsonb(coalesce(nullif(v_countries, '{}'), target_country_isos))
      ),
      updated_at = timezone('utc', now())
  where id = v_promotion.id
  returning * into v_promotion;

  return v_promotion;
end;
$$;

revoke all on function public.create_explore_ad_campaign_in_regions(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text, integer, uuid[], text[]) from public, anon;
grant execute on function public.create_explore_ad_campaign_in_regions(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text, integer, uuid[], text[]) to authenticated;
revoke all on function public.create_marketplace_visibility_promotion_in_regions(uuid, integer, text, uuid[], text[]) from public, anon;
grant execute on function public.create_marketplace_visibility_promotion_in_regions(uuid, integer, text, uuid[], text[]) to authenticated;
revoke all on function public.create_marketplace_listing_promotion_in_regions(text, uuid, integer, text, uuid[], text[]) from public, anon;
grant execute on function public.create_marketplace_listing_promotion_in_regions(text, uuid, integer, text, uuid[], text[]) to authenticated;

CREATE OR REPLACE FUNCTION public.get_recommended_explore_ads(p_user_id uuid, p_surface text DEFAULT 'urfeed'::text, p_limit integer DEFAULT 6)
 RETURNS TABLE(campaign_id uuid, post_id uuid, score double precision, reason text, campaign jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewer as (
    select
      users.id,
      case
        when coalesce(
          nullif(users.raw_user_meta_data->>'date_of_birth', ''),
          nullif(users.raw_user_meta_data->>'birth_date', ''),
          ''
        )
          ~ '^\d{4}-\d{2}-\d{2}$'
        then extract(year from age(
          current_date,
          to_date(coalesce(
            nullif(users.raw_user_meta_data->>'date_of_birth', ''),
            nullif(users.raw_user_meta_data->>'birth_date', '')
          ), 'YYYY-MM-DD')
        ))::integer
        else null
      end as viewer_age,
      lower(coalesce(users.raw_user_meta_data->>'gender', '')) as viewer_gender,
      -- Where the viewer is: their resolved account region's country, else
      -- the country on their profile. '' when unknown.
      coalesce(
        nullif((select account.country_iso from public.kunthai_account_regions account where account.user_id = users.id), ''),
        nullif(public.kunthai_normalize_country_iso(coalesce(
          nullif(users.raw_user_meta_data->>'country_code', ''),
          nullif(users.raw_user_meta_data->>'country', '')
        )), ''),
        ''
      ) as viewer_country
    from auth.users users
    where users.id = p_user_id and auth.uid() = p_user_id
  ),
  candidates as (
    select
      ad.*,
      post.likes_count,
      post.comments_count,
      post.saves_count,
      coalesce(personal.impressions, 0) as prior_impressions,
      coalesce(personal.watch_time_seconds, 0) as watch_seconds,
      coalesce(personal.max_completion_rate, 0) as completion_rate,
      coalesce(personal.skips, 0) as skips,
      coalesce(personal.hides, 0) as hides,
      coalesce(personal.reports, 0) as reports,
      coalesce(creator.interaction_score, 0) as creator_score,
      coalesce(topic_match.topic_score, 0) as topic_score,
      coalesce(topic_match.match_count, 0) as topic_matches,
      exists (
        select 1 from public.explore_follows follow
        where follow.follower_id = p_user_id and follow.following_id = ad.advertiser_id
      ) as follows_advertiser,
      frequency.today_count,
      frequency.total_count
    from public.explore_ad_campaigns ad
    join public.explore_posts post on post.id = ad.creative_post_id
    cross join viewer
    left join public.explore_content_signals personal
      on personal.user_id = p_user_id and personal.post_id = ad.creative_post_id
    left join public.explore_creator_interactions creator
      on creator.user_id = p_user_id and creator.creator_id = ad.advertiser_id
    left join lateral (
      select
        count(*)::integer as match_count,
        coalesce(sum(greatest(interest.interest_score, 0)), 0)::double precision as topic_score
      from public.explore_topic_interests interest
      where interest.user_id = p_user_id
        and lower(interest.topic) = any(coalesce(ad.interest_categories, '{}'::text[]))
    ) topic_match on true
    left join lateral (
      select
        count(*) filter (where event.created_at >= date_trunc('day', timezone('utc', now())))::integer as today_count,
        count(*)::integer as total_count
      from public.explore_ad_events event
      where event.user_id = p_user_id
        and event.campaign_id = ad.id
        and event.event_type = 'impression'
    ) frequency on true
    where ad.status = 'active'
      and ad.moderation_status = 'approved'
      and ad.starts_at <= timezone('utc', now())
      and ad.ends_at > timezone('utc', now())
      and ad.advertiser_id <> p_user_id
      and coalesce(post.post_privacy, 'public') = 'public'
      and post.post_type = 'advert'
      and post.category = 'advert'
      and post.moderation_status in ('not_required', 'approved', 'legacy')
      and (
        (lower(p_surface) = 'urfeed' and ad.placement in ('urfeed', 'both')
          and (nullif(btrim(coalesce(post.video_url, '')), '') is null or nullif(btrim(coalesce(post.image_url, '')), '') is not null))
        or
        (lower(p_surface) = 'swip' and ad.placement in ('swip', 'both')
          and nullif(btrim(coalesce(post.video_url, '')), '') is not null)
      )
      and not exists (
        select 1 from public.explore_user_blocks block
        where (block.blocker_id = p_user_id and block.blocked_id = ad.advertiser_id)
           or (block.blocker_id = ad.advertiser_id and block.blocked_id = p_user_id)
      )
      and not exists (
        select 1 from public.explore_post_reports report
        where report.post_id = post.id and report.status in ('open', 'reviewed')
      )
      and not exists (
        select 1 from public.explore_ad_user_controls control
        where control.user_id = p_user_id
          and (
            control.campaign_id = ad.id
            or (control.advertiser_id = ad.advertiser_id and control.action = 'mute_advertiser')
          )
      )
      and (
        ad.minimum_age <= 13
        or (viewer.viewer_age is not null and viewer.viewer_age >= ad.minimum_age)
      )
      and (
        ad.maximum_age is null
        or (viewer.viewer_age is not null and viewer.viewer_age <= ad.maximum_age)
      )
      and (
        ad.gender_target = 'all'
        or (viewer.viewer_gender <> '' and viewer.viewer_gender = ad.gender_target)
      )
      and (
        ad.audience_type in ('everyone', 'recommended')
        or (ad.audience_type = 'followers' and exists (
          select 1 from public.explore_follows f where f.follower_id = p_user_id and f.following_id = ad.advertiser_id
        ))
        or (ad.audience_type = 'followers_similar' and (
          exists (select 1 from public.explore_follows f where f.follower_id = p_user_id and f.following_id = ad.advertiser_id)
          or coalesce(creator.interaction_score, 0) > 0
          or coalesce(topic_match.match_count, 0) > 0
        ))
        -- Nearby adverts are delivered through their resolved states/districts; the
        -- regional filter below admits only viewers located inside them.
        or (ad.audience_type = 'nearby' and coalesce(cardinality(ad.target_region_ids), 0) > 0)
      )
      -- Country targeting: an advert reaches only the countries it paid for
      -- (its advertiser's country unless 100+ credits bought several). Older
      -- adverts without a country list keep their original reach; viewers
      -- whose country is unknown are not excluded.
      and (
        coalesce(cardinality(ad.target_country_isos), 0) = 0
        or viewer.viewer_country = ''
        or viewer.viewer_country = any(ad.target_country_isos)
      )
      -- Regional adverts: only viewers located in a chosen state/district.
      and (
        coalesce(cardinality(ad.target_region_ids), 0) = 0
        or public.kunthai_account_in_regions(p_user_id, ad.target_region_ids)
      )
      and frequency.today_count < ad.daily_impression_cap
      and frequency.total_count < ad.total_impression_cap
      and frequency.total_count <= ceil(
        ad.total_impression_cap * least(
          1,
          greatest(
            0.15,
            extract(epoch from (timezone('utc', now()) - ad.starts_at))
              / greatest(extract(epoch from (ad.ends_at - ad.starts_at)), 1)
              + 0.15
          )
        )
      )
  ),
  scored as (
    select candidate.*,
      (
        35
        + least(24, candidate.topic_score * 0.8)
        + least(18, greatest(-18, candidate.creator_score * 0.22))
        + case when candidate.follows_advertiser then 12 else 0 end
        + case when candidate.audience_type = 'recommended' then 5 else 0 end
        + case when candidate.prior_impressions = 0 then 12 else 0 end
        + least(12, candidate.completion_rate * 12)
        + least(8, candidate.watch_seconds * 0.35)
        + ln(1 + greatest(candidate.likes_count, 0)) * 1.2
        + ln(1 + greatest(candidate.comments_count, 0)) * 1.6
        + ln(1 + greatest(candidate.saves_count, 0)) * 2.0
        -- Visibility Credit boost: bigger budgets rank higher (diminishing
        -- returns, capped at +60) so paid reach is real but never fully buries a
        -- smaller, highly relevant advert or overrides the safety penalties.
        + least(60, 12 * ln(1 + greatest(coalesce(candidate.credit_budget, 0), 0) / 5.0))
        -- Objective bias: video-view campaigns favour proven watchers; profile
        -- visit / connection campaigns favour people not yet connected.
        + case when candidate.objective = 'video_views'
               then least(16, candidate.completion_rate * 10 + candidate.watch_seconds * 0.4)
               else 0 end
        + case when candidate.objective in ('profile_visits', 'followers') and not candidate.follows_advertiser
               then 10 else 0 end
        - least(candidate.skips, 3) * 12
        - least(candidate.hides + candidate.reports, 1) * 80
        - candidate.today_count * 14
        - candidate.total_count * 1.5
      )::double precision as delivery_score
    from candidates candidate
  )
  select
    ranked.id,
    ranked.creative_post_id,
    ranked.delivery_score,
    case
      when ranked.follows_advertiser then 'You follow this advertiser'
      when ranked.topic_matches > 0 then 'Matched to topics you engage with'
      when coalesce(cardinality(ranked.target_region_ids), 0) > 0 then 'Promoted to people in your area'
      when ranked.audience_type = 'nearby' then 'Relevant to an area you chose to personalize'
      when ranked.audience_type = 'recommended' then 'Recommended from your Explore activity'
      else 'Promoted across KunThai Explore'
    end,
    jsonb_build_object(
      'id', ranked.id,
      'placement', ranked.placement,
      'objective', ranked.objective,
      'audienceType', ranked.audience_type,
      'regional', coalesce(cardinality(ranked.target_region_ids), 0) > 0,
      'interests', ranked.interest_categories,
      'startsAt', ranked.starts_at,
      'endsAt', ranked.ends_at,
      'reason', case
        when ranked.follows_advertiser then 'You follow this advertiser'
        when ranked.topic_matches > 0 then 'Matched to topics you engage with'
        when coalesce(cardinality(ranked.target_region_ids), 0) > 0 then 'Promoted to people in your area'
        when ranked.audience_type = 'nearby' then 'Relevant to an area you chose to personalize'
        when ranked.audience_type = 'recommended' then 'Recommended from your Explore activity'
        else 'Promoted across KunThai Explore'
      end
    )
  from scored ranked
  order by ranked.delivery_score desc, ranked.last_delivery_at nulls first, ranked.created_at desc
  limit greatest(1, least(coalesce(p_limit, 6), 12));
$function$;

notify pgrst, 'reload schema';
