-- UrMall only: when a paid period expires, keep ten published
-- listings public and give managers 15 full days to renew or choose those ten.
-- Applying this migration schedules FUTURE cleanup; it does not run a cleanup.
-- Saved orders, receipts, messages, reviews and subscription history survive.
begin;

create table if not exists public.kunthai_urmall_retention_policy (
  singleton boolean primary key default true check (singleton),
  activated_at timestamptz not null default now()
);
insert into public.kunthai_urmall_retention_policy(singleton) values(true) on conflict do nothing;
revoke all on public.kunthai_urmall_retention_policy from public, anon, authenticated;

create table if not exists public.kunthai_urmall_retention_cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  subscription_id uuid not null references public.kunthai_business_subscriptions(id),
  started_at timestamptz not null default now(),
  delete_after timestamptz not null default (now() + interval '15 days'),
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'completed')),
  retained_ids uuid[] not null default '{}',
  selected_by uuid,
  selected_at timestamptz,
  completed_at timestamptz,
  deleted_count integer not null default 0,
  check (cardinality(retained_ids) <= 10),
  check (delete_after >= started_at + interval '15 days')
);
create unique index if not exists kunthai_urmall_one_pending_retention
  on public.kunthai_urmall_retention_cases(business_id) where status = 'pending';
create index if not exists kunthai_urmall_retention_due
  on public.kunthai_urmall_retention_cases(delete_after) where status = 'pending';

-- Only inventory present when the notice was issued is eligible for deletion.
-- IDs are a snapshot: editing a timestamp cannot restart the deadline, change
-- the protected ten, or bring a different business's items into the cleanup.
create table if not exists public.kunthai_urmall_retention_items (
  case_id uuid not null references public.kunthai_urmall_retention_cases(id) on delete cascade,
  item_id uuid not null,
  item_kind text not null check (item_kind in ('product', 'meal', 'property')),
  eligible_to_keep boolean not null,
  primary key (case_id, item_id)
);
alter table public.kunthai_urmall_retention_cases enable row level security;
alter table public.kunthai_urmall_retention_items enable row level security;
revoke all on public.kunthai_urmall_retention_cases, public.kunthai_urmall_retention_items from public, anon, authenticated;

create or replace view public.kunthai_urmall_retention_inventory as
  select id, business_id, 'product'::text as item_kind, name as title,
    main_image_url as image_url, status not in ('draft', 'pending-review') as eligible_to_keep,
    coalesce(published_at, created_at) as published_at
  from public.marketplace_products
  union all
  select id, business_id, 'meal', name, image_url, true, created_at
  from public.marketplace_restaurant_menu_items
  union all
  select id, business_id, 'property', title, image_urls[1], published, created_at
  from public.marketplace_property_listings;
revoke all on public.kunthai_urmall_retention_inventory from public, anon, authenticated;

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
    order by published_at desc nulls last, id limit 10)
  where id = v_case.id;
  select user_id, business_name into v_owner, v_name
  from public.marketplace_businesses where id = v_case.business_id;
  perform public.kunthai_subscription_notify(v_owner,
    'business-subscription:' || p_subscription_id || ':retention:' || v_case.id,
    format('%s is now on Free. Only ten selected published products, meals or properties remain visible. Choose which ten to keep in your business dashboard. Renew or upgrade by %s; otherwise the remaining listings and product drafts saved before this notice will be permanently deleted. Orders and payment history will remain.',
      coalesce(v_name, 'Your business'), to_char(v_case.delete_after, 'Mon DD, YYYY HH24:MI "UTC"')), 'high');
  return v_case.id;
end;
$$;
revoke all on function public.kunthai_start_urmall_retention(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.kunthai_urmall_retention_subscription_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.surface <> 'urmall' then return new; end if;
  if new.plan_code <> 'free' and new.status = 'active'
    and (new.current_period_end is null or new.current_period_end > now()) then
    update public.kunthai_urmall_retention_cases set status = 'cancelled', completed_at = now()
    where subscription_id = new.id and status = 'pending';
  elsif old.plan_code <> 'free' and new.plan_code = 'free'
    and (new.status = 'expired' or old.current_period_end <= now()) then
    perform public.kunthai_start_urmall_retention(new.id, old.current_period_end);
  end if;
  return new;
end;
$$;
revoke all on function public.kunthai_urmall_retention_subscription_changed() from public, anon, authenticated;
drop trigger if exists kunthai_urmall_retention_subscription_changed on public.kunthai_business_subscriptions;
create trigger kunthai_urmall_retention_subscription_changed after update
  on public.kunthai_business_subscriptions for each row
  execute function public.kunthai_urmall_retention_subscription_changed();

-- RESTRICTIVE policies compose with existing publication, verification and
-- ownership policies. They cannot make a previously private item public.
create or replace function public.kunthai_urmall_inventory_is_visible(p_business_id uuid, p_item_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if public.kunthai_business_user_can_manage('urmall', p_business_id, auth.uid(), false) then return true; end if;
  select retained_ids into v_ids from public.kunthai_urmall_retention_cases
  where business_id = p_business_id and status = 'pending';
  if found then return p_item_id = any(v_ids); end if;
  -- Fail closed to the newest ten if the hourly renewal job is late. A late
  -- job will still grant a full 15 days from its actual notification time.
  if exists (select 1 from public.kunthai_business_subscriptions s
    where s.surface = 'urmall' and s.marketplace_business_id = p_business_id
      and ((s.plan_code <> 'free' and s.current_period_end is not null and s.current_period_end <= now())
        or (s.plan_code = 'free' and s.status = 'expired' and not exists(
          select 1 from public.kunthai_urmall_retention_cases c where c.subscription_id = s.id)))) then
    return p_item_id in (select id from public.kunthai_urmall_retention_inventory
      where business_id = p_business_id and eligible_to_keep
      order by published_at desc nulls last, id limit 10);
  end if;
  return true;
end;
$$;
revoke all on function public.kunthai_urmall_inventory_is_visible(uuid, uuid) from public;
grant execute on function public.kunthai_urmall_inventory_is_visible(uuid, uuid) to anon, authenticated;
do $$ declare v_table text; begin
  foreach v_table in array array['marketplace_products', 'marketplace_restaurant_menu_items', 'marketplace_property_listings'] loop
    execute format('drop policy if exists "UrMall expired plan public inventory" on public.%I', v_table);
    execute format('create policy "UrMall expired plan public inventory" on public.%I as restrictive for select to anon, authenticated using (public.kunthai_urmall_inventory_is_visible(business_id, id))', v_table);
  end loop;
end $$;

create or replace function public.get_urmall_expiry_retention(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_case public.kunthai_urmall_retention_cases%rowtype; v_items jsonb; v_can_select boolean; v_subscription_id uuid;
begin
  if not public.kunthai_business_user_can_manage('urmall', p_business_id, auth.uid(), false) then
    raise exception 'Only the business owner or an accepted business admin can manage retained listings.' using errcode = '42501';
  end if;
  -- The manager's dashboard also synchronizes an overdue subscription so it
  -- need not wait for the next hourly worker to display the selection notice.
  select id into v_subscription_id from public.kunthai_business_subscriptions
  where surface = 'urmall' and marketplace_business_id = p_business_id;
  if v_subscription_id is not null then
    perform public.kunthai_renew_subscription_row(v_subscription_id);
    if not exists(select 1 from public.kunthai_urmall_retention_cases where subscription_id = v_subscription_id) then
      perform public.kunthai_start_urmall_retention(v_subscription_id);
    end if;
  end if;
  select * into v_case from public.kunthai_urmall_retention_cases
  where business_id = p_business_id order by started_at desc, id desc limit 1;
  v_can_select := exists(select 1 from public.marketplace_businesses where id = p_business_id and user_id = auth.uid())
    or exists(select 1 from public.marketplace_business_admins where business_id = p_business_id and user_id = auth.uid()
      and status = 'accepted' and responsibilities ->> 'addProducts' = 'true');
  if v_case.id is null then return jsonb_build_object('available', true, 'case', null, 'items', '[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.item_kind,
    'title', i.title, 'imageUrl', i.image_url, 'eligibleToKeep', r.eligible_to_keep,
    'retained', i.id = any(v_case.retained_ids)) order by i.published_at desc nulls last, i.id), '[]'::jsonb)
  into v_items from public.kunthai_urmall_retention_inventory i
  join public.kunthai_urmall_retention_items r on r.item_id = i.id and r.item_kind = i.item_kind
  where r.case_id = v_case.id and i.business_id = p_business_id and v_can_select;
  return jsonb_build_object('available', true, 'case', to_jsonb(v_case), 'items', v_items, 'can_select', v_can_select,
    'pending_delete_count', (select count(*) from public.kunthai_urmall_retention_inventory i
      join public.kunthai_urmall_retention_items r on r.item_id = i.id and r.item_kind = i.item_kind
      where r.case_id = v_case.id and i.business_id = p_business_id and not(i.id = any(v_case.retained_ids))));
end;
$$;
revoke all on function public.get_urmall_expiry_retention(uuid) from public, anon;
grant execute on function public.get_urmall_expiry_retention(uuid) to authenticated;

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
  select least(10, count(*)::integer) into v_required
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

create or replace function public.process_urmall_expiry_retention()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_row record; v_case public.kunthai_urmall_retention_cases%rowtype;
  v_subscription public.kunthai_business_subscriptions%rowtype;
  v_table text; v_kind text; v_deleted integer; v_total integer; v_processed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  for v_row in select id, subscription_id from public.kunthai_urmall_retention_cases
    where status = 'pending' and delete_after <= now() order by delete_after
  loop
    begin
      select * into v_subscription from public.kunthai_business_subscriptions where id = v_row.subscription_id for update;
      select * into v_case from public.kunthai_urmall_retention_cases where id = v_row.id for update;
      if v_case.status <> 'pending' or v_case.delete_after > now() then continue; end if;
      -- Conservative: a paid plan (even if another renewal is due) cancels this
      -- old deletion job. A later expiry must create a fresh full notice window.
      if v_subscription.id is null or v_subscription.plan_code <> 'free' then
        update public.kunthai_urmall_retention_cases set status = 'cancelled', completed_at = now() where id = v_case.id;
        continue;
      end if;
      v_total := 0;
      foreach v_kind in array array['product', 'meal', 'property'] loop
        v_table := case v_kind when 'product' then 'marketplace_products' when 'meal' then 'marketplace_restaurant_menu_items' else 'marketplace_property_listings' end;
        -- Unknown future cascade relationships must be reviewed, never silently
        -- remove transactions. Only disposable carts/saved-list links cascade.
        if exists (select 1 from pg_constraint fk
          where fk.contype = 'f' and fk.confrelid = ('public.' || v_table)::regclass
            and fk.confdeltype = 'c' and fk.conrelid::regclass::text not in ('marketplace_cart_items', 'marketplace_saved_products', 'public.marketplace_cart_items', 'public.marketplace_saved_products')) then
          raise exception 'Retention cleanup paused: an unreviewed cascading relationship references %', v_table;
        end if;
        execute format('delete from public.%I inventory where inventory.business_id = $1 and inventory.id in (select item_id from public.kunthai_urmall_retention_items where case_id = $2 and item_kind = $3) and not (inventory.id = any($4))', v_table)
          using v_case.business_id, v_case.id, v_kind, v_case.retained_ids;
        get diagnostics v_deleted = row_count;
        v_total := v_total + v_deleted;
      end loop;
      update public.kunthai_urmall_retention_cases set status = 'completed', completed_at = now(), deleted_count = v_total where id = v_case.id;
      insert into public.kunthai_business_subscription_events(subscription_id, event_type, from_plan_code, to_plan_code, metadata)
      values(v_subscription.id, 'urmall_retention_completed', 'free', 'free', jsonb_build_object('case_id', v_case.id, 'deleted_count', v_total, 'retained_ids', v_case.retained_ids));
      perform public.kunthai_subscription_notify((select user_id from public.marketplace_businesses where id = v_case.business_id),
        'business-subscription:' || v_subscription.id || ':retention-complete:' || v_case.id,
        format('The 15-day renewal window ended. %s excess listings and product drafts were permanently deleted. Your selected listings and order/payment history remain.', v_total), 'high');
      v_processed := v_processed + 1;
    exception when others then
      -- Leave the case pending for repair/retry. Do not mark partial work done.
      raise warning 'UrMall retention case % was not deleted: %', v_row.id, sqlerrm;
    end;
  end loop;
  return v_processed;
end;
$$;
revoke all on function public.process_urmall_expiry_retention() from public, anon, authenticated;
grant execute on function public.process_urmall_expiry_retention() to service_role;

-- Preserve the tested renewal/debit and reminder implementation, including
-- UrRide's existing non-deletion policy. The hourly cron already calls this name.
alter function public.process_kunthai_business_subscriptions() rename to process_kunthai_business_subscriptions_before_urmall_retention;
revoke all on function public.process_kunthai_business_subscriptions_before_urmall_retention() from public, anon, authenticated, service_role;
create or replace function public.process_kunthai_business_subscriptions()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_subscription record;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  v_result := public.process_kunthai_business_subscriptions_before_urmall_retention();
  for v_subscription in select s.id from public.kunthai_business_subscriptions s
    where s.surface = 'urmall' and s.plan_code = 'free' and s.status = 'expired'
      and not exists(select 1 from public.kunthai_urmall_retention_cases c where c.subscription_id = s.id)
  loop
    perform public.kunthai_start_urmall_retention(v_subscription.id);
  end loop;
  return v_result || jsonb_build_object('urmall_retention_completed', public.process_urmall_expiry_retention());
end;
$$;
revoke all on function public.process_kunthai_business_subscriptions() from public, anon, authenticated;
grant execute on function public.process_kunthai_business_subscriptions() to service_role;

-- All existing 7/3/1-day and grace reminders retain their timing and dedupe
-- keys; only UrMall wording changes so the policy is disclosed before expiry.
alter function public.kunthai_subscription_notify(uuid, text, text, text) rename to kunthai_subscription_notify_before_urmall_retention;
revoke all on function public.kunthai_subscription_notify_before_urmall_retention(uuid, text, text, text) from public, anon, authenticated;
create or replace function public.kunthai_subscription_notify(p_user_id uuid, p_group_key text, p_message text, p_priority text default 'normal')
returns void language plpgsql security definer set search_path = public as $$
declare v_urmall boolean := false; v_message text := p_message;
begin
  select exists(select 1 from public.kunthai_business_subscriptions s where s.surface = 'urmall'
    and p_group_key like 'business-subscription:' || s.id || ':%') into v_urmall;
  if v_urmall and p_group_key not like '%:retention%' then
    v_message := replace(v_message, 'after the safety grace period', 'when the paid period ends');
    v_message := replace(v_message, 'after the renewal grace period', 'when the paid period ended');
    v_message := replace(v_message, 'Nothing will be deleted.', 'Only ten selected published listings remain visible after expiry. Excess listings and existing product drafts are permanently deleted 15 days later unless you renew or upgrade.');
    v_message := replace(v_message, 'Nothing was deleted; new additions follow Free plan limits.', 'Only ten selected published listings remain visible. Open your business dashboard to choose them. Renew within 15 days to keep excess listings and existing drafts.');
    v_message := replace(v_message, 'Existing resources were preserved.', 'Only ten selected published listings remain visible. Renew within 15 days to prevent permanent deletion of excess listings and existing product drafts.');
    if p_group_key like '%:1:%' or p_group_key like '%:3:%' or p_group_key like '%:7:%' then
      v_message := replace(v_message, 'to avoid the grace period', 'to renew before expiry');
      if v_message not like '%permanently deleted%' then
        v_message := v_message || ' If renewal fails at expiry, only ten selected published listings remain visible. Renew within the following 15 days to prevent permanent deletion of excess listings and existing product drafts.';
      end if;
    end if;
  end if;
  perform public.kunthai_subscription_notify_before_urmall_retention(p_user_id, p_group_key, v_message, p_priority);
end;
$$;
revoke all on function public.kunthai_subscription_notify(uuid, text, text, text) from public, anon, authenticated;

-- A successful auto-renew still runs before downgrade. On failure, UrMall has
-- no extra seven-day grace ahead of the requested fifteen-day retention window.
alter function public.kunthai_renew_subscription_row(uuid) rename to kunthai_renew_subscription_row_before_urmall_retention;
revoke all on function public.kunthai_renew_subscription_row_before_urmall_retention(uuid) from public, anon, authenticated;
create or replace function public.kunthai_renew_subscription_row(p_subscription_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.kunthai_business_subscriptions set grace_ends_at = current_period_end - interval '1 microsecond'
  where id = p_subscription_id and surface = 'urmall' and plan_code <> 'free' and current_period_end <= now();
  return public.kunthai_renew_subscription_row_before_urmall_retention(p_subscription_id);
end;
$$;
revoke all on function public.kunthai_renew_subscription_row(uuid) from public, anon, authenticated;

alter function public.kunthai_business_effective_entitlement(text, uuid) rename to kunthai_business_effective_entitlement_before_urmall_retention;
revoke all on function public.kunthai_business_effective_entitlement_before_urmall_retention(text, uuid) from public, anon, authenticated;
create or replace function public.kunthai_business_effective_entitlement(p_surface text, p_entity_id uuid)
returns table(plan_code text, plan_name text, product_limit integer, operator_limit integer, vehicle_limit integer, admin_limit integer, status text, operator_pack_count integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if lower(p_surface) = 'urmall' and exists(select 1 from public.kunthai_business_subscriptions s
    where s.surface = 'urmall' and s.marketplace_business_id = p_entity_id and s.plan_code <> 'free'
      and s.current_period_end <= now()) then
    return query select p.plan_code, p.display_name, p.product_limit, p.operator_limit, p.vehicle_limit,
      p.admin_limit, 'expired'::text, 0 from public.kunthai_business_plans p where p.surface = 'urmall' and p.plan_code = 'free';
    return;
  end if;
  return query select * from public.kunthai_business_effective_entitlement_before_urmall_retention(p_surface, p_entity_id);
end;
$$;
revoke all on function public.kunthai_business_effective_entitlement(text, uuid) from public, anon, authenticated;

-- Quotas cover all four UrMall types. The legacy vendor guard skipped plans,
-- and vertical listings previously had no authoritative quota at all.
create or replace function public.kunthai_guard_urmall_inventory_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entitlement record; v_current integer; v_consumes boolean; v_old_consumes boolean;
begin
  if tg_table_name = 'marketplace_products' then
    v_consumes := new.status not in ('draft', 'pending-review');
    if tg_op = 'UPDATE' then v_old_consumes := old.status not in ('draft', 'pending-review'); end if;
  elsif tg_table_name = 'marketplace_property_listings' then
    v_consumes := new.published;
    if tg_op = 'UPDATE' then v_old_consumes := old.published; end if;
  else
    v_consumes := true;
    v_old_consumes := true;
  end if;
  if not v_consumes or (tg_op = 'UPDATE' and v_old_consumes and new.business_id is not distinct from old.business_id) then return new; end if;
  -- Serialize the last plan slot and use the same order as renewal/cleanup.
  perform 1 from public.kunthai_business_subscriptions
  where surface = 'urmall' and marketplace_business_id = new.business_id for update;
  select * into v_entitlement from public.kunthai_business_effective_entitlement('urmall', new.business_id);
  if v_entitlement.product_limit is null then return new; end if;
  select count(*)::integer into v_current from public.kunthai_urmall_retention_inventory
  where business_id = new.business_id and eligible_to_keep and id is distinct from new.id;
  if v_current >= v_entitlement.product_limit then
    perform public.kunthai_raise_capacity_limit('urmall', 'products', v_current, v_entitlement.product_limit, v_entitlement.plan_code);
  end if;
  return new;
end;
$$;
revoke all on function public.kunthai_guard_urmall_inventory_capacity() from public, anon, authenticated;
drop trigger if exists kunthai_guard_urmall_product_capacity on public.marketplace_products;
create trigger kunthai_guard_urmall_product_capacity before insert or update of business_id, status
on public.marketplace_products for each row execute function public.kunthai_guard_urmall_inventory_capacity();
drop trigger if exists kunthai_guard_urmall_meal_capacity on public.marketplace_restaurant_menu_items;
create trigger kunthai_guard_urmall_meal_capacity before insert or update of business_id
on public.marketplace_restaurant_menu_items for each row execute function public.kunthai_guard_urmall_inventory_capacity();
drop trigger if exists kunthai_guard_urmall_property_capacity on public.marketplace_property_listings;
create trigger kunthai_guard_urmall_property_capacity before insert or update of business_id, published
on public.marketplace_property_listings for each row execute function public.kunthai_guard_urmall_inventory_capacity();

-- A business with fewer than ten published listings can still use its vacant
-- Free slots during the notice window. Protect newly published rows immediately
-- rather than leaving them hidden behind an old, shorter retained-ID list.
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
  if cardinality(v_ids) >= 10 then return new; end if;
  insert into public.kunthai_urmall_retention_items(case_id,item_id,item_kind,eligible_to_keep)
  values(v_case.id,new.id,v_inventory.item_kind,true)
  on conflict(case_id,item_id) do update set eligible_to_keep=true;
  update public.kunthai_urmall_retention_cases set retained_ids=array_append(v_ids,new.id) where id=v_case.id;
  return new;
end;
$$;
revoke all on function public.kunthai_retain_urmall_new_free_slot() from public, anon, authenticated;
do $$ declare v_table text; begin
  foreach v_table in array array['marketplace_products','marketplace_restaurant_menu_items','marketplace_property_listings'] loop
    execute format('drop trigger if exists kunthai_retain_urmall_new_free_slot on public.%I',v_table);
    execute format('create trigger kunthai_retain_urmall_new_free_slot after insert or update on public.%I for each row execute function public.kunthai_retain_urmall_new_free_slot()',v_table);
  end loop;
end $$;

alter function public.kunthai_business_usage(text, uuid) rename to kunthai_business_usage_before_urmall_retention;
revoke all on function public.kunthai_business_usage_before_urmall_retention(text, uuid) from public, anon, authenticated;
create or replace function public.kunthai_business_usage(p_surface text, p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_usage jsonb; v_count integer;
begin
  v_usage := public.kunthai_business_usage_before_urmall_retention(p_surface, p_entity_id);
  if lower(p_surface) = 'urmall' then
    select count(*)::integer into v_count from public.kunthai_urmall_retention_inventory where business_id = p_entity_id and eligible_to_keep;
    v_usage := v_usage || jsonb_build_object('products', v_count);
  end if;
  return v_usage;
end;
$$;
revoke all on function public.kunthai_business_usage(text, uuid) from public, anon, authenticated;

create or replace function public.kunthai_guard_urmall_admin_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entitlement record; v_current integer;
begin
  if new.status not in ('pending', 'accepted') or (tg_op = 'UPDATE' and old.status in ('pending', 'accepted')
    and old.business_id is not distinct from new.business_id) then return new; end if;
  perform 1 from public.kunthai_business_subscriptions where surface = 'urmall' and marketplace_business_id = new.business_id for update;
  select * into v_entitlement from public.kunthai_business_effective_entitlement('urmall', new.business_id);
  if v_entitlement.admin_limit is null then return new; end if;
  select count(*)::integer into v_current from public.marketplace_business_admins
  where business_id = new.business_id and status in ('pending', 'accepted') and id is distinct from new.id;
  if v_current >= v_entitlement.admin_limit then
    perform public.kunthai_raise_capacity_limit('urmall', 'admins', v_current, v_entitlement.admin_limit, v_entitlement.plan_code);
  end if;
  return new;
end;
$$;
revoke all on function public.kunthai_guard_urmall_admin_capacity() from public, anon, authenticated;
drop trigger if exists kunthai_guard_urmall_admin_capacity on public.marketplace_business_admins;
create trigger kunthai_guard_urmall_admin_capacity before insert or update of status, business_id
on public.marketplace_business_admins for each row execute function public.kunthai_guard_urmall_admin_capacity();
commit;
