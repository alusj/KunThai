-- Review integrity for UrRide (operators, rentals) and UrMall (stores, products).
--
-- Rules, enforced here in the database so no client can bypass them:
--   * Only a COMPLETED transaction can be reviewed: a completed trip, a
--     completed or refunded order, a completed rental. (UrRide used to allow
--     a review as soon as a booking was accepted, before the trip happened.)
--   * One review per transaction, within 30 days of completion.
--   * The author may edit that review ONCE, within 7 days of posting it.
--     After that it is locked until another transaction completes.
--   * Nobody can review themselves (operator's own fleet, owner's own store).
--   * Operators and store owners can reply to reviews but can never change a
--     rating or comment; store owners can no longer delete reviews.
--
-- The existing submit functions keep their signatures: submitting creates a
-- review for a new completed transaction, or otherwise makes the one allowed
-- edit to the latest review. Eligibility checks say which.

-- ---------------------------------------------------------------------------
-- Completion times (the 30-day window counts from these)
-- ---------------------------------------------------------------------------

alter table public.transport_trips add column if not exists completed_at timestamptz;
alter table public.marketplace_orders add column if not exists completed_at timestamptz;
alter table public.transport_rental_reservations add column if not exists completed_at timestamptz;

update public.transport_trips
set completed_at = coalesce(updated_at, created_at)
where completed_at is null and status::text = 'completed';

update public.marketplace_orders
set completed_at = coalesce(updated_at, created_at)
where completed_at is null and status in ('completed', 'refunded');

update public.transport_rental_reservations
set completed_at = coalesce(updated_at, created_at)
where completed_at is null and status = 'completed';

create or replace function public.stamp_transport_trip_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status::text = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists transport_trips_completed_at on public.transport_trips;
create trigger transport_trips_completed_at
before insert or update of status on public.transport_trips
for each row execute function public.stamp_transport_trip_completed_at();

create or replace function public.stamp_marketplace_order_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('completed', 'refunded') and new.completed_at is null then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_orders_completed_at on public.marketplace_orders;
create trigger marketplace_orders_completed_at
before insert or update of status on public.marketplace_orders
for each row execute function public.stamp_marketplace_order_completed_at();

create or replace function public.stamp_rental_reservation_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists transport_rental_reservations_completed_at on public.transport_rental_reservations;
create trigger transport_rental_reservations_completed_at
before insert or update of status on public.transport_rental_reservations
for each row execute function public.stamp_rental_reservation_completed_at();

-- ---------------------------------------------------------------------------
-- Edit tracking
-- ---------------------------------------------------------------------------

alter table public.transport_operator_reviews
  add column if not exists edit_count integer not null default 0,
  add column if not exists edited_at timestamptz;

alter table public.marketplace_reviews
  add column if not exists edit_count integer not null default 0,
  add column if not exists edited_at timestamptz;

alter table public.transport_rental_reviews
  add column if not exists reservation_id uuid references public.transport_rental_reservations(id) on delete set null,
  add column if not exists edit_count integer not null default 0,
  add column if not exists edited_at timestamptz;

-- Existing rental reviews belong to the renter's latest completed reservation.
update public.transport_rental_reviews review
set reservation_id = (
  select reservation.id
  from public.transport_rental_reservations reservation
  where reservation.rental_id = review.rental_id
    and reservation.customer_user_id = review.customer_user_id
    and reservation.status = 'completed'
  order by reservation.ends_at desc
  limit 1
)
where review.reservation_id is null;

-- One review per completed reservation (was: one per renter per vehicle,
-- editable without limit).
alter table public.transport_rental_reviews
  drop constraint if exists transport_rental_reviews_rental_id_customer_user_id_key;
create unique index if not exists transport_rental_review_per_reservation_idx
  on public.transport_rental_reviews (reservation_id)
  where reservation_id is not null;

-- Rating and comment change only through the edit path below, which sets
-- this transaction-local flag. Identity columns never change. Replies
-- (response columns) stay open to whoever the row policies allow.
create or replace function public.review_edit_in_progress()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('kunthai.review_edit', true), '') = 'on';
$$;

-- ---------------------------------------------------------------------------
-- UrRide operator reviews
-- ---------------------------------------------------------------------------

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
  join public.transport_operators operator on operator.id = fleet.operator_id
  where trip.passenger_id = auth.uid()
    and fleet.operator_id = p_operator_id
    and operator.user_id is distinct from auth.uid()
    and (p_trip_id is null or trip.id = p_trip_id)
    and trip.status::text = 'completed'
    and coalesce(trip.completed_at, trip.updated_at) > now() - interval '30 days'
    and not exists (
      select 1
      from public.transport_operator_reviews review
      where review.trip_id = trip.id
    )
  order by coalesce(trip.completed_at, trip.updated_at) desc
  limit 1;
$$;

revoke all on function public.find_transport_review_trip(uuid, uuid) from public;

create or replace function public.find_editable_transport_review(p_operator_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select review.id
  from public.transport_operator_reviews review
  where review.passenger_id = auth.uid()
    and review.operator_id = p_operator_id
    and review.edit_count = 0
    and review.created_at > now() - interval '7 days'
  order by review.created_at desc
  limit 1;
$$;

revoke all on function public.find_editable_transport_review(uuid) from public;

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
  editable_review_id uuid;
  editable_trip_id uuid;
begin
  if auth.uid() is null then
    return query select false, null::uuid, 'Sign in to add a verified review.'::text;
    return;
  end if;

  qualifying_trip_id := public.find_transport_review_trip(p_operator_id, p_trip_id);
  if qualifying_trip_id is not null then
    return query select true, qualifying_trip_id, 'Your completed trip is ready for a review.'::text;
    return;
  end if;

  editable_review_id := public.find_editable_transport_review(p_operator_id);
  if editable_review_id is not null then
    select review.trip_id into editable_trip_id from public.transport_operator_reviews review where review.id = editable_review_id;
    return query select true, editable_trip_id, 'You can edit your review once, within 7 days of posting it.'::text;
    return;
  end if;

  return query select false, null::uuid,
    'Complete a trip with this operator to add a review. Each completed trip allows one review, which you can edit once.'::text;
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
    raise exception 'A completed trip is required to review this operator.';
  end if;

  select trip.id
  into verified_trip
  from public.transport_trips trip
  join public.transport_fleets fleet on fleet.id = trip.fleet_id
  join public.transport_operators operator on operator.id = fleet.operator_id
  where trip.id = new.trip_id
    and trip.passenger_id = auth.uid()
    and fleet.operator_id = new.operator_id
    and operator.user_id is distinct from auth.uid()
    and trip.status::text = 'completed'
    and coalesce(trip.completed_at, trip.updated_at) > now() - interval '30 days';

  if not found then
    raise exception 'Only a trip completed in the last 30 days can be reviewed.';
  end if;

  new.passenger_id := auth.uid();
  new.edit_count := 0;
  new.edited_at := null;
  return new;
end;
$$;

create or replace function public.guard_transport_review_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service role (no signed-in user) is platform moderation.
  if auth.uid() is null then
    return new;
  end if;

  if new.operator_id is distinct from old.operator_id
    or new.fleet_id is distinct from old.fleet_id
    or new.trip_id is distinct from old.trip_id
    or new.passenger_id is distinct from old.passenger_id
    or new.passenger_name is distinct from old.passenger_name
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Review details cannot be changed.';
  end if;

  if (new.rating, new.review_text, new.edit_count, new.edited_at)
    is distinct from (old.rating, old.review_text, old.edit_count, old.edited_at)
    and not public.review_edit_in_progress()
  then
    raise exception 'Only the reviewer can change a review, once, within 7 days.';
  end if;

  return new;
end;
$$;

drop trigger if exists transport_reviews_update_guard on public.transport_operator_reviews;
create trigger transport_reviews_update_guard
before update on public.transport_operator_reviews
for each row execute function public.guard_transport_review_update();

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
  editable_review_id uuid;
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
    -- No new completed trip: this is the one allowed edit, if still open.
    editable_review_id := public.find_editable_transport_review(p_operator_id);
    if editable_review_id is null then
      raise exception 'Complete a trip with this operator to add a review. Each completed trip allows one review, which you can edit once.';
    end if;

    perform set_config('kunthai.review_edit', 'on', true);
    update public.transport_operator_reviews
    set rating = p_rating,
        review_text = coalesce(trim(p_review_text), ''),
        edit_count = edit_count + 1,
        edited_at = now()
    where id = editable_review_id
    returning * into saved_review;
    perform set_config('kunthai.review_edit', '', true);
    return saved_review;
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

-- ---------------------------------------------------------------------------
-- UrMall store and product reviews
-- ---------------------------------------------------------------------------

-- Owners could insert, change or delete any review of their own store. They
-- keep read access and may update (the guard below allows replies only).
drop policy if exists "business owners manage reviews" on public.marketplace_reviews;
drop policy if exists "business owners read reviews" on public.marketplace_reviews;
create policy "business owners read reviews" on public.marketplace_reviews
  for select using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));
drop policy if exists "business owners reply to reviews" on public.marketplace_reviews;
create policy "business owners reply to reviews" on public.marketplace_reviews
  for update using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

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
  join public.marketplace_businesses business on business.id = orders.business_id
  where orders.buyer_id = auth.uid()
    and orders.business_id = p_business_id
    and business.user_id is distinct from auth.uid()
    and orders.seller_responded_at is not null
    and orders.status in ('completed', 'refunded')
    and coalesce(orders.completed_at, orders.updated_at, orders.created_at) > now() - interval '30 days'
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
  order by coalesce(orders.completed_at, orders.updated_at, orders.created_at) desc
  limit 1;
$$;

revoke all on function public.find_marketplace_review_order(uuid, uuid, text) from public;

create or replace function public.find_editable_marketplace_review(
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
  select review.id
  from public.marketplace_reviews review
  where review.buyer_id = auth.uid()
    and review.business_id = p_business_id
    and review.review_type = p_review_type
    and (p_review_type <> 'product' or review.product_id = p_product_id)
    and review.edit_count = 0
    and review.created_at > now() - interval '7 days'
  order by review.created_at desc
  limit 1;
$$;

revoke all on function public.find_editable_marketplace_review(uuid, uuid, text) from public;

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
  editable_review_id uuid;
  editable_order_id uuid;
begin
  if auth.uid() is null then
    return query select false, null::uuid, 'Sign in to add a verified review.'::text;
    return;
  end if;

  if p_review_type not in ('marketplace', 'product') then
    raise exception 'Unsupported marketplace review type.';
  end if;

  qualifying_order_id := public.find_marketplace_review_order(p_business_id, p_product_id, p_review_type);
  if qualifying_order_id is not null then
    return query select true, qualifying_order_id, 'Your completed order is ready for a review.'::text;
    return;
  end if;

  editable_review_id := public.find_editable_marketplace_review(p_business_id, p_product_id, p_review_type);
  if editable_review_id is not null then
    select review.order_id into editable_order_id from public.marketplace_reviews review where review.id = editable_review_id;
    return query select true, editable_order_id, 'You can edit your review once, within 7 days of posting it.'::text;
    return;
  end if;

  return query select false, null::uuid,
    case
      when p_review_type = 'product' then 'Complete an order for this product to add a review. Each completed order allows one review, which you can edit once.'
      else 'Complete an order with this store to add a review. Each completed order allows one review, which you can edit once.'
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
    raise exception 'A completed order is required to review this store or product.';
  end if;

  select orders.*
  into verified_order
  from public.marketplace_orders orders
  join public.marketplace_businesses business on business.id = orders.business_id
  where orders.id = new.order_id
    and orders.buyer_id = auth.uid()
    and orders.business_id = new.business_id
    and business.user_id is distinct from auth.uid()
    and orders.seller_responded_at is not null
    and orders.status in ('completed', 'refunded')
    and coalesce(orders.completed_at, orders.updated_at, orders.created_at) > now() - interval '30 days';

  if not found then
    raise exception 'Only an order completed in the last 30 days can be reviewed.';
  end if;

  if new.review_type = 'product'
    and (new.product_id is null or verified_order.product_id is distinct from new.product_id)
  then
    raise exception 'This product was not part of the verified order.';
  end if;

  new.buyer_id := auth.uid();
  new.edit_count := 0;
  new.edited_at := null;
  return new;
end;
$$;

create or replace function public.guard_marketplace_review_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.business_id is distinct from old.business_id
    or new.order_id is distinct from old.order_id
    or new.product_id is distinct from old.product_id
    or new.buyer_id is distinct from old.buyer_id
    or new.buyer_name is distinct from old.buyer_name
    or new.review_type is distinct from old.review_type
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Review details cannot be changed.';
  end if;

  if (new.rating, new.comment, new.product_name, new.edit_count, new.edited_at)
    is distinct from (old.rating, old.comment, old.product_name, old.edit_count, old.edited_at)
    and not public.review_edit_in_progress()
  then
    raise exception 'Only the reviewer can change a review, once, within 7 days.';
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_reviews_update_guard on public.marketplace_reviews;
create trigger marketplace_reviews_update_guard
before update on public.marketplace_reviews
for each row execute function public.guard_marketplace_review_update();

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
  editable_review_id uuid;
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
    editable_review_id := public.find_editable_marketplace_review(p_business_id, p_product_id, p_review_type);
    if editable_review_id is null then
      raise exception 'Complete an order with this store to add a review. Each completed order allows one review, which you can edit once.';
    end if;

    perform set_config('kunthai.review_edit', 'on', true);
    update public.marketplace_reviews
    set rating = p_rating,
        comment = coalesce(trim(p_comment), ''),
        edit_count = edit_count + 1,
        edited_at = now()
    where id = editable_review_id
    returning * into saved_review;
    perform set_config('kunthai.review_edit', '', true);
    return saved_review;
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

-- ---------------------------------------------------------------------------
-- UrRide rental reviews (same rules, per completed reservation)
-- ---------------------------------------------------------------------------

create or replace function public.save_transport_rental_review(p_rental_id uuid, p_rating integer, p_body text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r public.transport_company_rentals;
  recipient uuid;
  qualifying_reservation_id uuid;
  editable_review_id uuid;
begin
  select * into r from public.transport_company_rentals where id = p_rental_id;
  if auth.uid() is null or r.id is null or public.can_manage_transport_rentals(r.company_id) then
    raise exception 'Complete a rental before reviewing this vehicle.';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5.';
  end if;

  select reservation.id into qualifying_reservation_id
  from public.transport_rental_reservations reservation
  where reservation.rental_id = p_rental_id
    and reservation.customer_user_id = auth.uid()
    and reservation.status = 'completed'
    and coalesce(reservation.completed_at, reservation.updated_at) > now() - interval '30 days'
    and not exists (select 1 from public.transport_rental_reviews review where review.reservation_id = reservation.id)
  order by coalesce(reservation.completed_at, reservation.updated_at) desc
  limit 1;

  if qualifying_reservation_id is null then
    select review.id into editable_review_id
    from public.transport_rental_reviews review
    where review.rental_id = p_rental_id
      and review.customer_user_id = auth.uid()
      and review.edit_count = 0
      and review.created_at > now() - interval '7 days'
    order by review.created_at desc
    limit 1;

    if editable_review_id is null then
      raise exception 'Complete a rental to add a review. Each completed rental allows one review, which you can edit once.';
    end if;

    update public.transport_rental_reviews
    set rating = p_rating, body = btrim(p_body), edit_count = edit_count + 1, edited_at = now()
    where id = editable_review_id;
    return;
  end if;

  insert into public.transport_rental_reviews (rental_id, reservation_id, customer_user_id, rating, body)
  values (p_rental_id, qualifying_reservation_id, auth.uid(), p_rating, btrim(p_body));

  for recipient in
    select owner_user_id from public.transport_companies where id = r.company_id
    union
    select user_id from public.transport_company_members
    where company_id = r.company_id and role = 'admin' and status = 'active' and coalesce(service_status, 'active') = 'active'
  loop
    insert into public.platform_notifications(user_id, sector, notification_type, title, body, priority, status, category, workspace, workspace_id, action_target, action_data, channels, presentation)
    values (recipient, 'transport', 'urride_rental_review', 'Rental review', r.title || ' received a renter review.', 'normal', 'unread', 'transport', 'transport', r.company_id, 'urride:rental:' || r.id, jsonb_build_object('rentalId', r.id), array['in_app', 'push']::text[], 'floating');
  end loop;
end;
$$;

revoke all on function public.save_transport_rental_review(uuid, integer, text) from public, anon;
grant execute on function public.save_transport_rental_review(uuid, integer, text) to authenticated;
