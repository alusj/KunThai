-- Make every UrMall administrator responsibility authoritative at the database
-- layer. Sensitive owner controls (payouts, verification documents, admin
-- management, and deletion) deliberately remain owner-only.

create or replace function public.has_urmall_admin_responsibility(
  target_business_id uuid,
  responsibility_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketplace_business_admins admin_row
    where admin_row.business_id = target_business_id
      and admin_row.user_id = auth.uid()
      and admin_row.status = 'accepted'
      and coalesce((admin_row.responsibilities ->> responsibility_key)::boolean, false)
  );
$$;

revoke all on function public.has_urmall_admin_responsibility(uuid, text) from public, anon;
grant execute on function public.has_urmall_admin_responsibility(uuid, text) to authenticated;

-- Public store information. Financial and verification tables are not included.
drop policy if exists "delegated admins edit marketplace business information" on public.marketplace_businesses;
create policy "delegated admins edit marketplace business information"
on public.marketplace_businesses for update to authenticated
using (public.has_urmall_admin_responsibility(id, 'editBusiness'))
with check (public.has_urmall_admin_responsibility(id, 'editBusiness'));

drop policy if exists "delegated admins manage marketplace categories" on public.marketplace_business_categories;
create policy "delegated admins manage marketplace categories"
on public.marketplace_business_categories for all to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'editBusiness'))
with check (public.has_urmall_admin_responsibility(business_id, 'editBusiness'));

drop policy if exists "delegated admins manage marketplace locations" on public.marketplace_business_locations;
create policy "delegated admins manage marketplace locations"
on public.marketplace_business_locations for all to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'editBusiness'))
with check (public.has_urmall_admin_responsibility(business_id, 'editBusiness'));

-- Retail inventory.
drop policy if exists "delegated admins read marketplace inventory" on public.marketplace_products;
create policy "delegated admins read marketplace inventory"
on public.marketplace_products for select to authenticated
using (
  public.has_urmall_admin_responsibility(business_id, 'addProducts')
  or public.has_urmall_admin_responsibility(business_id, 'dashboardAccess')
);

drop policy if exists "delegated admins add marketplace inventory" on public.marketplace_products;
create policy "delegated admins add marketplace inventory"
on public.marketplace_products for insert to authenticated
with check (public.has_urmall_admin_responsibility(business_id, 'addProducts'));

drop policy if exists "delegated admins update marketplace inventory" on public.marketplace_products;
create policy "delegated admins update marketplace inventory"
on public.marketplace_products for update to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'addProducts'))
with check (public.has_urmall_admin_responsibility(business_id, 'addProducts'));

drop policy if exists "delegated admins delete marketplace inventory" on public.marketplace_products;
create policy "delegated admins delete marketplace inventory"
on public.marketplace_products for delete to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'addProducts'));

-- Restaurant and real-estate inventory use the same add/manage responsibility.
drop policy if exists "delegated admins manage restaurant menu items" on public.marketplace_restaurant_menu_items;
create policy "delegated admins manage restaurant menu items"
on public.marketplace_restaurant_menu_items for all to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'addProducts'))
with check (public.has_urmall_admin_responsibility(business_id, 'addProducts'));

drop policy if exists "delegated admins manage hotel images" on public.marketplace_hotel_images;
create policy "delegated admins manage hotel images"
on public.marketplace_hotel_images for all to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'addProducts'))
with check (public.has_urmall_admin_responsibility(business_id, 'addProducts'));

drop policy if exists "delegated admins manage hotel rooms" on public.marketplace_hotel_rooms;
create policy "delegated admins manage hotel rooms"
on public.marketplace_hotel_rooms for all to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'addProducts'))
with check (public.has_urmall_admin_responsibility(business_id, 'addProducts'));

drop policy if exists "delegated admins manage property listings" on public.marketplace_property_listings;
create policy "delegated admins manage property listings"
on public.marketplace_property_listings for all to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'addProducts'))
with check (public.has_urmall_admin_responsibility(business_id, 'addProducts'));

-- Dashboard delegates also need the complete inventory behind seller counts,
-- including unavailable meals, inactive rooms, and unpublished properties.
drop policy if exists "delegated admins read restaurant dashboard inventory" on public.marketplace_restaurant_menu_items;
create policy "delegated admins read restaurant dashboard inventory"
on public.marketplace_restaurant_menu_items for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

drop policy if exists "delegated admins read hotel dashboard images" on public.marketplace_hotel_images;
create policy "delegated admins read hotel dashboard images"
on public.marketplace_hotel_images for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

drop policy if exists "delegated admins read hotel dashboard rooms" on public.marketplace_hotel_rooms;
create policy "delegated admins read hotel dashboard rooms"
on public.marketplace_hotel_rooms for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

drop policy if exists "delegated admins read property dashboard inventory" on public.marketplace_property_listings;
create policy "delegated admins read property dashboard inventory"
on public.marketplace_property_listings for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

-- Buyer conversations. Dashboard-only admins may see counts/history, while
-- only message delegates may send replies or mark messages as read.
drop policy if exists "delegated admins read marketplace messages" on public.marketplace_customer_messages;
create policy "delegated admins read marketplace messages"
on public.marketplace_customer_messages for select to authenticated
using (
  public.has_urmall_admin_responsibility(business_id, 'messageReplies')
  or public.has_urmall_admin_responsibility(business_id, 'dashboardAccess')
);

drop policy if exists "delegated admins reply to marketplace messages" on public.marketplace_customer_messages;
create policy "delegated admins reply to marketplace messages"
on public.marketplace_customer_messages for insert to authenticated
with check (
  public.has_urmall_admin_responsibility(business_id, 'messageReplies')
  and coalesce(sender_role, 'seller') = 'seller'
);

drop policy if exists "delegated admins update marketplace messages" on public.marketplace_customer_messages;
create policy "delegated admins update marketplace messages"
on public.marketplace_customer_messages for update to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'messageReplies'))
with check (public.has_urmall_admin_responsibility(business_id, 'messageReplies'));

-- Seller-board information stays read-only for delegated dashboard access.
drop policy if exists "delegated admins read marketplace orders" on public.marketplace_orders;
create policy "delegated admins read marketplace orders"
on public.marketplace_orders for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

drop policy if exists "delegated admins read marketplace bookings" on public.marketplace_vertical_bookings;
create policy "delegated admins read marketplace bookings"
on public.marketplace_vertical_bookings for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

drop policy if exists "delegated admins read marketplace activities" on public.marketplace_activities;
create policy "delegated admins read marketplace activities"
on public.marketplace_activities for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

drop policy if exists "delegated admins add marketplace activities" on public.marketplace_activities;
create policy "delegated admins add marketplace activities"
on public.marketplace_activities for insert to authenticated
with check (public.has_urmall_admin_responsibility(business_id, 'addProducts'));

drop policy if exists "delegated admins read marketplace promotions" on public.marketplace_promotions;
create policy "delegated admins read marketplace promotions"
on public.marketplace_promotions for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

drop policy if exists "delegated admins read marketplace reviews" on public.marketplace_reviews;
create policy "delegated admins read marketplace reviews"
on public.marketplace_reviews for select to authenticated
using (public.has_urmall_admin_responsibility(business_id, 'dashboardAccess'));

grant update on public.marketplace_businesses to authenticated;
grant select, insert, update, delete on public.marketplace_business_categories to authenticated;
grant select, insert, update, delete on public.marketplace_business_locations to authenticated;
grant select, insert, update, delete on public.marketplace_products to authenticated;
grant select, insert, update, delete on public.marketplace_restaurant_menu_items to authenticated;
grant select, insert, update, delete on public.marketplace_hotel_images to authenticated;
grant select, insert, update, delete on public.marketplace_hotel_rooms to authenticated;
grant select, insert, update, delete on public.marketplace_property_listings to authenticated;
grant select, insert, update on public.marketplace_customer_messages to authenticated;
grant select on public.marketplace_orders, public.marketplace_vertical_bookings,
  public.marketplace_promotions, public.marketplace_reviews to authenticated;
grant select, insert on public.marketplace_activities to authenticated;
