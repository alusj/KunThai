-- Typed, per-type attributes for property listings.
-- Land listings use land_size (+ unit), commercial listings use floor_area
-- (+ unit), and residential/commercial listings use parking_spaces. Every
-- column is additive and nullable (parking defaults to 0) so existing rows and
-- current insert/update paths keep working before app code starts sending them.
alter table public.marketplace_property_listings
  add column if not exists land_size numeric(16, 2)
    check (land_size is null or land_size >= 0),
  add column if not exists land_size_unit text
    check (land_size_unit is null or land_size_unit in ('sqm', 'sqft', 'acres', 'plots', 'hectares')),
  add column if not exists floor_area numeric(16, 2)
    check (floor_area is null or floor_area >= 0),
  add column if not exists floor_area_unit text
    check (floor_area_unit is null or floor_area_unit in ('sqm', 'sqft')),
  add column if not exists parking_spaces integer not null default 0
    check (parking_spaces >= 0);
