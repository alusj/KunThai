-- UrMall promotions, pricing and renewal fixes (audit, 2026-10-08).
--
-- 1. One boost duration everywhere. The seller is promised
--    visibilityCreditRules.getMarketplacePromotionDurationDays():
--      5 credits = 1 day, each extra credit +0.3 day, capped at 30 days
--      (10 = 2.5 days, 15 = 4 days, 20 = 5.5 days).
--    The boost RPCs still computed ceil(credits / 5) * 3 days and relied on
--    the duration trigger to overwrite it. Both RPCs and the trigger now use
--    kunthai_marketplace_promotion_duration_days(), the SQL twin of the client
--    formula.
-- 2. A delegated UrMall admin with the "addProducts" responsibility may start
--    a boost for that business. Credits are still spent from the CALLER's own
--    wallet (spend_visibility_credits debits auth.uid()).
-- 3. Re-promoting a product that is already boosted returns the live boost
--    unchanged: the *_in_regions wrappers no longer rewrite its paid
--    targeting for free.
-- 4. promoted flags of listings whose boost has ended are cleared (once now,
--    and by the hourly subscription job).
-- 6. Orders: a BEFORE INSERT trigger recomputes the total of retail orders
--    from the product rows (price, discount, tier price, quantity) and
--    rejects a total that does not match.
-- 9. One "Visibility Credits added" notification per purchase (unique index).
-- 11. The hourly renewal job handles every subscription in its own exception
--    block, and a renewal whose target plan is missing or inactive never
--    writes a NULL period end on a paid plan.

-- ---------------------------------------------------------------------------
-- 1. Boost duration
-- ---------------------------------------------------------------------------

create or replace function public.kunthai_marketplace_promotion_duration_days(p_credits integer)
returns numeric
language sql
immutable
set search_path = public
as $$
  -- Mirrors getMarketplacePromotionDurationDays (missing credits count as 5).
  select round(
    greatest(1::numeric, least(30::numeric,
      1::numeric + greatest(0, coalesce(nullif(p_credits, 0), 5) - 5)::numeric * 0.3
    )),
    1
  );
$$;

grant execute on function public.kunthai_marketplace_promotion_duration_days(integer) to anon, authenticated;

-- Latest definition: 20260828090000_fair_promotion_pricing_and_urfeed_starter.sql.
create or replace function public.enforce_marketplace_visibility_promotion_duration()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  credit_amount integer := greatest(0, coalesce(new.credit_budget, new.budget_limit, 0));
  start_time timestamptz := coalesce(new.starts_at, timezone('utc', now()));
  duration_days numeric;
begin
  if credit_amount < 5
     or coalesce(new.metadata ->> 'source', '') <> 'visibility_credits'
  then
    return new;
  end if;

  -- Existing campaigns keep the window under which they were purchased. Only
  -- campaigns created under this pricing version are recalculated on update.
  if tg_op = 'UPDATE'
     and coalesce(old.metadata ->> 'pricingVersion', '') <> 'fair_v2'
  then
    return new;
  end if;

  duration_days := public.kunthai_marketplace_promotion_duration_days(credit_amount);

  new.starts_at := start_time;
  new.ends_at := start_time + duration_days * interval '1 day';
  new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{durationDays}', to_jsonb(duration_days), true);
  new.metadata := jsonb_set(new.metadata, '{pricingVersion}', '"fair_v2"'::jsonb, true);
  return new;
end;
$$;

revoke all on function public.enforce_marketplace_visibility_promotion_duration() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1 + 2. Product boost RPC
-- Latest definition: 20260808160000_promotion_resolve_business_from_listing.sql.
-- ---------------------------------------------------------------------------

create or replace function public.create_marketplace_visibility_promotion(
  p_product_id uuid,
  p_credit_budget integer default 5,
  p_audience_type text default 'countrywide'
)
returns public.marketplace_promotions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.marketplace_products;
  v_business public.marketplace_businesses;
  v_promotion public.marketplace_promotions;
  v_credit_budget integer := greatest(0, coalesce(p_credit_budget, 5));
  v_audience_type text := lower(coalesce(nullif(btrim(p_audience_type), ''), 'countrywide'));
  v_duration_days numeric;
begin
  if auth.uid() is null then
    raise exception 'Sign in to promote products.';
  end if;

  if v_credit_budget < 5 then
    raise exception 'Choose at least 5 Visibility Credits for a product boost.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kunthai_visibility_boost:' || auth.uid()::text, 0));
  -- Owner and delegated admins may boost the same listing: serialise per
  -- listing too, so only one live boost is ever created.
  perform pg_advisory_xact_lock(hashtextextended('kunthai_listing_boost:' || coalesce(p_product_id::text, ''), 0));

  -- The owner of any of their businesses, or an accepted admin of the
  -- listing's business with the "addProducts" responsibility.
  select p.* into v_product
  from public.marketplace_products p
  join public.marketplace_businesses b on b.id = p.business_id
  where p.id = p_product_id
    and (b.user_id = auth.uid() or public.has_urmall_admin_responsibility(p.business_id, 'addProducts'));

  if v_product.id is null then
    raise exception 'Choose a product from a business you own, or manage with product access, before promoting.';
  end if;

  select * into v_business from public.marketplace_businesses where id = v_product.business_id;

  -- Idempotent: if this product already has a live boost, return it instead of
  -- raising, so a retry never looks like a failure.
  select * into v_promotion
  from public.marketplace_promotions
  where product_id = v_product.id
    and status = 'active'
    and (ends_at is null or ends_at > timezone('utc', now()))
  order by created_at desc
  limit 1;

  if v_promotion.id is not null then
    return v_promotion;
  end if;

  v_duration_days := public.kunthai_marketplace_promotion_duration_days(v_credit_budget);

  insert into public.marketplace_promotions (
    business_id, product_id, listing_type, name, product_name, discount_label,
    budget_spent, budget_limit, credit_budget, credits_spent,
    views, orders, revenue, status, starts_at, ends_at, metadata
  ) values (
    v_business.id, v_product.id, 'product', concat(v_product.name, ' boost'), v_product.name,
    'Visibility boost',
    0, v_credit_budget, v_credit_budget, v_credit_budget,
    0, 0, 0, 'active', timezone('utc', now()),
    timezone('utc', now()) + v_duration_days * interval '1 day',
    jsonb_build_object(
      'durationDays', v_duration_days,
      'audienceType', v_audience_type,
      'source', 'visibility_credits',
      'pricingVersion', 'fair_v2',
      'promotedBy', auth.uid()
    )
  )
  returning * into v_promotion;

  -- Always the caller's own wallet, also for a delegated admin.
  perform public.spend_visibility_credits(
    v_credit_budget,
    'urmall',
    'marketplace_promotion',
    v_promotion.id,
    jsonb_build_object('productId', v_product.id, 'productName', v_product.name)
  );

  update public.marketplace_products
  set promoted = true,
      promoted_at = timezone('utc', now()),
      status = case when status = 'draft' then 'active' else status end,
      updated_at = timezone('utc', now())
  where id = v_product.id;

  return v_promotion;
end;
$$;

grant execute on function public.create_marketplace_visibility_promotion(uuid, integer, text) to authenticated;

-- Same rules for meals & properties.
-- Latest definition: 20260808160000_promotion_resolve_business_from_listing.sql.
create or replace function public.create_marketplace_listing_promotion(
  p_listing_type text,
  p_listing_id uuid,
  p_credit_budget integer default 5,
  p_audience_type text default 'countrywide'
)
returns public.marketplace_promotions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promotion public.marketplace_promotions;
  v_meal public.marketplace_restaurant_menu_items;
  v_property public.marketplace_property_listings;
  v_product public.marketplace_products;
  v_business_id uuid;
  v_listing_type text := lower(coalesce(nullif(btrim(p_listing_type), ''), 'product'));
  v_credit_budget integer := greatest(0, coalesce(p_credit_budget, 5));
  v_audience_type text := lower(coalesce(nullif(btrim(p_audience_type), ''), 'countrywide'));
  v_duration_days numeric;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to promote listings.';
  end if;

  if v_listing_type not in ('product', 'meal', 'property') then
    raise exception 'Unsupported listing type: %', v_listing_type;
  end if;

  if v_credit_budget < 5 then
    raise exception 'Choose at least 5 Visibility Credits for a boost.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kunthai_visibility_boost:' || auth.uid()::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('kunthai_listing_boost:' || coalesce(p_listing_id::text, ''), 0));

  if v_listing_type = 'meal' then
    select m.* into v_meal
    from public.marketplace_restaurant_menu_items m
    join public.marketplace_businesses b on b.id = m.business_id
    where m.id = p_listing_id
      and (b.user_id = auth.uid() or public.has_urmall_admin_responsibility(m.business_id, 'addProducts'));
    if v_meal.id is null then
      raise exception 'Choose a meal from a business you own, or manage with product access, before promoting.';
    end if;
    v_business_id := v_meal.business_id;
    v_name := v_meal.name;
  elsif v_listing_type = 'property' then
    select pr.* into v_property
    from public.marketplace_property_listings pr
    join public.marketplace_businesses b on b.id = pr.business_id
    where pr.id = p_listing_id
      and (b.user_id = auth.uid() or public.has_urmall_admin_responsibility(pr.business_id, 'addProducts'));
    if v_property.id is null then
      raise exception 'Choose a property from a business you own, or manage with product access, before promoting.';
    end if;
    v_business_id := v_property.business_id;
    v_name := v_property.title;
  else
    select p.* into v_product
    from public.marketplace_products p
    join public.marketplace_businesses b on b.id = p.business_id
    where p.id = p_listing_id
      and (b.user_id = auth.uid() or public.has_urmall_admin_responsibility(p.business_id, 'addProducts'));
    if v_product.id is null then
      raise exception 'Choose a product from a business you own, or manage with product access, before promoting.';
    end if;
    v_business_id := v_product.business_id;
    v_name := v_product.name;
  end if;

  -- Idempotent: return an existing live boost for this listing.
  select * into v_promotion
  from public.marketplace_promotions
  where status = 'active'
    and (ends_at is null or ends_at > timezone('utc', now()))
    and (
      (v_listing_type = 'meal' and meal_id = p_listing_id)
      or (v_listing_type = 'property' and property_id = p_listing_id)
      or (v_listing_type = 'product' and product_id = p_listing_id)
    )
  order by created_at desc
  limit 1;

  if v_promotion.id is not null then
    return v_promotion;
  end if;

  v_duration_days := public.kunthai_marketplace_promotion_duration_days(v_credit_budget);

  insert into public.marketplace_promotions (
    business_id, product_id, meal_id, property_id, listing_type,
    name, product_name, discount_label,
    budget_spent, budget_limit, credit_budget, credits_spent,
    views, orders, revenue, status, starts_at, ends_at, metadata
  ) values (
    v_business_id,
    case when v_listing_type = 'product' then p_listing_id else null end,
    case when v_listing_type = 'meal' then p_listing_id else null end,
    case when v_listing_type = 'property' then p_listing_id else null end,
    v_listing_type,
    concat(v_name, ' boost'), v_name, 'Visibility boost',
    0, v_credit_budget, v_credit_budget, v_credit_budget,
    0, 0, 0, 'active', timezone('utc', now()),
    timezone('utc', now()) + v_duration_days * interval '1 day',
    jsonb_build_object(
      'durationDays', v_duration_days,
      'audienceType', v_audience_type,
      'source', 'visibility_credits',
      'listingType', v_listing_type,
      'pricingVersion', 'fair_v2',
      'promotedBy', auth.uid()
    )
  )
  returning * into v_promotion;

  perform public.spend_visibility_credits(
    v_credit_budget,
    'urmall',
    'marketplace_promotion',
    v_promotion.id,
    jsonb_build_object('listingId', p_listing_id, 'listingType', v_listing_type, 'listingName', v_name)
  );

  if v_listing_type = 'meal' then
    update public.marketplace_restaurant_menu_items
    set promoted = true,
        promoted_at = timezone('utc', now()),
        available = true,
        updated_at = timezone('utc', now())
    where id = p_listing_id;
  elsif v_listing_type = 'property' then
    update public.marketplace_property_listings
    set promoted = true,
        promoted_at = timezone('utc', now()),
        published = true,
        updated_at = timezone('utc', now())
    where id = p_listing_id;
  else
    update public.marketplace_products
    set promoted = true,
        promoted_at = timezone('utc', now()),
        status = case when status = 'draft' then 'active' else status end,
        updated_at = timezone('utc', now())
    where id = p_listing_id;
  end if;

  return v_promotion;
end;
$$;

grant execute on function public.create_marketplace_listing_promotion(text, uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Region wrappers never change the targeting of a live boost
-- Latest definitions: 20261002120000_global_country_defaults_and_promotion_targeting.sql.
-- ---------------------------------------------------------------------------

create or replace function public.create_marketplace_visibility_promotion_in_regions(
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
  v_existing_id uuid;
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

  -- Same lock as the base RPC, taken first so the live-boost check below and
  -- the base RPC see the same state.
  perform pg_advisory_xact_lock(hashtextextended('kunthai_listing_boost:' || coalesce(p_product_id::text, ''), 0));
  select promotion.id into v_existing_id
  from public.marketplace_promotions promotion
  where promotion.product_id = p_product_id
    and promotion.status = 'active'
    and (promotion.ends_at is null or promotion.ends_at > timezone('utc', now()))
  order by promotion.created_at desc
  limit 1;

  -- Checks access; returns the live boost unchanged when there is one.
  v_promotion := public.create_marketplace_visibility_promotion(p_product_id, p_credit_budget, p_audience_type);

  if v_existing_id is not null and v_promotion.id = v_existing_id then
    -- Nothing was charged: keep the targeting that was paid for.
    return v_promotion;
  end if;

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

create or replace function public.create_marketplace_listing_promotion_in_regions(
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
  v_existing_id uuid;
  v_listing_type text := lower(coalesce(nullif(btrim(p_listing_type), ''), 'product'));
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

  perform pg_advisory_xact_lock(hashtextextended('kunthai_listing_boost:' || coalesce(p_listing_id::text, ''), 0));
  select promotion.id into v_existing_id
  from public.marketplace_promotions promotion
  where promotion.status = 'active'
    and (promotion.ends_at is null or promotion.ends_at > timezone('utc', now()))
    and (
      (v_listing_type = 'meal' and promotion.meal_id = p_listing_id)
      or (v_listing_type = 'property' and promotion.property_id = p_listing_id)
      or (v_listing_type = 'product' and promotion.product_id = p_listing_id)
    )
  order by promotion.created_at desc
  limit 1;

  v_promotion := public.create_marketplace_listing_promotion(p_listing_type, p_listing_id, p_credit_budget, p_audience_type);

  if v_existing_id is not null and v_promotion.id = v_existing_id then
    return v_promotion;
  end if;

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

revoke all on function public.create_marketplace_visibility_promotion_in_regions(uuid, integer, text, uuid[], text[]) from public, anon;
grant execute on function public.create_marketplace_visibility_promotion_in_regions(uuid, integer, text, uuid[], text[]) to authenticated;
revoke all on function public.create_marketplace_listing_promotion_in_regions(text, uuid, integer, text, uuid[], text[]) from public, anon;
grant execute on function public.create_marketplace_listing_promotion_in_regions(text, uuid, integer, text, uuid[], text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Clear promoted flags of listings whose boost has ended
-- ---------------------------------------------------------------------------

create or replace function public.kunthai_clear_expired_promotion_flags()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_cleared integer := 0;
  v_count integer;
begin
  update public.marketplace_products product
  set promoted = false, updated_at = v_now
  where product.promoted
    and not exists (
      select 1 from public.marketplace_promotions promotion
      where promotion.product_id = product.id
        and promotion.status = 'active'
        and (promotion.ends_at is null or promotion.ends_at > v_now)
    );
  get diagnostics v_count = row_count;
  v_cleared := v_cleared + v_count;

  if to_regclass('public.marketplace_restaurant_menu_items') is not null then
    update public.marketplace_restaurant_menu_items meal
    set promoted = false, updated_at = v_now
    where meal.promoted
      and not exists (
        select 1 from public.marketplace_promotions promotion
        where promotion.meal_id = meal.id
          and promotion.status = 'active'
          and (promotion.ends_at is null or promotion.ends_at > v_now)
      );
    get diagnostics v_count = row_count;
    v_cleared := v_cleared + v_count;
  end if;

  if to_regclass('public.marketplace_property_listings') is not null then
    update public.marketplace_property_listings property
    set promoted = false, updated_at = v_now
    where property.promoted
      and not exists (
        select 1 from public.marketplace_promotions promotion
        where promotion.property_id = property.id
          and promotion.status = 'active'
          and (promotion.ends_at is null or promotion.ends_at > v_now)
      );
    get diagnostics v_count = row_count;
    v_cleared := v_cleared + v_count;
  end if;

  return v_cleared;
end;
$$;

revoke all on function public.kunthai_clear_expired_promotion_flags() from public, anon, authenticated;

select public.kunthai_clear_expired_promotion_flags();

-- ---------------------------------------------------------------------------
-- 6. Server-side order totals
-- Orders store no line table: a single-product order carries product_id and
-- item_count (the quantity); a cart checkout with several lines per store has
-- product_id = null and is inserted while the buyer's cart rows still exist
-- (the cart is cleared after every order is created).
-- ---------------------------------------------------------------------------

create or replace function public.kunthai_marketplace_unit_price(
  p_price numeric,
  p_discount_price numeric,
  p_tier_pricing jsonb,
  p_quantity integer
)
returns numeric
language sql
immutable
set search_path = public
as $$
  -- Mirrors tierPricingUtils.getTierUnitPrice with the discounted base price:
  -- the lowest applicable unit price wins.
  with base as (
    select
      case when coalesce(p_discount_price, 0) > 0 and p_discount_price < coalesce(p_price, 0)
        then p_discount_price else coalesce(p_price, 0) end as price,
      greatest(1, coalesce(p_quantity, 1)) as qty
  ),
  tiers as (
    select
      case when coalesce(tier ->> 'minQty', tier ->> 'min_qty', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
        then coalesce(tier ->> 'minQty', tier ->> 'min_qty')::numeric else 0 end as min_qty,
      case when coalesce(tier ->> 'maxQty', tier ->> 'max_qty', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
        then coalesce(tier ->> 'maxQty', tier ->> 'max_qty')::numeric else 0 end as max_qty,
      case when coalesce(tier ->> 'price', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
        then (tier ->> 'price')::numeric else 0 end as price
    from jsonb_array_elements(case when jsonb_typeof(p_tier_pricing) = 'array' then p_tier_pricing else '[]'::jsonb end) tier
    where jsonb_typeof(tier) = 'object'
  ),
  matched as (
    select tiers.price
    from tiers, base
    where tiers.price > 0
      and (tiers.min_qty > 0 or tiers.max_qty > 0)
      and base.qty >= greatest(1, tiers.min_qty)
      and (tiers.max_qty <= 0 or base.qty <= tiers.max_qty)
    order by tiers.min_qty desc
    limit 1
  )
  select case
    when (select price from matched) is null then base.price
    when base.price > 0 then least((select price from matched), base.price)
    else (select price from matched)
  end
  from base;
$$;

grant execute on function public.kunthai_marketplace_unit_price(numeric, numeric, jsonb, integer) to anon, authenticated;

create or replace function public.kunthai_guard_marketplace_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
  v_expected numeric;
  v_lines integer;
  v_quantity integer;
begin
  -- Service jobs and platform admins may record any amount.
  if auth.uid() is null or public.is_kunthai_admin() then
    return new;
  end if;

  if new.product_id is not null then
    select product.business_id, product.price, product.discount_price, product.tier_pricing as tiers
    into v_product
    from public.marketplace_products product
    where product.id = new.product_id;

    if not found then
      raise exception 'This product is no longer available.' using errcode = 'P0001';
    end if;
    if v_product.business_id is distinct from new.business_id then
      raise exception 'This product does not belong to that store.' using errcode = 'P0001';
    end if;

    v_quantity := greatest(1, coalesce(new.item_count, 1));
    v_expected := round(
      public.kunthai_marketplace_unit_price(v_product.price, v_product.discount_price, v_product.tiers, v_quantity) * v_quantity,
      2
    );
  else
    -- A multi-line cart order for this store (a single line sets product_id).
    select count(*), coalesce(sum(cart.quantity), 0),
           round(coalesce(sum(
             public.kunthai_marketplace_unit_price(
               product.price, product.discount_price, product.tier_pricing, cart.quantity
             ) * cart.quantity
           ), 0), 2)
    into v_lines, v_quantity, v_expected
    from public.marketplace_cart_items cart
    join public.marketplace_products product on product.id = cart.product_id
    where cart.buyer_id = new.buyer_id
      and cart.business_id = new.business_id;

    -- No matching cart lines: an order for a meal, room or property, which
    -- has no product row to price it from.
    if v_lines < 2 or v_quantity <> coalesce(new.item_count, 0) then
      return new;
    end if;
  end if;

  if new.total_amount is null or abs(new.total_amount - v_expected) > 0.01 then
    raise exception 'KUNTHAI_ORDER_PRICE_CHANGED|%|%', v_expected, coalesce(new.total_amount, 0)
      using errcode = 'P0001',
            hint = 'The price of an item changed. Refresh and try again.';
  end if;

  -- Store the server amount (drops client floating-point noise).
  new.total_amount := v_expected;
  return new;
end;
$$;

revoke all on function public.kunthai_guard_marketplace_order_total() from public, anon, authenticated;

drop trigger if exists marketplace_orders_total_guard on public.marketplace_orders;
create trigger marketplace_orders_total_guard
before insert on public.marketplace_orders
for each row execute function public.kunthai_guard_marketplace_order_total();

-- ---------------------------------------------------------------------------
-- 9. One purchase notification per Visibility Credit purchase
-- ---------------------------------------------------------------------------

delete from public.platform_notifications duplicate
using public.platform_notifications kept
where duplicate.notification_type = 'visibility_credit_purchase'
  and kept.notification_type = 'visibility_credit_purchase'
  and duplicate.user_id = kept.user_id
  and duplicate.action_target = kept.action_target
  and (duplicate.created_at, duplicate.id) > (kept.created_at, kept.id);

create unique index if not exists platform_notifications_visibility_purchase_uidx
on public.platform_notifications (user_id, action_target)
where notification_type = 'visibility_credit_purchase'
  and action_target is not null;

-- ---------------------------------------------------------------------------
-- 11. Renewals
-- kunthai_renew_subscription_row is the UrMall retention wrapper
-- (20260905130000) around kunthai_renew_subscription_row_before_urmall_retention,
-- whose body is the latest renewal (20260822090000 yearly billing). Only the
-- target-plan handling changes: a missing or inactive target plan falls back
-- to the current plan (auto-renew), otherwise to the normal grace -> Free path.
-- ---------------------------------------------------------------------------

create or replace function public.kunthai_renew_subscription_row_before_urmall_retention(
  p_subscription_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_current_plan public.kunthai_business_plans%rowtype;
  v_target_plan public.kunthai_business_plans%rowtype;
  v_target_code text;
  v_target_interval text;
  v_renew_cost integer;
  v_renew_duration integer;
  v_now timestamptz := timezone('utc', now());
  v_grace_end timestamptz;
  v_business_name text := 'Your business';
begin
  select * into v_subscription
  from public.kunthai_business_subscriptions subscription
  where subscription.id = p_subscription_id
  for update;

  if v_subscription.id is null or v_subscription.plan_code = 'free'
    or v_subscription.current_period_end is null
    or v_subscription.current_period_end > v_now then
    return 'unchanged';
  end if;

  select * into v_current_plan
  from public.kunthai_business_plans plan
  where plan.surface = v_subscription.surface and plan.plan_code = v_subscription.plan_code;

  v_grace_end := coalesce(
    v_subscription.grace_ends_at,
    v_subscription.current_period_end + make_interval(days => coalesce(v_current_plan.grace_days, 7))
  );
  v_target_code := coalesce(v_subscription.pending_plan_code,
    case when v_subscription.auto_renew then v_subscription.plan_code else 'free' end);
  v_target_interval := coalesce(v_subscription.pending_billing_interval, v_subscription.billing_interval, 'monthly');

  if v_target_code <> 'free' then
    select * into v_target_plan
    from public.kunthai_business_plans plan
    where plan.surface = v_subscription.surface and plan.plan_code = v_target_code and plan.active = true;

    -- A scheduled plan that was withdrawn: keep renewing the current plan.
    if v_target_plan.plan_code is null
      and v_target_code <> v_subscription.plan_code
      and v_subscription.auto_renew then
      v_target_code := v_subscription.plan_code;
      v_target_interval := coalesce(v_subscription.billing_interval, 'monthly');
      select * into v_target_plan
      from public.kunthai_business_plans plan
      where plan.surface = v_subscription.surface and plan.plan_code = v_target_code and plan.active = true;
    end if;

    if v_target_plan.plan_code is not null then
      v_renew_cost := case when v_target_interval = 'yearly'
        then coalesce(v_target_plan.yearly_credit_cost, v_target_plan.credit_cost * 10)
        else v_target_plan.credit_cost end;
      v_renew_duration := case when v_target_interval = 'yearly'
        then coalesce(v_target_plan.yearly_duration_days, 365)
        else v_target_plan.duration_days end;
    end if;

    -- No sellable plan to renew into: never write a paid plan with a NULL
    -- period end; follow the normal grace -> Free path instead.
    if v_target_plan.plan_code is null
      or v_renew_cost is null or v_renew_cost < 0
      or v_renew_duration is null or v_renew_duration <= 0 then
      v_target_code := 'free';
    end if;
  end if;

  if v_subscription.surface = 'urmall' then
    select coalesce(nullif(business.business_name, ''), 'Your UrMall business') into v_business_name
    from public.marketplace_businesses business where business.id = v_subscription.marketplace_business_id;
  else
    select coalesce(nullif(company.company_name, ''), 'Your UrRide company') into v_business_name
    from public.transport_companies company where company.id = v_subscription.transport_company_id;
  end if;
  v_business_name := coalesce(v_business_name, 'Your business');

  if v_target_code = 'free' then
    if v_now <= v_grace_end then
      update public.kunthai_business_subscriptions
      set status = 'grace', grace_ends_at = v_grace_end, updated_at = v_now
      where id = v_subscription.id;
      if not v_subscription.grace_notice_sent then
        perform public.kunthai_subscription_notify(
          v_subscription.payer_user_id,
          'business-subscription:' || v_subscription.id::text || ':grace:' || v_grace_end::date::text,
          format('%s is in a 7-day plan grace period. Existing resources are safe; renew or choose a plan before adding more.', v_business_name),
          'high'
        );
        update public.kunthai_business_subscriptions set grace_notice_sent = true where id = v_subscription.id;
      end if;
      return 'grace';
    end if;

    update public.kunthai_business_subscriptions
    set plan_code = 'free', status = 'expired', pending_plan_code = null,
        pending_billing_interval = null, billing_interval = 'monthly',
        auto_renew = false, current_period_start = null, current_period_end = null,
        grace_ends_at = null, operator_pack_count = 0, updated_at = v_now
    where id = v_subscription.id;
    insert into public.kunthai_business_subscription_events (
      subscription_id, event_type, from_plan_code, to_plan_code, actor_user_id
    ) values (v_subscription.id, 'expired_to_free', v_subscription.plan_code, 'free', v_subscription.payer_user_id);
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':expired:' || v_now::date::text,
      format('%s is now on the Free plan. Nothing was deleted; new additions follow Free plan limits.', v_business_name),
      'high'
    );
    return 'expired';
  end if;

  begin
    perform public.kunthai_debit_subscription_credits(
      v_subscription.payer_user_id,
      v_renew_cost,
      v_subscription.surface,
      v_subscription.id,
      jsonb_build_object('kind', 'renewal', 'plan', v_target_code, 'interval', v_target_interval)
    );

    update public.kunthai_business_subscriptions
    set plan_code = v_target_code,
        status = 'active',
        pending_plan_code = null,
        pending_billing_interval = null,
        billing_interval = v_target_interval,
        current_period_start = v_now,
        current_period_end = v_now + make_interval(days => v_renew_duration),
        grace_ends_at = v_now + make_interval(days => v_renew_duration + coalesce(v_target_plan.grace_days, 7)),
        operator_pack_count = case when v_target_code = 'premium' then operator_pack_count else 0 end,
        reminder_7_sent = false,
        reminder_3_sent = false,
        reminder_1_sent = false,
        grace_notice_sent = false,
        updated_at = v_now
    where id = v_subscription.id;

    insert into public.kunthai_business_subscription_events (
      subscription_id, event_type, from_plan_code, to_plan_code, credits, actor_user_id
    ) values (
      v_subscription.id, 'renewed', v_subscription.plan_code, v_target_code,
      v_renew_cost, v_subscription.payer_user_id
    );
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':renewed:' || v_now::date::text,
      format('%s %s plan renewed successfully for %s Visibility Credits.',
        v_business_name, initcap(v_target_code), v_renew_cost),
      'normal'
    );
    return 'renewed';
  exception when raise_exception then
    if v_now <= v_grace_end then
      update public.kunthai_business_subscriptions
      set status = 'grace', grace_ends_at = v_grace_end, updated_at = v_now
      where id = v_subscription.id;
      if not v_subscription.grace_notice_sent then
        perform public.kunthai_subscription_notify(
          v_subscription.payer_user_id,
          'business-subscription:' || v_subscription.id::text || ':credit-grace:' || v_grace_end::date::text,
          format('%s could not renew because the Visibility Credit balance is too low. You have until %s to add credits.',
            v_business_name, to_char(v_grace_end, 'Mon DD')),
          'high'
        );
        update public.kunthai_business_subscriptions set grace_notice_sent = true where id = v_subscription.id;
      end if;
      return 'grace';
    end if;

    update public.kunthai_business_subscriptions
    set plan_code = 'free', status = 'expired', pending_plan_code = null,
        pending_billing_interval = null, billing_interval = 'monthly',
        auto_renew = false, current_period_start = null, current_period_end = null,
        grace_ends_at = null, operator_pack_count = 0, updated_at = v_now
    where id = v_subscription.id;
    insert into public.kunthai_business_subscription_events (
      subscription_id, event_type, from_plan_code, to_plan_code, actor_user_id,
      metadata
    ) values (
      v_subscription.id, 'renewal_failed_to_free', v_subscription.plan_code, 'free',
      v_subscription.payer_user_id, jsonb_build_object('reason', 'insufficient_credits')
    );
    perform public.kunthai_subscription_notify(
      v_subscription.payer_user_id,
      'business-subscription:' || v_subscription.id::text || ':credit-expired:' || v_now::date::text,
      format('%s moved to Free after the renewal grace period. Existing resources were preserved.', v_business_name),
      'high'
    );
    return 'expired';
  end;
end;
$$;

revoke all on function public.kunthai_renew_subscription_row_before_urmall_retention(uuid) from public, anon, authenticated;

-- Latest definition: 20261007170000_business_plan_fairness.sql (keeps the
-- early renewal). Each subscription now runs in its own sub-transaction: one
-- failure is counted and logged, and the other renewals of the run commit.
create or replace function public.process_kunthai_business_subscriptions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_result text;
  v_checked integer := 0;
  v_reminders integer := 0;
  v_renewed integer := 0;
  v_grace integer := 0;
  v_expired integer := 0;
  v_failed integer := 0;
  v_flags integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  for v_row in
    select subscription.id
    from public.kunthai_business_subscriptions subscription
    where subscription.plan_code <> 'free'
      and subscription.status in ('active', 'grace')
      and subscription.current_period_end is not null
    order by subscription.current_period_end
  loop
    v_checked := v_checked + 1;
    begin
      v_reminders := v_reminders + coalesce(public.kunthai_send_subscription_reminders(v_row.id), 0);
      -- Auto-renewing plans renew up to 75 minutes before they end, so an
      -- hourly run never leaves a paid business on Free limits (UrMall showed
      -- only the newest ten listings until the late renewal).
      if public.kunthai_try_early_subscription_renewal(v_row.id) then
        v_renewed := v_renewed + 1;
        continue;
      end if;
      v_result := public.kunthai_renew_subscription_row(v_row.id);
      if v_result = 'renewed' then v_renewed := v_renewed + 1; end if;
      if v_result = 'grace' then v_grace := v_grace + 1; end if;
      if v_result = 'expired' then v_expired := v_expired + 1; end if;
    exception when others then
      -- Only this subscription's changes are rolled back; it is retried on
      -- the next hourly run.
      v_failed := v_failed + 1;
      raise warning 'Business subscription % could not be processed: % (%)', v_row.id, sqlerrm, sqlstate;
    end;
  end loop;

  -- Listings whose boost ended stop showing as promoted.
  begin
    v_flags := public.kunthai_clear_expired_promotion_flags();
  exception when others then
    raise warning 'Expired promotion flags could not be cleared: % (%)', sqlerrm, sqlstate;
  end;

  return jsonb_build_object(
    'checked', v_checked,
    'reminders', v_reminders,
    'renewed', v_renewed,
    'grace', v_grace,
    'expired', v_expired,
    'failed', v_failed,
    'promotionFlagsCleared', v_flags
  );
end;
$$;

revoke all on function public.process_kunthai_business_subscriptions() from public, anon, authenticated;
grant execute on function public.process_kunthai_business_subscriptions() to service_role;
