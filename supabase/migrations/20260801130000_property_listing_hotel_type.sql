-- Allow "hotel" as a property listing type and add the fields a hotel building
-- listing needs (room count and star rating). Additive and safe: the check
-- constraint is widened, and the new columns are nullable / default 0.
alter table public.marketplace_property_listings
  drop constraint if exists marketplace_property_listings_property_type_check;
alter table public.marketplace_property_listings
  add constraint marketplace_property_listings_property_type_check
  check (property_type in ('house', 'apartment', 'land', 'commercial', 'hotel'));

alter table public.marketplace_property_listings
  add column if not exists rooms integer not null default 0
    check (rooms >= 0),
  add column if not exists star_rating integer
    check (star_rating is null or star_rating between 1 and 5);
