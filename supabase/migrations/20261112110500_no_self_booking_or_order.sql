-- Nobody books, orders from or messages themselves (2026-11-12).
--
-- UrRide: a passenger cannot book a fleet they operate or whose company they
--   own. Open and broadcast requests already skip the passenger's own
--   operator account; they now skip fleets of a company the passenger owns
--   too. Any other trip that names the passenger's own fleet is refused with
--   KT_SELF_BOOKING.
-- UrMall: the owner of a business cannot order from it, book it or message
--   it as a customer (KT_SELF_ORDER, KT_SELF_MESSAGE). Replies the business
--   sends to its customers are not affected.
--
-- Rows that already exist are untouched. Safe to run more than once.

CREATE OR REPLACE FUNCTION public.transport_open_booking_eligible_fleets(p_uid uuid, p_trip_type text, p_fleet_type text, p_country text)
 RETURNS TABLE(fleet_id uuid, operator_id uuid, operator_user_id uuid, is_active boolean, last_active_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    fleet.id,
    operator.id,
    operator.user_id,
    lower(coalesce(fleet.active_status::text, '')) = 'active',
    fleet.last_active_at
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  -- Enum columns are compared as text so '' never has to be cast to the enum.
  where lower(coalesce(fleet.fleet_type::text, '')) = p_fleet_type
    and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
    and upper(coalesce(fleet.country_iso::text, '')) = p_country
    -- The operator's trip controls decide (Accept rides / Accept deliveries
    -- on the dashboard), not the category chosen at registration.
    and (
      case when p_trip_type = 'ride'
        then coalesce(fleet.accepts_ride, lower(coalesce(fleet.service_category::text, 'transport')) in ('transport', 'both', 'ride only', 'ride and delivery'))
        else coalesce(fleet.accepts_delivery, lower(coalesce(fleet.service_category::text, '')) in ('delivery', 'both', 'delivery only', 'ride and delivery'))
      end
    )
    and operator.user_id is distinct from p_uid
    -- Nobody books themselves: a company owner's own fleets are left out too.
    and not exists (
      select 1 from public.transport_companies own_company
      where own_company.id = fleet.company_id
        and own_company.owner_user_id = p_uid
    )
    -- Admin enforcement: suspended or trip-restricted operators/companies.
    and not public.kunthai_enforcement_blocks('transport_operator', operator.id, 'trips')
    and (fleet.company_id is null or not public.kunthai_enforcement_blocks('transport_company', fleet.company_id, 'trips'))
    -- An operator already on a job cannot accept another one.
    and not exists (
      select 1
      from public.transport_trips busy
      join public.transport_fleets busy_fleet on busy_fleet.id = busy.fleet_id
      where busy_fleet.operator_id = operator.id
        and busy.status::text in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
    );
$function$;

create or replace function public.kunthai_user_owns_fleet(p_fleet uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_fleet is not null and p_user is not null and exists (
    select 1
    from public.transport_fleets fleet
    left join public.transport_operators operator on operator.id = fleet.operator_id
    left join public.transport_companies company on company.id = fleet.company_id
    where fleet.id = p_fleet
      and (operator.user_id = p_user or company.owner_user_id = p_user)
  );
$$;

revoke all on function public.kunthai_user_owns_fleet(uuid, uuid) from public, anon, authenticated;

create or replace function public.transport_trips_block_self_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.fleet_id is not distinct from old.fleet_id
     and new.passenger_id is not distinct from old.passenger_id then
    return new;
  end if;
  if public.kunthai_user_owns_fleet(new.fleet_id, new.passenger_id) then
    raise exception 'KT_SELF_BOOKING: You cannot book your own fleet.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists transport_trips_block_self_booking on public.transport_trips;
create trigger transport_trips_block_self_booking
  before insert or update of fleet_id, passenger_id on public.transport_trips
  for each row execute function public.transport_trips_block_self_booking();

create or replace function public.marketplace_block_self_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
begin
  -- Messages: only what the customer sends; the business's replies carry the
  -- customer's buyer_id too.
  if tg_table_name = 'marketplace_customer_messages'
     and lower(coalesce(v_row ->> 'sender_role', 'buyer')) <> 'buyer' then
    return new;
  end if;
  if exists (
    select 1 from public.marketplace_businesses business
    where business.id = new.business_id
      and business.user_id = new.buyer_id
  ) then
    if tg_table_name = 'marketplace_customer_messages' then
      raise exception 'KT_SELF_MESSAGE: You cannot message your own business.'
        using errcode = 'P0001';
    end if;
    raise exception 'KT_SELF_ORDER: You cannot order from your own business.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_orders_block_self_customer on public.marketplace_orders;
create trigger marketplace_orders_block_self_customer
  before insert on public.marketplace_orders
  for each row execute function public.marketplace_block_self_customer();

drop trigger if exists marketplace_vertical_bookings_block_self_customer on public.marketplace_vertical_bookings;
create trigger marketplace_vertical_bookings_block_self_customer
  before insert on public.marketplace_vertical_bookings
  for each row execute function public.marketplace_block_self_customer();

drop trigger if exists marketplace_customer_messages_block_self_customer on public.marketplace_customer_messages;
create trigger marketplace_customer_messages_block_self_customer
  before insert on public.marketplace_customer_messages
  for each row execute function public.marketplace_block_self_customer();
