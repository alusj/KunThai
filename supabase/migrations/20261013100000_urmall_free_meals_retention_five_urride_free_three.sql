-- UrMall Free plan and UrRide Free plan changes (2026-10-13).
--
-- 1. UrMall restaurants on Free: no weekday limit. A Free restaurant still has
--    at most 5 meals (the 5 active listings of the Free plan, which count every
--    meal, shown or hidden), and each meal can be served every day or on any
--    days the owner chooses. meal_day_limit = null turns
--    kunthai_guard_urmall_meal_days off for Free, as it already is for Pro and
--    Premium.
-- 2. When a paid UrMall plan expires, 5 published listings stay visible
--    (was 10), matching the Free plan's 5 listings. The functions below are
--    the latest definitions from 20260905130000_urmall_expiry_retention.sql
--    with only that number (and the words in the owner's notices) changed.
--    A retention case already pending keeps the listings it already protects
--    until its owner saves a new choice, which is then five listings.
-- 3. UrRide Free: 3 company operators and 3 vehicles. Company rentals are
--    company fleet rows, so transport_company_counted_fleets() already counts
--    them as vehicles. As with every plan limit, existing operators and
--    vehicles above 3 are kept; only new additions are refused.
--
-- Re-runnable: every statement is idempotent.

begin;

-- 1 + 3. Plan catalogue ----------------------------------------------------------

update public.kunthai_business_plans
set meal_day_limit = null,
    features = '["5 active products, meals or properties","Restaurant meals all 7 days","Seller dashboard","Customer messages","Store analytics"]'::jsonb,
    updated_at = timezone('utc', now())
where surface = 'urmall' and plan_code = 'free';

update public.kunthai_business_plans
set operator_limit = 3,
    vehicle_limit = 3,
    features = '["3 company operators","3 registered vehicles, including rentals","Fleet workspace","Ride activity"]'::jsonb,
    updated_at = timezone('utc', now())
where surface = 'urride' and plan_code = 'free';

-- 2. Five retained listings after a paid UrMall plan expires ---------------------

create or replace function public.kunthai_start_urmall_retention(p_subscription_id uuid, p_expired_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_case public.kunthai_urmall_retention_cases%rowtype;
  v_owner uuid;
  v_name text;
  v_started_at timestamptz;
begin
  select * into v_subscription from public.kunthai_business_subscriptions
  where id = p_subscription_id for update;
  if v_subscription.surface <> 'urmall' or v_subscription.plan_code <> 'free'
    or (v_subscription.status <> 'expired' and p_expired_at is null) then return null; end if;
  select * into v_case from public.kunthai_urmall_retention_cases
  where subscription_id = p_subscription_id and status = 'pending';
  if v_case.id is not null then return v_case.id; end if;
  -- A first notice delayed beyond the hourly scheduler window receives a full
  -- fifteen days; a scheduler outage must never mean same-day notice/deletion.
  v_started_at := case when p_expired_at >= (select activated_at from public.kunthai_urmall_retention_policy where singleton)
    and p_expired_at >= now() - interval '1 hour'
    then p_expired_at else now() end;
  insert into public.kunthai_urmall_retention_cases(business_id, subscription_id, started_at, delete_after)
  values (v_subscription.marketplace_business_id, v_subscription.id, v_started_at, v_started_at + interval '15 days') returning * into v_case;
  insert into public.kunthai_urmall_retention_items(case_id, item_id, item_kind, eligible_to_keep)
  select v_case.id, id, item_kind, eligible_to_keep
  from public.kunthai_urmall_retention_inventory where business_id = v_case.business_id;
  update public.kunthai_urmall_retention_cases
  set retained_ids = array(select id from public.kunthai_urmall_retention_inventory
    where business_id = v_case.business_id and eligible_to_keep
    order by published_at desc nulls last, id limit 5)
  where id = v_case.id;
  select user_id, business_name into v_owner, v_name
  from public.marketplace_businesses where id = v_case.business_id;
  perform public.kunthai_subscription_notify(v_owner,
    'business-subscription:' || p_subscription_id || ':retention:' || v_case.id,
    format('%s is now on Free. Only five selected published products, meals or properties remain visible. Choose which five to keep in your business dashboard. Renew or upgrade by %s; otherwise the remaining listings and product drafts saved before this notice will be permanently deleted. Orders and payment history will remain.',
      coalesce(v_name, 'Your business'), to_char(v_case.delete_after, 'Mon DD, YYYY HH24:MI "UTC"')), 'high');
  return v_case.id;
end;
$$;
revoke all on function public.kunthai_start_urmall_retention(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.kunthai_urmall_inventory_is_visible(p_business_id uuid, p_item_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if public.kunthai_business_user_can_manage('urmall', p_business_id, auth.uid(), false) then return true; end if;
  select retained_ids into v_ids from public.kunthai_urmall_retention_cases
  where business_id = p_business_id and status = 'pending';
  if found then return p_item_id = any(v_ids); end if;
  -- Fail closed to the newest five if the hourly renewal job is late. A late
  -- job will still grant a full 15 days from its actual notification time.
  if exists (select 1 from public.kunthai_business_subscriptions s
    where s.surface = 'urmall' and s.marketplace_business_id = p_business_id
      and ((s.plan_code <> 'free' and s.current_period_end is not null and s.current_period_end <= now())
        or (s.plan_code = 'free' and s.status = 'expired' and not exists(
          select 1 from public.kunthai_urmall_retention_cases c where c.subscription_id = s.id)))) then
    return p_item_id in (select id from public.kunthai_urmall_retention_inventory
      where business_id = p_business_id and eligible_to_keep
      order by published_at desc nulls last, id limit 5);
  end if;
  return true;
end;
$$;
revoke all on function public.kunthai_urmall_inventory_is_visible(uuid, uuid) from public;
grant execute on function public.kunthai_urmall_inventory_is_visible(uuid, uuid) to anon, authenticated;

create or replace function public.select_urmall_retained_inventory(p_case_id uuid, p_item_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_case public.kunthai_urmall_retention_cases%rowtype; v_subscription_id uuid; v_count integer; v_required integer;
begin
  select subscription_id into v_subscription_id from public.kunthai_urmall_retention_cases where id = p_case_id;
  -- Same lock order as renewal and cleanup, so an upgrade cannot race deletion.
  perform 1 from public.kunthai_business_subscriptions where id = v_subscription_id for update;
  select * into v_case from public.kunthai_urmall_retention_cases where id = p_case_id for update;
  if v_case.id is null or not (exists(select 1 from public.marketplace_businesses where id = v_case.business_id and user_id = auth.uid())
    or exists(select 1 from public.marketplace_business_admins where business_id = v_case.business_id and user_id = auth.uid()
      and status = 'accepted' and responsibilities ->> 'addProducts' = 'true')) then
    raise exception 'Only the business owner or an admin authorized to manage products can choose retained listings.' using errcode = '42501';
  end if;
  if v_case.status <> 'pending' or now() >= v_case.delete_after then
    raise exception 'This retention selection window has ended. Refresh the business dashboard.';
  end if;
  select least(5, count(*)::integer) into v_required
  from public.kunthai_urmall_retention_items r join public.kunthai_urmall_retention_inventory i
    on i.id = r.item_id and i.item_kind = r.item_kind and i.business_id = v_case.business_id
  where r.case_id = p_case_id and r.eligible_to_keep;
  select count(distinct i.id)::integer into v_count
  from public.kunthai_urmall_retention_inventory i join public.kunthai_urmall_retention_items r
    on r.item_id = i.id and r.item_kind = i.item_kind
  where r.case_id = p_case_id and r.eligible_to_keep and i.business_id = v_case.business_id and i.id = any(p_item_ids);
  if coalesce(cardinality(p_item_ids), 0) <> v_required or v_count <> v_required then
    raise exception 'Select exactly % eligible listings from this business. Drafts cannot occupy a published listing place.', v_required;
  end if;
  update public.kunthai_urmall_retention_cases set retained_ids = p_item_ids,
    selected_by = auth.uid(), selected_at = now() where id = p_case_id;
  return public.get_urmall_expiry_retention(v_case.business_id);
end;
$$;
revoke all on function public.select_urmall_retained_inventory(uuid, uuid[]) from public, anon;
grant execute on function public.select_urmall_retained_inventory(uuid, uuid[]) to authenticated;

create or replace function public.kunthai_retain_urmall_new_free_slot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_case public.kunthai_urmall_retention_cases%rowtype; v_inventory record; v_ids uuid[];
begin
  if tg_op = 'UPDATE' and new.business_id is not distinct from old.business_id then
    if tg_table_name = 'marketplace_restaurant_menu_items' then return new; end if;
    if tg_table_name = 'marketplace_products' and to_jsonb(old) ->> 'status' not in ('draft','pending-review') then return new; end if;
    if tg_table_name = 'marketplace_property_listings' and to_jsonb(old) ->> 'published' = 'true' then return new; end if;
  end if;
  select * into v_inventory from public.kunthai_urmall_retention_inventory where id = new.id and business_id = new.business_id;
  if not coalesce(v_inventory.eligible_to_keep, false) then return new; end if;
  select * into v_case from public.kunthai_urmall_retention_cases where business_id = new.business_id and status = 'pending' for update;
  if v_case.id is null then return new; end if;
  if new.id = any(v_case.retained_ids) then return new; end if;
  v_ids := array(select i.id from public.kunthai_urmall_retention_inventory i where i.business_id = new.business_id and i.id = any(v_case.retained_ids));
  if cardinality(v_ids) >= 5 then return new; end if;
  insert into public.kunthai_urmall_retention_items(case_id,item_id,item_kind,eligible_to_keep)
  values(v_case.id,new.id,v_inventory.item_kind,true)
  on conflict(case_id,item_id) do update set eligible_to_keep=true;
  update public.kunthai_urmall_retention_cases set retained_ids=array_append(v_ids,new.id) where id=v_case.id;
  return new;
end;
$$;
revoke all on function public.kunthai_retain_urmall_new_free_slot() from public, anon, authenticated;

create or replace function public.kunthai_subscription_notify(p_user_id uuid, p_group_key text, p_message text, p_priority text default 'normal')
returns void language plpgsql security definer set search_path = public as $$
declare v_urmall boolean := false; v_message text := p_message;
begin
  select exists(select 1 from public.kunthai_business_subscriptions s where s.surface = 'urmall'
    and p_group_key like 'business-subscription:' || s.id || ':%') into v_urmall;
  if v_urmall and p_group_key not like '%:retention%' then
    v_message := replace(v_message, 'after the safety grace period', 'when the paid period ends');
    v_message := replace(v_message, 'after the renewal grace period', 'when the paid period ended');
    v_message := replace(v_message, 'Nothing will be deleted.', 'Only five selected published listings remain visible after expiry. Excess listings and existing product drafts are permanently deleted 15 days later unless you renew or upgrade.');
    v_message := replace(v_message, 'Nothing was deleted; new additions follow Free plan limits.', 'Only five selected published listings remain visible. Open your business dashboard to choose them. Renew within 15 days to keep excess listings and existing drafts.');
    v_message := replace(v_message, 'Existing resources were preserved.', 'Only five selected published listings remain visible. Renew within 15 days to prevent permanent deletion of excess listings and existing product drafts.');
    if p_group_key like '%:1:%' or p_group_key like '%:3:%' or p_group_key like '%:7:%' then
      v_message := replace(v_message, 'to avoid the grace period', 'to renew before expiry');
      if v_message not like '%permanently deleted%' then
        v_message := v_message || ' If renewal fails at expiry, only five selected published listings remain visible. Renew within the following 15 days to prevent permanent deletion of excess listings and existing product drafts.';
      end if;
    end if;
  end if;
  perform public.kunthai_subscription_notify_before_urmall_retention(p_user_id, p_group_key, v_message, p_priority);
end;
$$;
revoke all on function public.kunthai_subscription_notify(uuid, text, text, text) from public, anon, authenticated;

commit;
