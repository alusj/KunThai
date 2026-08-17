-- Organic view tracking for vertical listings (restaurant meals, property
-- listings, hotel rooms) so their seller Insights can show real reach the same
-- way retail products do via marketplace_products.views. Before this, these
-- tables had no analytics columns at all, so vertical Insights could only ever
-- show promotion metrics.

alter table public.marketplace_restaurant_menu_items
  add column if not exists views integer not null default 0 check (views >= 0);
alter table public.marketplace_property_listings
  add column if not exists views integer not null default 0 check (views >= 0);
alter table public.marketplace_hotel_rooms
  add column if not exists views integer not null default 0 check (views >= 0);

-- One increment entry point for every vertical listing type, mirroring
-- public.increment_marketplace_product_view. Only counts a view when the
-- listing is live (available / published / active), so paused listings do not
-- accrue inflated numbers.
create or replace function public.increment_marketplace_listing_view(p_listing_type text, p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(coalesce(nullif(btrim(p_listing_type), ''), ''));
begin
  if p_listing_id is null then
    return;
  end if;

  if v_type = 'meal' then
    update public.marketplace_restaurant_menu_items
    set views = views + 1, updated_at = now()
    where id = p_listing_id and available = true;
  elsif v_type = 'property' then
    update public.marketplace_property_listings
    set views = views + 1, updated_at = now()
    where id = p_listing_id and published = true;
  elsif v_type = 'room' then
    update public.marketplace_hotel_rooms
    set views = views + 1, updated_at = now()
    where id = p_listing_id and active = true;
  end if;
end;
$$;

grant execute on function public.increment_marketplace_listing_view(text, uuid) to authenticated, anon;
