-- Generalize marketplace promotions so restaurant meals and property listings
-- can be boosted into the same "Sponsored" slider as retail products, using the
-- same Visibility Credits wallet. Previously marketplace_promotions only
-- referenced marketplace_products, so verticals could not be promoted.

-- 1. Promotions can now point at a meal or a property (product_id already exists).
alter table if exists public.marketplace_promotions
  add column if not exists listing_type text not null default 'product',
  add column if not exists meal_id uuid references public.marketplace_restaurant_menu_items(id) on delete set null,
  add column if not exists property_id uuid references public.marketplace_property_listings(id) on delete set null;

-- 2. Vertical listings carry the same "promoted" flags as products.
alter table if exists public.marketplace_restaurant_menu_items
  add column if not exists promoted boolean not null default false,
  add column if not exists promoted_at timestamptz;

alter table if exists public.marketplace_property_listings
  add column if not exists promoted boolean not null default false,
  add column if not exists promoted_at timestamptz;

-- 3. Buyers may read any active promotion that points at a real listing.
drop policy if exists "Buyers read active marketplace promotions" on public.marketplace_promotions;
create policy "Buyers read active marketplace promotions"
on public.marketplace_promotions for select to anon, authenticated
using (
  status = 'active'
  and (product_id is not null or meal_id is not null or property_id is not null)
  and (ends_at is null or ends_at > timezone('utc', now()))
);

-- 4. One RPC that boosts a product, meal, or property from the seller's business.
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
  v_business public.marketplace_businesses;
  v_promotion public.marketplace_promotions;
  v_meal public.marketplace_restaurant_menu_items;
  v_property public.marketplace_property_listings;
  v_product public.marketplace_products;
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

  select * into v_business
  from public.marketplace_businesses
  where user_id = auth.uid()
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if v_business.id is null then
    raise exception 'Register a business before promoting listings.';
  end if;

  if v_listing_type = 'meal' then
    select * into v_meal from public.marketplace_restaurant_menu_items
    where id = p_listing_id and business_id = v_business.id;
    if v_meal.id is null then
      raise exception 'Choose a meal from your business before promoting.';
    end if;
    v_name := v_meal.name;
  elsif v_listing_type = 'property' then
    select * into v_property from public.marketplace_property_listings
    where id = p_listing_id and business_id = v_business.id;
    if v_property.id is null then
      raise exception 'Choose a property from your business before promoting.';
    end if;
    v_name := v_property.title;
  else
    select * into v_product from public.marketplace_products
    where id = p_listing_id and business_id = v_business.id;
    if v_product.id is null then
      raise exception 'Choose a product from your business before promoting.';
    end if;
    v_name := v_product.name;
  end if;

  v_duration_days := greatest(1, least(30, ceiling(v_credit_budget::numeric / 5)::integer * 3));

  insert into public.marketplace_promotions (
    business_id, product_id, meal_id, property_id, listing_type,
    name, product_name, discount_label,
    budget_spent, budget_limit, credit_budget, credits_spent,
    views, orders, revenue, status, starts_at, ends_at, metadata
  ) values (
    v_business.id,
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
    where id = p_listing_id and business_id = v_business.id;
  elsif v_listing_type = 'property' then
    update public.marketplace_property_listings
    set promoted = true,
        promoted_at = coalesce(promoted_at, timezone('utc', now())),
        published = true,
        updated_at = timezone('utc', now())
    where id = p_listing_id and business_id = v_business.id;
  else
    update public.marketplace_products
    set promoted = true,
        promoted_at = coalesce(promoted_at, timezone('utc', now())),
        status = case when status = 'draft' then 'active' else status end,
        updated_at = timezone('utc', now())
    where id = p_listing_id and business_id = v_business.id;
  end if;

  return v_promotion;
end;
$$;

grant execute on function public.create_marketplace_listing_promotion(text, uuid, integer, text) to authenticated;
