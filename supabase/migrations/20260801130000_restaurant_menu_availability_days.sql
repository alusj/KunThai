-- Multi-day availability for restaurant menu items.
-- Previously each menu item belonged to a single day_of_week, forcing sellers to
-- re-add the same meal for every day it is served. This adds:
--   * available_everyday: when true, the meal shows on the buyer feed and the
--     seller day menu every day (day_of_week is then just a vestigial anchor).
--   * available_days: the specific weekdays (0=Sun .. 6=Sat) a meal is served
--     when it is NOT available every day.
-- Both columns are additive with safe defaults so existing insert/update paths
-- keep working before app code starts sending them.
alter table public.marketplace_restaurant_menu_items
  add column if not exists available_everyday boolean not null default true,
  add column if not exists available_days smallint[] not null default '{}';

-- Guard: every element of available_days must be a valid weekday 0..6.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_menu_available_days_range'
  ) then
    alter table public.marketplace_restaurant_menu_items
      add constraint restaurant_menu_available_days_range
      check (
        available_days <@ array[0,1,2,3,4,5,6]::smallint[]
      );
  end if;
end$$;

-- Backfill: existing rows were single-day, so preserve that exact behavior —
-- pin them to their current weekday and turn OFF everyday. New rows keep the
-- everyday default (true), matching the app's new "on by default" toggle.
update public.marketplace_restaurant_menu_items
set available_everyday = false,
    available_days = array[day_of_week]::smallint[]
where available_days = '{}'
  and available_everyday = true
  and created_at < now();

-- Index the common buyer/seller lookups: everyday meals, and meals containing a
-- given weekday in available_days (GIN supports the array-contains operator).
create index if not exists restaurant_menu_available_everyday_idx
  on public.marketplace_restaurant_menu_items (business_id, available_everyday, available, sort_order);

create index if not exists restaurant_menu_available_days_idx
  on public.marketplace_restaurant_menu_items using gin (available_days);
