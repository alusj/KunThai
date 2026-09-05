-- UrMall Vendor / Supplier workspace.
-- Vendors reuse the established marketplace catalog, orders, messages,
-- verification, payouts, promotions, reviews, locations, and staff records.
-- Paid vendor plans are intentionally deferred, so vendor products and staff
-- are not subject to the current UrMall plan-capacity guards.

alter table public.marketplace_businesses
  drop constraint if exists marketplace_businesses_kind_check;

alter table public.marketplace_businesses
  add constraint marketplace_businesses_kind_check
  check (business_kind in ('retail', 'vendor', 'restaurant', 'hotel', 'property_agent'));

alter table public.marketplace_businesses
  add column if not exists vendor_profile jsonb not null default '{}'::jsonb;

alter table public.marketplace_businesses
  drop constraint if exists marketplace_businesses_vendor_profile_object_check;

alter table public.marketplace_businesses
  add constraint marketplace_businesses_vendor_profile_object_check
  check (jsonb_typeof(vendor_profile) = 'object');

comment on column public.marketplace_businesses.business_kind is
  'Primary UrMall workspace: retail, vendor, restaurant, hotel (legacy), or property_agent. Secondary categories remain separate.';

comment on column public.marketplace_businesses.vendor_profile is
  'Vendor-only operating defaults including supplier type, sales model, selling unit, MOQ, lead time, service areas, and quotation preference.';

create or replace function public.kunthai_guard_urmall_product_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
  v_business_kind text;
begin
  if new.status <> 'active'
    or (tg_op = 'UPDATE' and old.status = 'active' and old.business_id is not distinct from new.business_id) then
    return new;
  end if;

  select business.business_kind into v_business_kind
  from public.marketplace_businesses business
  where business.id = new.business_id;

  if coalesce(v_business_kind, 'retail') = 'vendor' then
    return new;
  end if;

  select * into v_entitlement
  from public.kunthai_business_effective_entitlement('urmall', new.business_id);

  if v_entitlement.product_limit is null then
    return new;
  end if;

  select count(*)::integer into v_current
  from public.marketplace_products product
  where product.business_id = new.business_id
    and product.status = 'active'
    and product.id is distinct from new.id;

  if v_current >= v_entitlement.product_limit then
    perform public.kunthai_raise_capacity_limit(
      'urmall', 'products', v_current, v_entitlement.product_limit, v_entitlement.plan_code
    );
  end if;
  return new;
end;
$$;

create or replace function public.kunthai_guard_urmall_admin_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
  v_business_kind text;
begin
  if new.status not in ('pending', 'accepted')
    or (tg_op = 'UPDATE' and old.status in ('pending', 'accepted')
      and old.business_id is not distinct from new.business_id) then
    return new;
  end if;

  select business.business_kind into v_business_kind
  from public.marketplace_businesses business
  where business.id = new.business_id;

  if coalesce(v_business_kind, 'retail') = 'vendor' then
    return new;
  end if;

  select * into v_entitlement
  from public.kunthai_business_effective_entitlement('urmall', new.business_id);
  if v_entitlement.admin_limit is null then return new; end if;

  select count(*)::integer into v_current
  from public.marketplace_business_admins admin_row
  where admin_row.business_id = new.business_id
    and admin_row.status in ('pending', 'accepted')
    and admin_row.id is distinct from new.id;

  if v_current >= v_entitlement.admin_limit then
    perform public.kunthai_raise_capacity_limit(
      'urmall', 'admins', v_current, v_entitlement.admin_limit, v_entitlement.plan_code
    );
  end if;
  return new;
end;
$$;
