-- Fix: "Publish & promote" saved the product but the boost failed with
-- "Choose a product from your business before promoting" for sellers who own
-- more than one business.
--
-- Both promotion RPCs resolved the seller's business as "the most recently
-- updated business" and then required the listing to belong to THAT business.
-- A seller with multiple businesses boosting a listing from a different business
-- always failed the lookup. Resolve the business from the listing's own
-- ownership instead (any business owned by the caller), and treat an already
-- active promotion as success so a retry never errors.

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
  v_duration_days integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to promote products.';
  end if;

  if v_credit_budget < 5 then
    raise exception 'Choose at least 5 Visibility Credits for a product boost.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kunthai_visibility_boost:' || auth.uid()::text, 0));

  -- Resolve the product by ownership across ALL of the seller's businesses, so a
  -- multi-business seller can boost a product from any of their businesses.
  select p.* into v_product
  from public.marketplace_products p
  join public.marketplace_businesses b on b.id = p.business_id
  where p.id = p_product_id and b.user_id = auth.uid();

  if v_product.id is null then
    raise exception 'Choose a product from your business before promoting.';
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

  v_duration_days := greatest(1, least(30, ceiling(v_credit_budget::numeric / 5)::integer * 3));

  insert into public.marketplace_promotions (
    business_id, product_id, listing_type, name, product_name, discount_label,
    budget_spent, budget_limit, credit_budget, credits_spent,
    views, orders, revenue, status, starts_at, ends_at, metadata
  ) values (
    v_business.id, v_product.id, 'product', concat(v_product.name, ' boost'), v_product.name,
    'Visibility boost',
    0, v_credit_budget, v_credit_budget, v_credit_budget,
    0, 0, 0, 'active', timezone('utc', now()),
    timezone('utc', now()) + make_interval(days => v_duration_days),
    jsonb_build_object(
      'durationDays', v_duration_days,
      'audienceType', v_audience_type,
      'source', 'visibility_credits'
    )
  )
  returning * into v_promotion;

  perform public.spend_visibility_credits(
    v_credit_budget,
    'urmall',
    'marketplace_promotion',
    v_promotion.id,
    jsonb_build_object('productId', v_product.id, 'productName', v_product.name)
  );

  update public.marketplace_products
  set promoted = true,
      promoted_at = coalesce(promoted_at, timezone('utc', now())),
      status = case when status = 'draft' then 'active' else status end,
      updated_at = timezone('utc', now())
  where id = v_product.id;

  return v_promotion;
end;
$$;

grant execute on function public.create_marketplace_visibility_promotion(uuid, integer, text) to authenticated;

-- Same ownership-based resolution for meals & properties.
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
  v_duration_days integer;
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

  if v_listing_type = 'meal' then
    select m.* into v_meal
    from public.marketplace_restaurant_menu_items m
    join public.marketplace_businesses b on b.id = m.business_id
    where m.id = p_listing_id and b.user_id = auth.uid();
    if v_meal.id is null then
      raise exception 'Choose a meal from your business before promoting.';
    end if;
    v_business_id := v_meal.business_id;
    v_name := v_meal.name;
  elsif v_listing_type = 'property' then
    select pr.* into v_property
    from public.marketplace_property_listings pr
    join public.marketplace_businesses b on b.id = pr.business_id
    where pr.id = p_listing_id and b.user_id = auth.uid();
    if v_property.id is null then
      raise exception 'Choose a property from your business before promoting.';
    end if;
    v_business_id := v_property.business_id;
    v_name := v_property.title;
  else
    select p.* into v_product
    from public.marketplace_products p
    join public.marketplace_businesses b on b.id = p.business_id
    where p.id = p_listing_id and b.user_id = auth.uid();
    if v_product.id is null then
      raise exception 'Choose a product from your business before promoting.';
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

  v_duration_days := greatest(1, least(30, ceiling(v_credit_budget::numeric / 5)::integer * 3));

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
    timezone('utc', now()) + make_interval(days => v_duration_days),
    jsonb_build_object(
      'durationDays', v_duration_days,
      'audienceType', v_audience_type,
      'source', 'visibility_credits',
      'listingType', v_listing_type
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
        promoted_at = coalesce(promoted_at, timezone('utc', now())),
        available = true,
        updated_at = timezone('utc', now())
    where id = p_listing_id;
  elsif v_listing_type = 'property' then
    update public.marketplace_property_listings
    set promoted = true,
        promoted_at = coalesce(promoted_at, timezone('utc', now())),
        published = true,
        updated_at = timezone('utc', now())
    where id = p_listing_id;
  else
    update public.marketplace_products
    set promoted = true,
        promoted_at = coalesce(promoted_at, timezone('utc', now())),
        status = case when status = 'draft' then 'active' else status end,
        updated_at = timezone('utc', now())
    where id = p_listing_id;
  end if;

  return v_promotion;
end;
$$;

grant execute on function public.create_marketplace_listing_promotion(text, uuid, integer, text) to authenticated;
