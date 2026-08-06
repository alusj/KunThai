-- Publish & promote + order address coordinates (applied to the live project
-- gwiqnoymozmvzhfjvysy on 2026-07-15).
--
-- promoted / promoted_at: set when a seller publishes a product with
-- "Publish & promote"; the buyer-side advert slider only shows rows where
-- promoted = true. Plain "Publish now" leaves promoted = false.
alter table public.marketplace_products
  add column if not exists promoted boolean not null default false;
alter table public.marketplace_products
  add column if not exists promoted_at timestamptz;

create index if not exists marketplace_products_promoted_idx
  on public.marketplace_products (promoted, promoted_at desc)
  where promoted = true;

-- delivery_latitude / delivery_longitude: stamped by buyer checkout when the
-- delivery address was picked via "Locate me" / "Drop a pin", so sellers can
-- open the order address in Area View.
alter table public.marketplace_orders
  add column if not exists delivery_latitude double precision;
alter table public.marketplace_orders
  add column if not exists delivery_longitude double precision;
