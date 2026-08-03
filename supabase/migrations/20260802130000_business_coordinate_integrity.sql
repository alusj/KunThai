-- Coordinate integrity for marketplace businesses.
--
-- Background: the UrMall seller profile showed "4969 km away" for a seller the
-- buyer was standing next to. Root cause was DATA, not math: the business row's
-- saved point was Juba, South Sudan (latitude 4.8459246, longitude 31.5959173)
-- because the seller set their location from a text search of "juba" instead of
-- their real Lumley pin. Two rows share that identical geocoded point.
--
-- This migration does two things, both reversible and non-destructive to any
-- VALID coordinate:
--
-- 1. Adds a CHECK constraint so latitude/longitude can only ever be stored in
--    valid ranges (blocks out-of-range and keeps future writes honest). NULL is
--    still allowed (a business may legitimately have no pin yet).
--
-- 2. Provides a COMMENTED, opt-in cleanup for the specific invalid rows found.
--    It is intentionally NOT run automatically: review the ids first, confirm
--    they are yours/test data, then uncomment and run. Nulling the coordinates
--    makes the profile show "Distance unavailable" until the seller re-pins
--    their real location, rather than displaying a confident but false distance.
--    We do NOT guess the true coordinates.

-- 1) Range guard (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketplace_businesses_latitude_range'
  ) then
    alter table public.marketplace_businesses
      add constraint marketplace_businesses_latitude_range
      check (latitude is null or (latitude >= -90 and latitude <= 90));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'marketplace_businesses_longitude_range'
  ) then
    alter table public.marketplace_businesses
      add constraint marketplace_businesses_longitude_range
      check (longitude is null or (longitude >= -180 and longitude <= 180));
  end if;
end$$;

-- 2) OPT-IN cleanup of the identified invalid rows (Sierra Leone businesses whose
--    saved point is in South Sudan). Review, then uncomment to run.
--
--    Inspect first:
--      select id, business_name, country, address, latitude, longitude
--      from public.marketplace_businesses
--      where longitude between 24 and 36 and latitude between 3 and 13   -- South Sudan box
--        and lower(coalesce(country, '')) like 'sierra leone%';
--
--    Then, once confirmed, null just those rows so the seller re-pins:
--
--  update public.marketplace_businesses
--     set latitude = null, longitude = null, updated_at = now()
--   where id in (
--     'ac897504-ae8c-4dcd-a5b1-ebd69ade631b',  -- Alusine Sulaiman Kamara (country Sierra Leone, point Juba)
--     '22b1e53a-e16e-4edf-8836-3d5eced8483d'   -- Sierra Universal Promoters (country Sierra Leone, point Juba)
--   );
--
--    Note: business id 22ad8ccf-b26d-4328-a2d3-86d0c0d83052 ("Alus Jay") is
--    latitude 6.7568818, longitude -11.3530813 — inside Sierra Leone's box, so it
--    is NOT flagged here; if that pin is also wrong the seller should re-pin it
--    in-app rather than have a migration guess.
