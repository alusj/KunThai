-- Bind marketplace and transport reviews to real, acknowledged transactions.
-- Review lists remain public; review creation is verified inside the database.

alter table public.marketplace_orders
  add column if not exists seller_responded_at timestamptz;

alter table public.marketplace_reviews
  add column if not exists order_id uuid references public.marketplace_orders(id) on delete set null;

create index if not exists marketplace_orders_review_eligibility_idx
  on public.marketplace_orders (buyer_id, business_id, seller_responded_at desc)
  where seller_responded_at is not null;

create unique index if not exists marketplace_store_review_per_order_idx
  on public.marketplace_reviews (order_id)
  where order_id is not null and review_type = 'marketplace';

create unique index if not exists marketplace_product_review_per_order_idx
  on public.marketplace_reviews (order_id, product_id)
  where order_id is not null and review_type = 'product';

create or replace function public.mark_marketplace_seller_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_owns_business boolean := false;
begin
  if tg_op = 'INSERT' then
    new.seller_responded_at := null;
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select exists (
    select 1
    from public.marketplace_businesses business
    where business.id = new.business_id
      and business.user_id = auth.uid()
  ) into actor_owns_business;

  if actor_owns_business
    and new.status is distinct from old.status
    and new.status in ('shipped', 'completed', 'cancelled', 'refunded')
  then
    new.seller_responded_at := coalesce(old.seller_responded_at, now());
  else
    new.seller_responded_at := old.seller_responded_at;
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_orders_seller_response_guard on public.marketplace_orders;
create trigger marketplace_orders_seller_response_guard
before insert or update on public.marketplace_orders
for each row execute function public.mark_marketplace_seller_response();

update public.marketplace_orders
set seller_responded_at = coalesce(created_at, now())
where seller_responded_at is null
  and status in ('shipped', 'completed', 'refunded');

create or replace function public.find_marketplace_review_order(
  p_business_id uuid,
  p_product_id uuid,
  p_review_type text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select orders.id
  from public.marketplace_orders orders
  where orders.buyer_id = auth.uid()
    and orders.business_id = p_business_id
    and orders.seller_responded_at is not null
    and orders.status in ('shipped', 'completed', 'refunded')
    and (
      p_review_type = 'marketplace'
      or (p_review_type = 'product' and orders.product_id = p_product_id)
    )
    and not exists (
      select 1
      from public.marketplace_reviews review
      where review.order_id = orders.id
        and review.review_type = p_review_type
        and (p_review_type <> 'product' or review.product_id = p_product_id)
    )
  order by orders.seller_responded_at desc, orders.created_at desc
  limit 1;
$$;

revoke all on function public.find_marketplace_review_order(uuid, uuid, text) from public;

create or replace function public.get_marketplace_review_eligibility(
  p_business_id uuid,
  p_product_id uuid default null,
  p_review_type text default 'marketplace'
)
returns table (
  eligible boolean,
  order_id uuid,
  reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  qualifying_order_id uuid;
begin
  if auth.uid() is null then
    return query select false, null::uuid, 'Sign in to add a verified review.'::text;
    return;
  end if;

  if p_review_type not in ('marketplace', 'product') then
    raise exception 'Unsupported marketplace review type.';
  end if;

  qualifying_order_id := public.find_marketplace_review_order(p_business_id, p_product_id, p_review_type);

  return query
  select
    qualifying_order_id is not null,
    qualifying_order_id,
    case
      when qualifying_order_id is not null then 'Your seller-acknowledged order is ready for a review.'
      when p_review_type = 'product' then 'Order this product and wait for the seller to respond before adding a review.'
      else 'Order from this store and wait for the seller to respond before adding a review.'
    end::text;
end;
$$;

revoke all on function public.get_marketplace_review_eligibility(uuid, uuid, text) from public;
grant execute on function public.get_marketplace_review_eligibility(uuid, uuid, text) to anon, authenticated;

create or replace function public.enforce_verified_marketplace_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_order public.marketplace_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add a verified review.';
  end if;

  if new.order_id is null then
    raise exception 'A seller-acknowledged order is required to review this store or product.';
  end if;

  select orders.*
  into verified_order
  from public.marketplace_orders orders
  where orders.id = new.order_id
    and orders.buyer_id = auth.uid()
    and orders.business_id = new.business_id
    and orders.seller_responded_at is not null
    and orders.status in ('shipped', 'completed', 'refunded');

  if not found then
    raise exception 'This order is not eligible for a review.';
  end if;

  if new.review_type = 'product'
    and (new.product_id is null or verified_order.product_id is distinct from new.product_id)
  then
    raise exception 'This product was not part of the verified order.';
  end if;

  new.buyer_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists marketplace_reviews_verified_transaction_guard on public.marketplace_reviews;
create trigger marketplace_reviews_verified_transaction_guard
before insert on public.marketplace_reviews
for each row execute function public.enforce_verified_marketplace_review();

create or replace function public.submit_verified_marketplace_review(
  p_business_id uuid,
  p_rating integer,
  p_comment text default '',
  p_product_id uuid default null,
  p_product_name text default '',
  p_review_type text default 'marketplace'
)
returns public.marketplace_reviews
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  qualifying_order_id uuid;
  buyer_display_name text;
  saved_review public.marketplace_reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add a verified review.';
  end if;

  if p_review_type not in ('marketplace', 'product') then
    raise exception 'Unsupported marketplace review type.';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5.';
  end if;

  qualifying_order_id := public.find_marketplace_review_order(p_business_id, p_product_id, p_review_type);
  if qualifying_order_id is null then
    raise exception 'Order from this seller and wait for their response before adding a review.';
  end if;

  select coalesce(
    nullif(raw_user_meta_data ->> 'full_name', ''),
    nullif(raw_user_meta_data ->> 'name', ''),
    nullif(raw_user_meta_data ->> 'username', ''),
    split_part(email, '@', 1),
    'Buyer'
  )
  into buyer_display_name
  from auth.users
  where id = auth.uid();

  insert into public.marketplace_reviews (
    buyer_id,
    buyer_name,
    business_id,
    order_id,
    product_id,
    product_name,
    review_type,
    rating,
    comment
  ) values (
    auth.uid(),
    buyer_display_name,
    p_business_id,
    qualifying_order_id,
    p_product_id,
    coalesce(p_product_name, ''),
    p_review_type,
    p_rating,
    coalesce(trim(p_comment), '')
  )
  returning * into saved_review;

  return saved_review;
end;
$$;

revoke all on function public.submit_verified_marketplace_review(uuid, integer, text, uuid, text, text) from public;
grant execute on function public.submit_verified_marketplace_review(uuid, integer, text, uuid, text, text) to authenticated;

alter table public.transport_trips
  add column if not exists operator_accepted_at timestamptz;

alter table public.transport_operator_reviews
  add column if not exists passenger_id uuid references auth.users(id) on delete set null,
  add column if not exists trip_id uuid references public.transport_trips(id) on delete set null;

create index if not exists transport_trips_review_eligibility_idx
  on public.transport_trips (passenger_id, fleet_id, operator_accepted_at desc)
  where operator_accepted_at is not null;

create unique index if not exists transport_operator_review_per_trip_idx
  on public.transport_operator_reviews (trip_id)
  where trip_id is not null;

create or replace function public.mark_transport_operator_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_owns_operator boolean := false;
begin
  if tg_op = 'INSERT' then
    new.operator_accepted_at := null;
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select exists (
    select 1
    from public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    where fleet.id = new.fleet_id
      and operator.user_id = auth.uid()
  ) into actor_owns_operator;

  if actor_owns_operator
    and new.status is distinct from old.status
    and new.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
  then
    new.operator_accepted_at := coalesce(old.operator_accepted_at, now());
  else
    new.operator_accepted_at := old.operator_accepted_at;
  end if;

  return new;
end;
$$;

drop trigger if exists transport_trips_operator_acceptance_guard on public.transport_trips;
create trigger transport_trips_operator_acceptance_guard
before insert or update on public.transport_trips
for each row execute function public.mark_transport_operator_acceptance();

update public.transport_trips
set operator_accepted_at = coalesce(created_at, now())
where operator_accepted_at is null
  and status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed');

create or replace function public.find_transport_review_trip(
  p_operator_id uuid,
  p_trip_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select trip.id
  from public.transport_trips trip
  join public.transport_fleets fleet on fleet.id = trip.fleet_id
  where trip.passenger_id = auth.uid()
    and fleet.operator_id = p_operator_id
    and (p_trip_id is null or trip.id = p_trip_id)
    and trip.operator_accepted_at is not null
    and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
    and not exists (
      select 1
      from public.transport_operator_reviews review
      where review.trip_id = trip.id
    )
  order by trip.operator_accepted_at desc, trip.created_at desc
  limit 1;
$$;

revoke all on function public.find_transport_review_trip(uuid, uuid) from public;

create or replace function public.get_transport_review_eligibility(
  p_operator_id uuid,
  p_trip_id uuid default null
)
returns table (
  eligible boolean,
  trip_id uuid,
  reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  qualifying_trip_id uuid;
begin
  if auth.uid() is null then
    return query select false, null::uuid, 'Sign in to add a verified review.'::text;
    return;
  end if;

  qualifying_trip_id := public.find_transport_review_trip(p_operator_id, p_trip_id);
  return query
  select
    qualifying_trip_id is not null,
    qualifying_trip_id,
    case
      when qualifying_trip_id is not null then 'Your accepted booking is ready for a review.'
      else 'Book this operator and wait for the booking to be accepted before adding a review.'
    end::text;
end;
$$;

revoke all on function public.get_transport_review_eligibility(uuid, uuid) from public;
grant execute on function public.get_transport_review_eligibility(uuid, uuid) to anon, authenticated;

create or replace function public.enforce_verified_transport_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_trip record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add a verified review.';
  end if;

  if new.trip_id is null then
    raise exception 'An operator-accepted booking is required to review this operator.';
  end if;

  select trip.id, trip.passenger_id, fleet.operator_id
  into verified_trip
  from public.transport_trips trip
  join public.transport_fleets fleet on fleet.id = trip.fleet_id
  where trip.id = new.trip_id
    and trip.passenger_id = auth.uid()
    and fleet.operator_id = new.operator_id
    and trip.operator_accepted_at is not null
    and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed');

  if not found then
    raise exception 'This booking is not eligible for an operator review.';
  end if;

  new.passenger_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists transport_reviews_verified_trip_guard on public.transport_operator_reviews;
create trigger transport_reviews_verified_trip_guard
before insert on public.transport_operator_reviews
for each row execute function public.enforce_verified_transport_review();

create or replace function public.submit_verified_transport_review(
  p_operator_id uuid,
  p_rating integer,
  p_review_text text default '',
  p_trip_id uuid default null
)
returns public.transport_operator_reviews
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  qualifying_trip_id uuid;
  passenger_display_name text;
  saved_review public.transport_operator_reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add a verified review.';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5.';
  end if;

  qualifying_trip_id := public.find_transport_review_trip(p_operator_id, p_trip_id);
  if qualifying_trip_id is null then
    raise exception 'Book this operator and wait for acceptance before adding a review.';
  end if;

  select coalesce(
    nullif(raw_user_meta_data ->> 'full_name', ''),
    nullif(raw_user_meta_data ->> 'name', ''),
    nullif(raw_user_meta_data ->> 'username', ''),
    split_part(email, '@', 1),
    'Passenger'
  )
  into passenger_display_name
  from auth.users
  where id = auth.uid();

  insert into public.transport_operator_reviews (
    operator_id,
    passenger_id,
    trip_id,
    passenger_name,
    rating,
    review_text,
    created_at
  ) values (
    p_operator_id,
    auth.uid(),
    qualifying_trip_id,
    passenger_display_name,
    p_rating,
    coalesce(trim(p_review_text), ''),
    now()
  )
  returning * into saved_review;

  return saved_review;
end;
$$;

revoke all on function public.submit_verified_transport_review(uuid, integer, text, uuid) from public;
grant execute on function public.submit_verified_transport_review(uuid, integer, text, uuid) to authenticated;
