-- UrMall buyer interests and "new from a seller you viewed" (2026-10-14).
--
-- 1. marketplace_buyer_signals: what a signed-in buyer does in UrMall (opened a
--    listing, time spent on it, searched, added to cart, messaged a seller).
--    Private: each person can only add and read their own rows. Kept 120 days.
-- 2. get_my_marketplace_interests(): the buyer's favourite categories (recent
--    activity weighs more) and recent searches, so UrMall can suggest those
--    products first.
-- 3. When a store publishes a new product, buyers who viewed that store in the
--    last 30 days get "You recently viewed {item}. {Store} just added {new}"
--    with View product. At most one per store per buyer per day and three per
--    buyer per day; never the store's own owner, admins or members. A problem
--    here never blocks publishing the product.

create table if not exists public.marketplace_buyer_signals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('view', 'dwell', 'search', 'cart', 'message')),
  business_id uuid,
  product_id uuid,
  item_name text not null default '' check (length(item_name) <= 160),
  category text not null default '' check (length(category) <= 80),
  query text not null default '' check (length(query) <= 120),
  seconds integer not null default 0 check (seconds between 0 and 3600),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_buyer_signals_user_idx
  on public.marketplace_buyer_signals (user_id, created_at desc);
create index if not exists marketplace_buyer_signals_business_idx
  on public.marketplace_buyer_signals (business_id, created_at desc)
  where business_id is not null;

alter table public.marketplace_buyer_signals enable row level security;
revoke all on public.marketplace_buyer_signals from public, anon;
grant select, insert, delete on public.marketplace_buyer_signals to authenticated;
grant usage on sequence public.marketplace_buyer_signals_id_seq to authenticated;

drop policy if exists marketplace_buyer_signals_own_insert on public.marketplace_buyer_signals;
create policy marketplace_buyer_signals_own_insert on public.marketplace_buyer_signals
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists marketplace_buyer_signals_own_select on public.marketplace_buyer_signals;
create policy marketplace_buyer_signals_own_select on public.marketplace_buyer_signals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists marketplace_buyer_signals_own_delete on public.marketplace_buyer_signals;
create policy marketplace_buyer_signals_own_delete on public.marketplace_buyer_signals
  for delete to authenticated using (user_id = auth.uid());

-- Favourite categories: each action weighs differently and fades over about
-- three weeks. Also trims the caller's signals older than 120 days.
create or replace function public.get_my_marketplace_interests(p_limit integer default 8)
returns table (category text, score numeric, last_query text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;

  delete from public.marketplace_buyer_signals
  where user_id = v_user and created_at < now() - interval '120 days';

  return query
  with weighted as (
    select
      lower(btrim(signal.category)) as category,
      (case signal.kind
         when 'view' then 1.0
         when 'dwell' then least(signal.seconds, 180) / 30.0
         when 'search' then 2.0
         when 'cart' then 3.0
         when 'message' then 3.0
         else 0
       end) * exp(-extract(epoch from (now() - signal.created_at)) / 86400.0 / 21.0) as weight,
      nullif(btrim(signal.query), '') as query,
      signal.created_at
    from public.marketplace_buyer_signals signal
    where signal.user_id = v_user
      and signal.created_at > now() - interval '120 days'
      and btrim(signal.category) <> ''
  )
  select
    weighted.category,
    round(sum(weighted.weight)::numeric, 3) as score,
    (array_agg(weighted.query order by weighted.created_at desc) filter (where weighted.query is not null))[1] as last_query
  from weighted
  group by weighted.category
  having sum(weighted.weight) > 0.05
  order by sum(weighted.weight) desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
end;
$$;

revoke all on function public.get_my_marketplace_interests(integer) from public, anon;
grant execute on function public.get_my_marketplace_interests(integer) to authenticated;

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

drop trigger if exists notify_urmall_new_from_seller on public.marketplace_products;
create trigger notify_urmall_new_from_seller
after insert or update of status on public.marketplace_products
for each row execute function public.notify_urmall_new_from_seller();
