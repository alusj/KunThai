-- UrMall product search: full-text ranking + trigram (typo/partial) indexes.
--
-- Root problem this addresses: buyer search recalled products with a plain
-- `%term%` ILIKE over a few columns and ordered results only by created_at, so
-- an exact product-name match never floated above weaker/older matches and the
-- brand/model columns were never searched. This migration gives the database a
-- weighted tsvector for relevance ranking and trigram indexes so the ILIKE
-- recall (name/brand/model/category/description/location) is index-backed and
-- typo/partial matches are cheap. The client keeps ranking the recalled set
-- (see productSearch.js); the optional RPC below is the scalable server-side
-- path callers can move to as the catalogue grows.
--
-- Security: everything here is SECURITY INVOKER and the RPC reuses the existing
-- "buyers read active marketplace products" RLS policy (status='active' AND
-- stock>0). Draft, deleted, suspended or out-of-stock products are never
-- returned to buyers.

create extension if not exists pg_trgm;

-- Weighted searchable document: name (A) > brand/model (B) > category (C) >
-- description (D). Generated + stored so it stays consistent with the row and
-- needs no trigger maintenance.
alter table public.marketplace_products
  add column if not exists search_document tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '') || ' ' || coalesce(model, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'D')
  ) stored;

create index if not exists marketplace_products_search_document_idx
  on public.marketplace_products using gin (search_document);

-- Trigram indexes make ILIKE '%term%' and similarity() (typo tolerance) fast.
create index if not exists marketplace_products_name_trgm_idx
  on public.marketplace_products using gin (name gin_trgm_ops);
create index if not exists marketplace_products_brand_trgm_idx
  on public.marketplace_products using gin (brand gin_trgm_ops);
create index if not exists marketplace_products_category_trgm_idx
  on public.marketplace_products using gin (category gin_trgm_ops);

-- Seller/store name is searched via the join below (keyed on the unique seller
-- id, business_id); this trigram index keeps that ILIKE/similarity fast.
create index if not exists marketplace_businesses_name_trgm_idx
  on public.marketplace_businesses using gin (business_name gin_trgm_ops);

-- Ranked search RPC. SECURITY INVOKER => the caller's RLS applies, so only
-- buyer-visible (active, in-stock) products are ever returned. Ranking mirrors
-- the client ladder: exact name > name prefix > full-text rank > store name >
-- popularity > recency, with a trigram similarity fallback for typos.
--
-- The LEFT JOIN on marketplace_businesses (keyed on the unique seller id,
-- business_id) makes the seller/store name searchable and returns the seller's
-- identity alongside each product. It is a LEFT JOIN so a product is never
-- dropped when its business row is hidden by RLS; in that case the seller
-- columns are simply NULL and store-name matching does not apply to it.
create or replace function public.search_marketplace_products(
  p_query text,
  p_limit integer default 40
)
returns table (
  product public.marketplace_products,
  seller_id uuid,
  seller_name text,
  seller_logo_url text
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select
      plainto_tsquery('simple', coalesce(p_query, '')) as ts,
      lower(btrim(coalesce(p_query, ''))) as raw
  )
  select
    p as product,
    p.business_id as seller_id,  -- unique seller id, always present on the product row
    b.business_name as seller_name,
    b.logo_url as seller_logo_url
  from public.marketplace_products p
  cross join q
  left join public.marketplace_businesses b on b.id = p.business_id
  where q.raw <> ''
    and (
      p.search_document @@ q.ts
      or p.name ilike '%' || q.raw || '%'
      or (coalesce(p.brand, '') || ' ' || coalesce(p.model, '')) ilike '%' || q.raw || '%'
      or coalesce(b.business_name, '') ilike '%' || q.raw || '%'
      or similarity(p.name, q.raw) > 0.3
      or similarity(coalesce(b.business_name, ''), q.raw) > 0.3
    )
  order by
    (lower(p.name) = q.raw) desc,
    (lower(p.name) like q.raw || '%') desc,
    ts_rank(p.search_document, q.ts) desc,
    -- Store-name match ranks below the product-field signals (spec priority #8).
    (coalesce(b.business_name, '') ilike '%' || q.raw || '%') desc,
    greatest(similarity(p.name, q.raw), similarity(coalesce(b.business_name, ''), q.raw)) desc,
    (p.sales + p.views) desc,
    p.created_at desc
  limit greatest(coalesce(p_limit, 40), 1);
$$;

grant execute on function public.search_marketplace_products(text, integer) to anon, authenticated;
