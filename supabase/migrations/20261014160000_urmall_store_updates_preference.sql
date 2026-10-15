-- UrMall Settings > "New from stores you viewed" (2026-10-14).
--
-- A buyer can turn off "You recently viewed … just added …" notifications.
-- The preference lives with the other notification switches in
-- user_notification_preferences (default on), and the trigger from
-- 20261014150000 skips buyers who turned it off. Apply after that migration.

alter table public.user_notification_preferences
  add column if not exists urmall_store_updates_enabled boolean not null default true;

create or replace function public.notify_urmall_new_from_seller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store text;
  v_owner uuid;
begin
  -- Only a product that just became visible to buyers.
  if new.status is distinct from 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'active' then
    return new;
  end if;

  begin
    select coalesce(nullif(btrim(business.business_name), ''), 'A store you viewed'), business.user_id
      into v_store, v_owner
    from public.marketplace_businesses business
    where business.id = new.business_id;
    if v_store is null then
      return new;
    end if;

    insert into public.platform_notifications (
      user_id, sector, notification_type, title, body, priority, status, category,
      workspace, workspace_id, action_target, action_data, channels, presentation, dedupe_key
    )
    select
      viewer.user_id,
      'marketplace',
      'urmall_new_from_seller',
      left(v_store || ' added something new', 100),
      left('You recently viewed ' || coalesce(viewer.last_item, 'a listing') || '. '
        || v_store || ' just added ' || coalesce(nullif(btrim(new.name), ''), 'a new product') || '.', 240),
      'normal',
      'unread',
      'marketplace',
      'marketplace',
      new.business_id,
      'urmall:product',
      jsonb_build_object('productId', new.id, 'businessId', new.business_id, 'actionLabel', 'View product'),
      array['in_app', 'push']::text[],
      'inbox',
      'urmall_new_from_seller:' || new.business_id::text || ':' || viewer.user_id::text || ':' || current_date::text
    from (
      select
        signal.user_id,
        (array_agg(nullif(btrim(signal.item_name), '') order by signal.created_at desc)
          filter (where nullif(btrim(signal.item_name), '') is not null))[1] as last_item
      from public.marketplace_buyer_signals signal
      where signal.business_id = new.business_id
        and signal.created_at > now() - interval '30 days'
        and signal.kind in ('view', 'dwell', 'cart', 'message')
        and (signal.product_id is null or signal.product_id <> new.id)
      group by signal.user_id
      limit 500
    ) viewer
    where viewer.user_id is distinct from v_owner
      and viewer.user_id is distinct from new.user_id
      and not exists (
        select 1 from public.marketplace_business_admins admin
        where admin.business_id = new.business_id and admin.user_id = viewer.user_id
      )
      and not exists (
        select 1 from public.marketplace_business_members member
        where member.business_id = new.business_id and member.user_id = viewer.user_id
      )
      -- UrMall Settings > "New from stores you viewed".
      and coalesce((
        select prefs.urmall_store_updates_enabled from public.user_notification_preferences prefs
        where prefs.user_id = viewer.user_id
      ), true)
      and (
        select count(*) from public.platform_notifications sent
        where sent.user_id = viewer.user_id
          and sent.notification_type = 'urmall_new_from_seller'
          and sent.created_at > now() - interval '1 day'
      ) < 3
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  exception when others then
    raise warning 'notify_urmall_new_from_seller skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.notify_urmall_new_from_seller() from public;
