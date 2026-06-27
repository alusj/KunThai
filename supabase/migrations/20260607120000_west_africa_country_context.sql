alter table if exists public.transport_operators
  add column if not exists country text not null default '',
  add column if not exists country_iso text not null default '',
  add column if not exists currency text not null default '';

alter table if exists public.transport_fleets
  add column if not exists country text not null default '',
  add column if not exists country_iso text not null default '',
  add column if not exists currency text not null default '';

alter table if exists public.transport_trips
  add column if not exists country text not null default '',
  add column if not exists country_iso text not null default '';

alter table if exists public.marketplace_businesses
  add column if not exists country_iso text not null default '',
  add column if not exists currency text not null default '';

alter table if exists public.marketplace_products
  add column if not exists country text not null default '',
  add column if not exists country_iso text not null default '',
  add column if not exists currency text not null default '';

alter table if exists public.marketplace_orders
  add column if not exists country text not null default '',
  add column if not exists country_iso text not null default '',
  add column if not exists currency text not null default '';

update public.transport_fleets fleet
set
  country = coalesce(nullif(fleet.country, ''), operator.country, ''),
  country_iso = coalesce(nullif(fleet.country_iso, ''), operator.country_iso, ''),
  currency = coalesce(nullif(fleet.currency, ''), operator.currency, '')
from public.transport_operators operator
where fleet.operator_id = operator.id;

update public.marketplace_products product
set
  country = coalesce(nullif(product.country, ''), business.country, ''),
  country_iso = coalesce(nullif(product.country_iso, ''), business.country_iso, ''),
  currency = coalesce(nullif(product.currency, ''), business.currency, '')
from public.marketplace_businesses business
where product.business_id = business.id;

create index if not exists transport_operators_country_iso_idx
  on public.transport_operators (country_iso);

create index if not exists transport_fleets_country_iso_idx
  on public.transport_fleets (country_iso);

create index if not exists marketplace_businesses_country_iso_idx
  on public.marketplace_businesses (country_iso);

create index if not exists marketplace_products_country_iso_idx
  on public.marketplace_products (country_iso);
