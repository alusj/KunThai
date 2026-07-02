-- UrMall vertical media contracts and buyer visibility repair.

alter table if exists public.marketplace_businesses
  add column if not exists vertical_video_url text;

alter table if exists public.marketplace_restaurant_menu_items
  add column if not exists image_urls text[] not null default '{}'::text[],
  add column if not exists video_url text;

alter table if exists public.marketplace_property_listings
  add column if not exists video_url text;

-- Only retail shops use the secondary category taxonomy.
delete from public.marketplace_business_categories category
using public.marketplace_businesses business
where business.id = category.business_id
  and coalesce(business.business_kind, 'retail') <> 'retail';

-- Product RLS previously only had an owner-management policy, which meant an
-- active listing could appear to its creator but not to another signed-in user.
alter table if exists public.marketplace_businesses enable row level security;
alter table if exists public.marketplace_products enable row level security;

drop policy if exists "buyers read marketplace businesses" on public.marketplace_businesses;
create policy "buyers read marketplace businesses"
on public.marketplace_businesses for select to anon, authenticated
using (true);

drop policy if exists "buyers read active marketplace products" on public.marketplace_products;
create policy "buyers read active marketplace products"
on public.marketplace_products for select to anon, authenticated
using (coalesce(status, 'active') = 'active');

-- Verification is shown through the established UrMall trust/caution UX. It
-- must not silently make an active meal or hotel visible only to its owner.
drop policy if exists "buyers read restaurant menus" on public.marketplace_restaurant_menu_items;
create policy "buyers read restaurant menus"
on public.marketplace_restaurant_menu_items for select to anon, authenticated
using (available = true);

drop policy if exists "buyers read hotel images" on public.marketplace_hotel_images;
create policy "buyers read hotel images"
on public.marketplace_hotel_images for select to anon, authenticated
using (true);

drop policy if exists "buyers read hotel rooms" on public.marketplace_hotel_rooms;
create policy "buyers read hotel rooms"
on public.marketplace_hotel_rooms for select to anon, authenticated
using (active = true and rooms_available > 0);

drop policy if exists "buyers read property listings" on public.marketplace_property_listings;
create policy "buyers read property listings"
on public.marketplace_property_listings for select to anon, authenticated
using (
  published = true
  and authorization_status = 'verified'
  and availability_status = 'available'
  and expires_at > now()
);

-- Repair blank privacy values and keep public Explore posts readable across
-- accounts while retaining the pending-video quarantine.
update public.explore_posts
set post_privacy = 'public'
where nullif(btrim(coalesce(post_privacy, '')), '') is null;

drop policy if exists "authenticated_users_can_read_posts" on public.explore_posts;
create policy "authenticated_users_can_read_posts"
on public.explore_posts for select to authenticated
using (
  user_id = auth.uid()
  or (
    (nullif(btrim(coalesce(video_url, '')), '') is null or moderation_status in ('approved', 'legacy'))
    and (
      coalesce(nullif(btrim(post_privacy), ''), 'public') = 'public'
      or (
        coalesce(nullif(btrim(post_privacy), ''), 'public') in ('circle', 'followers')
        and exists (
          select 1 from public.explore_follows
          where follower_id = auth.uid() and following_id = explore_posts.user_id
        )
      )
    )
  )
);

grant select on public.marketplace_businesses, public.marketplace_products to anon, authenticated;
