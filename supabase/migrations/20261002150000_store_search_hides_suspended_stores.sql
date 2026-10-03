-- UrMall store search must not list stores that KunThai admins have
-- suspended (or restricted from discovery). The function is SECURITY DEFINER,
-- so the restrictive RLS from 20261002090000 does not apply to it; the filter
-- is added here. Identical to 20261001120000 apart from that one condition.
-- Requires 20261001150000_admin_operations_platform (kunthai_enforcement_blocks).

create or replace function public.search_marketplace_stores(search_query text, result_limit integer default 8)
returns table (
  id uuid,
  business_name text,
  business_kind text,
  city text,
  country text,
  logo_url text,
  verification_status text,
  public_business_id text,
  owner_name text,
  owner_match boolean,
  listing_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  needle text := lower(btrim(coalesce(search_query, '')));
  pattern text;
begin
  if length(needle) < 2 then
    return;
  end if;
  pattern := '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  with candidates as (
    select
      business.*,
      profile.display_name as profile_name,
      profile.username as profile_username,
      lower(business.business_name) like pattern as name_hit,
      lower(coalesce(business.public_business_id, '')) like pattern as code_hit,
      (lower(coalesce(profile.display_name, '')) like pattern or lower(coalesce(profile.username, '')) like pattern) as owner_hit
    from public.marketplace_businesses business
    left join public.explore_profiles profile on profile.user_id = business.user_id
    where business.discoverable_nearby = true
      and not public.kunthai_enforcement_blocks('marketplace_business', business.id, 'discovery')
  )
  select
    candidate.id,
    candidate.business_name,
    coalesce(candidate.business_kind, 'retail'),
    coalesce(candidate.city, ''),
    coalesce(candidate.country, ''),
    coalesce(candidate.logo_url, ''),
    coalesce(candidate.verification_status, 'pending'),
    coalesce(candidate.public_business_id, ''),
    case when candidate.owner_hit then coalesce(nullif(candidate.profile_name, ''), candidate.profile_username, '') else '' end,
    candidate.owner_hit and not candidate.name_hit,
    (
      (select count(*) from public.marketplace_products item
        where item.business_id = candidate.id and item.status = 'active' and item.stock > 0)
      + (select count(*) from public.marketplace_restaurant_menu_items item
        where item.business_id = candidate.id and item.available = true)
      + (select count(*) from public.marketplace_hotel_rooms item
        where item.business_id = candidate.id and item.active = true)
      + (select count(*) from public.marketplace_property_listings item
        where item.business_id = candidate.id and item.published = true
          and item.availability_status = 'available' and item.expires_at > now())
    )::integer
  from candidates candidate
  where candidate.name_hit or candidate.code_hit or candidate.owner_hit
  order by
    (lower(candidate.business_name) = needle) desc,
    (lower(candidate.business_name) like needle || '%') desc,
    candidate.name_hit desc,
    candidate.code_hit desc,
    candidate.business_name
  limit greatest(1, least(coalesce(result_limit, 8), 20));
end;
$$;
