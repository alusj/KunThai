-- Authoritative business plan capacity guards.
-- Existing rows are deliberately preserved; only a new capacity-consuming
-- action is rejected when the effective limit has already been reached.

create or replace function public.kunthai_raise_capacity_limit(
  p_surface text,
  p_resource text,
  p_current integer,
  p_limit integer,
  p_plan text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  raise exception 'KUNTHAI_PLAN_LIMIT|%|%|%|%|%',
    lower(p_surface), lower(p_resource), coalesce(p_current, 0), coalesce(p_limit, 0), lower(p_plan)
    using errcode = 'P0001',
      hint = 'Open Plans & capacity in the business dashboard to upgrade.';
end;
$$;

create or replace function public.kunthai_guard_urmall_product_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
begin
  if new.status <> 'active'
    or (tg_op = 'UPDATE' and old.status = 'active' and old.business_id is not distinct from new.business_id) then
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

drop trigger if exists kunthai_guard_urmall_product_capacity on public.marketplace_products;
create trigger kunthai_guard_urmall_product_capacity
before insert or update of status, business_id on public.marketplace_products
for each row execute function public.kunthai_guard_urmall_product_capacity();

create or replace function public.kunthai_guard_urmall_admin_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
begin
  if new.status not in ('pending', 'accepted')
    or (tg_op = 'UPDATE' and old.status in ('pending', 'accepted')
      and old.business_id is not distinct from new.business_id) then
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

drop trigger if exists kunthai_guard_urmall_admin_capacity on public.marketplace_business_admins;
create trigger kunthai_guard_urmall_admin_capacity
before insert or update of status, business_id on public.marketplace_business_admins
for each row execute function public.kunthai_guard_urmall_admin_capacity();

create or replace function public.kunthai_guard_urride_vehicle_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
begin
  if tg_op = 'UPDATE' and old.company_id is not distinct from new.company_id then
    return new;
  end if;

  select * into v_entitlement
  from public.kunthai_business_effective_entitlement('urride', new.company_id);
  if v_entitlement.vehicle_limit is null then return new; end if;

  select count(*)::integer into v_current
  from public.transport_company_fleets fleet
  where fleet.company_id = new.company_id and fleet.id is distinct from new.id;

  if v_current >= v_entitlement.vehicle_limit then
    perform public.kunthai_raise_capacity_limit(
      'urride', 'vehicles', v_current, v_entitlement.vehicle_limit, v_entitlement.plan_code
    );
  end if;
  return new;
end;
$$;

drop trigger if exists kunthai_guard_urride_vehicle_capacity on public.transport_company_fleets;
create trigger kunthai_guard_urride_vehicle_capacity
before insert or update of company_id on public.transport_company_fleets
for each row execute function public.kunthai_guard_urride_vehicle_capacity();

create or replace function public.kunthai_guard_urride_invite_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
  v_identity text;
  v_already_counted boolean;
begin
  if new.status not in ('pending', 'accepted') then return new; end if;

  v_identity := coalesce(
    new.operator_user_id::text,
    new.operator_id::text,
    nullif(lower(btrim(new.operator_public_id)), '')
  );

  if tg_op = 'UPDATE'
    and old.status in ('pending', 'accepted')
    and old.company_id is not distinct from new.company_id
    and coalesce(old.operator_user_id::text, old.operator_id::text, nullif(lower(btrim(old.operator_public_id)), ''))
      is not distinct from v_identity then
    return new;
  end if;

  select exists (
    select 1 from public.transport_company_operator_invites invite
    where invite.company_id = new.company_id
      and invite.status in ('pending', 'accepted')
      and invite.id is distinct from new.id
      and coalesce(invite.operator_user_id::text, invite.operator_id::text, nullif(lower(btrim(invite.operator_public_id)), '')) = v_identity
  ) into v_already_counted;
  if v_already_counted then return new; end if;

  select * into v_entitlement
  from public.kunthai_business_effective_entitlement('urride', new.company_id);
  if v_entitlement.operator_limit is null then return new; end if;

  v_current := coalesce((public.kunthai_business_usage('urride', new.company_id) ->> 'operators')::integer, 0);
  if v_current >= v_entitlement.operator_limit then
    perform public.kunthai_raise_capacity_limit(
      'urride', 'operators', v_current, v_entitlement.operator_limit, v_entitlement.plan_code
    );
  end if;
  return new;
end;
$$;

drop trigger if exists kunthai_guard_urride_invite_capacity on public.transport_company_operator_invites;
create trigger kunthai_guard_urride_invite_capacity
before insert or update of status, company_id, operator_user_id, operator_id, operator_public_id
on public.transport_company_operator_invites
for each row execute function public.kunthai_guard_urride_invite_capacity();

create or replace function public.kunthai_guard_urride_member_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
  v_resource text;
  v_limit integer;
begin
  if new.status not in ('pending', 'active')
    or coalesce(new.service_status, 'active') <> 'active'
    or new.role = 'owner' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status in ('pending', 'active')
    and coalesce(old.service_status, 'active') = 'active'
    and old.company_id is not distinct from new.company_id
    and old.role is not distinct from new.role then
    return new;
  end if;

  select * into v_entitlement
  from public.kunthai_business_effective_entitlement('urride', new.company_id);

  if new.role = 'operator' then
    -- Accepted invitations are already counted, so only direct operator member
    -- additions need a second guard here.
    if exists (
      select 1 from public.transport_company_operator_invites invite
      where invite.company_id = new.company_id
        and invite.status in ('pending', 'accepted')
        and coalesce(invite.operator_user_id::text, invite.operator_id::text, nullif(lower(btrim(invite.operator_public_id)), ''))
          = coalesce(new.user_id::text, new.operator_id::text, nullif(lower(btrim(new.public_id)), ''))
    ) then
      return new;
    end if;
    v_resource := 'operators';
    v_limit := v_entitlement.operator_limit;
  elsif new.role in ('admin', 'fleet_manager', 'dispatcher') then
    v_resource := 'admins';
    v_limit := v_entitlement.admin_limit;
  else
    return new;
  end if;

  if v_limit is null then return new; end if;
  v_current := coalesce((public.kunthai_business_usage('urride', new.company_id) ->> v_resource)::integer, 0);
  if v_current >= v_limit then
    perform public.kunthai_raise_capacity_limit(
      'urride', v_resource, v_current, v_limit, v_entitlement.plan_code
    );
  end if;
  return new;
end;
$$;

drop trigger if exists kunthai_guard_urride_member_capacity on public.transport_company_members;
create trigger kunthai_guard_urride_member_capacity
before insert or update of status, service_status, role, company_id
on public.transport_company_members
for each row execute function public.kunthai_guard_urride_member_capacity();

