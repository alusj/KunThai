-- Native push notifications for the iOS and Android app (2026-10-09).
--
-- 1. public.push_device_tokens: one row per device token (APNs on iOS, FCM on
--    Android). Own-row RLS. The app saves its token through
--    register_push_device_token(), an upsert by token that also moves a token
--    to the account now signed in on that device, and removes it on sign-out
--    with unregister_push_device_token().
-- 2. public.push_outbox: a queue of pushes to send. AFTER INSERT/UPDATE
--    triggers fill it for
--      - new explore_notifications rows (likes and other reactions, comments
--        and replies, mentions, follows),
--      - new direct messages (explore_messages),
--      - marketplace order status changes (to the buyer).
--    A row is only queued when the recipient has a device registered, has
--    push turned on (user_notification_preferences.push_enabled, plus
--    social_enabled / commerce_enabled), has not switched that alert type off
--    in Explore settings (explore_user_preferences.settings->notifications),
--    and has not blocked the person (or Space) behind it.
--    The queue is never readable by the app. The send-native-push Edge
--    Function drains it with the service role (push_outbox_claim()), called by
--    a Supabase cron schedule or a Database Webhook. No keys live in SQL.
--
-- The triggers never make the original insert or update fail: a problem while
-- queueing a push is logged as a warning and skipped.
--
-- Safe to run more than once.

begin;

-- ===========================================================================
-- 1. Device tokens
-- ===========================================================================

create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (char_length(token) between 16 and 4096)
);

create index if not exists push_device_tokens_user_idx on public.push_device_tokens (user_id);

alter table public.push_device_tokens enable row level security;

drop policy if exists "push_device_tokens_select_own" on public.push_device_tokens;
create policy "push_device_tokens_select_own" on public.push_device_tokens
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "push_device_tokens_insert_own" on public.push_device_tokens;
create policy "push_device_tokens_insert_own" on public.push_device_tokens
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "push_device_tokens_update_own" on public.push_device_tokens;
create policy "push_device_tokens_update_own" on public.push_device_tokens
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "push_device_tokens_delete_own" on public.push_device_tokens;
create policy "push_device_tokens_delete_own" on public.push_device_tokens
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.push_device_tokens from anon;
grant select, insert, update, delete on public.push_device_tokens to authenticated;

-- Upsert by token for the signed-in account. A phone that signs in to a
-- different account hands its token to that account, so the previous account
-- stops getting pushes on it.
create or replace function public.register_push_device_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  clean_token text := btrim(coalesce(p_token, ''));
  clean_platform text := lower(btrim(coalesce(p_platform, '')));
begin
  if caller is null then
    raise exception 'Sign in to turn on push alerts.' using errcode = '42501';
  end if;
  if clean_platform not in ('ios', 'android') then
    raise exception 'Unknown push platform.' using errcode = '22023';
  end if;
  if char_length(clean_token) not between 16 and 4096 then
    raise exception 'Invalid push token.' using errcode = '22023';
  end if;

  insert into public.push_device_tokens (user_id, token, platform, updated_at, last_seen_at)
  values (caller, clean_token, clean_platform, now(), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = case when push_device_tokens.user_id is distinct from excluded.user_id
                            or push_device_tokens.platform is distinct from excluded.platform
                          then now() else push_device_tokens.updated_at end,
        last_seen_at = now();
end;
$$;

create or replace function public.unregister_push_device_token(p_token text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_device_tokens
  where token = btrim(coalesce(p_token, ''))
    and user_id = auth.uid();
$$;

revoke all on function public.register_push_device_token(text, text) from public;
revoke all on function public.unregister_push_device_token(text) from public;
do $$ begin
  revoke all on function public.register_push_device_token(text, text) from anon;
  revoke all on function public.unregister_push_device_token(text) from anon;
exception when undefined_object then null;
end $$;
grant execute on function public.register_push_device_token(text, text) to authenticated;
grant execute on function public.unregister_push_device_token(text) to authenticated;

-- ===========================================================================
-- 2. Outbox
-- ===========================================================================

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'KunThai',
  body text not null default '',
  route text not null default '',
  kind text not null default 'activity',
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

alter table public.push_outbox add column if not exists kind text not null default 'activity';
alter table public.push_outbox add column if not exists dedupe_key text;
alter table public.push_outbox add column if not exists claimed_at timestamptz;

create unique index if not exists push_outbox_dedupe_key_idx on public.push_outbox (dedupe_key);
create index if not exists push_outbox_pending_idx on public.push_outbox (created_at) where sent_at is null;

-- Only the service role (the Edge Function) reads or changes the queue.
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

-- May this recipient get a push of this kind from this actor?
-- p_category: 'social' or 'commerce'; p_setting: the Explore notification
-- switch (reactions, comments, mentions, follows, messages) or null.
create or replace function public.push_recipient_allows(
  p_recipient uuid,
  p_category text,
  p_setting text default null,
  p_actor uuid default null,
  p_actor_space uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  prefs record;
  explore_settings jsonb;
begin
  if p_recipient is null then
    return false;
  end if;
  if p_actor is not null and p_actor = p_recipient then
    return false;
  end if;
  if not exists (select 1 from public.push_device_tokens where user_id = p_recipient) then
    return false;
  end if;

  select push_enabled, social_enabled, commerce_enabled
  into prefs
  from public.user_notification_preferences
  where user_id = p_recipient;
  if not found or prefs.push_enabled is not true then
    return false;
  end if;
  if p_category = 'social' and prefs.social_enabled is false then
    return false;
  end if;
  if p_category = 'commerce' and prefs.commerce_enabled is false then
    return false;
  end if;

  if p_setting is not null then
    select settings into explore_settings
    from public.explore_user_preferences
    where user_id = p_recipient;
    if coalesce(explore_settings #>> array['notifications', p_setting], 'true') = 'false' then
      return false;
    end if;
  end if;

  if (p_actor is not null or p_actor_space is not null)
     and public.explore_has_blocked(p_recipient, p_actor, p_actor_space) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.push_recipient_allows(uuid, text, text, uuid, uuid) from public;
do $$ begin
  revoke all on function public.push_recipient_allows(uuid, text, text, uuid, uuid) from anon, authenticated;
exception when undefined_object then null;
end $$;

create or replace function public.push_short_text(p_text text, p_limit integer default 140)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when char_length(clean) > p_limit then left(clean, p_limit - 1) || '…'
    else clean
  end
  from (select btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')) as clean) value;
$$;

-- explore_notifications ------------------------------------------------------
-- Messages are pushed from explore_messages below, so a 'message'
-- notification row is not pushed a second time.
create or replace function public.push_queue_explore_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := to_jsonb(new);
  kind text := lower(coalesce(row_data ->> 'type', ''));
  setting text;
  actor uuid := public.explore_try_uuid(row_data ->> 'actor_user_id');
  actor_space uuid := public.explore_try_uuid(row_data ->> 'actor_space_id');
  title text;
  body text;
begin
  setting := case
    when kind in ('like', 'save', 'share', 'reaction', 'repost') then 'reactions'
    when kind in ('comment', 'reply', 'creator_reply', 'thread_reply') then 'comments'
    when kind in ('mention', 'tag') then 'mentions'
    when kind in ('follow', 'connect', 'connection', 'connection_request') then 'follows'
    else null
  end;
  if setting is null then
    return new;
  end if;

  begin
    if not public.push_recipient_allows(new.user_id, 'social', setting, actor, actor_space) then
      return new;
    end if;

    title := public.push_short_text(coalesce(nullif(row_data ->> 'actor_name', ''), 'KunThai'), 60);
    body := public.push_short_text(coalesce(nullif(row_data ->> 'message', ''), 'New activity on KunThai'), 160);

    insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
    values (new.user_id, title, body, 'notifications', setting, 'explore_notification:' || new.id::text)
    on conflict (dedupe_key) do nothing;
  exception when others then
    raise warning 'push_queue_explore_notification skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

-- explore_messages -----------------------------------------------------------
create or replace function public.push_queue_explore_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := to_jsonb(new);
  media text := lower(coalesce(row_data ->> 'media_type', 'text'));
  sender_space uuid := public.explore_try_uuid(coalesce(row_data -> 'metadata', '{}'::jsonb) #>> '{actor,spaceId}');
  conversation_data jsonb;
  participants uuid[];
  sender_name text;
  preview text;
  recipient uuid;
begin
  if media = 'system' then
    return new;
  end if;

  begin
    select to_jsonb(conversation) into conversation_data
    from public.explore_conversations conversation
    where conversation.id = new.conversation_id;

    participants := coalesce(
      (select array_agg(public.explore_try_uuid(value))
       from jsonb_array_elements_text(coalesce(conversation_data -> 'participant_ids', '[]'::jsonb)) value),
      '{}'::uuid[]
    );

    select coalesce(nullif(btrim(profile.display_name), ''), 'KunThai')
    into sender_name
    from public.explore_profiles profile
    where profile.user_id = new.sender_id;
    sender_name := public.push_short_text(coalesce(sender_name, 'KunThai'), 60);

    preview := case
      when coalesce(conversation_data ->> 'request', 'false') = 'true' then 'Sent you a message request'
      when media = 'image' then 'Sent a photo'
      when media = 'video' then 'Sent a video'
      when media = 'audio' then 'Sent a voice message'
      else coalesce(nullif(public.push_short_text(row_data ->> 'body', 140), ''), 'Sent a message')
    end;

    for recipient in
      select distinct candidate.user_id
      from (
        select unnest(participants) as user_id
        union
        select member.user_id
        from public.explore_conversation_members member
        where member.conversation_id = new.conversation_id
      ) candidate
      where candidate.user_id is not null
        and candidate.user_id is distinct from new.sender_id
    loop
      if public.push_recipient_allows(recipient, 'social', 'messages', new.sender_id, sender_space) then
        insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
        values (recipient, sender_name, preview, 'conversation:' || new.conversation_id::text, 'messages',
                'explore_message:' || new.id::text || ':' || recipient::text)
        on conflict (dedupe_key) do nothing;
      end if;
    end loop;
  exception when others then
    raise warning 'push_queue_explore_message skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

-- marketplace_orders ---------------------------------------------------------
create or replace function public.push_queue_marketplace_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  buyer uuid := public.explore_try_uuid(to_jsonb(new) ->> 'buyer_id');
  status_label text;
begin
  if new.status is not distinct from old.status or buyer is null then
    return new;
  end if;

  begin
    if not public.push_recipient_allows(buyer, 'commerce', null, null, null) then
      return new;
    end if;
    status_label := initcap(replace(lower(coalesce(new.status, 'updated')), '_', ' '));
    insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
    values (buyer, 'Order update', 'Your order is now: ' || public.push_short_text(status_label, 40), 'orders', 'orders',
            'marketplace_order:' || new.id::text || ':' || lower(coalesce(new.status, '')) || ':' || txid_current()::text)
    on conflict (dedupe_key) do nothing;
  exception when others then
    raise warning 'push_queue_marketplace_order_status skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.explore_notifications') is not null then
    execute 'drop trigger if exists push_queue_explore_notification on public.explore_notifications';
    execute 'create trigger push_queue_explore_notification after insert on public.explore_notifications
             for each row execute function public.push_queue_explore_notification()';
  end if;
  if to_regclass('public.explore_messages') is not null then
    execute 'drop trigger if exists push_queue_explore_message on public.explore_messages';
    execute 'create trigger push_queue_explore_message after insert on public.explore_messages
             for each row execute function public.push_queue_explore_message()';
  end if;
  if to_regclass('public.marketplace_orders') is not null then
    execute 'drop trigger if exists push_queue_marketplace_order_status on public.marketplace_orders';
    execute 'create trigger push_queue_marketplace_order_status after update of status on public.marketplace_orders
             for each row execute function public.push_queue_marketplace_order_status()';
  end if;
end $$;

-- Draining (service role only) -----------------------------------------------
-- Claims up to p_limit unsent rows (skipping rows another run holds), counts
-- the attempt, and returns them with the recipient's device tokens. Rows
-- older than a day or tried 5 times are given up.
create or replace function public.push_outbox_claim(p_limit integer default 100)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  route text,
  kind text,
  attempts integer,
  devices jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  update public.push_outbox outbox
  set sent_at = now(), last_error = coalesce(outbox.last_error, 'expired')
  where outbox.sent_at is null
    and (outbox.attempts >= 5 or outbox.created_at < now() - interval '1 day');

  return query
  with picked as (
    select outbox.id
    from public.push_outbox outbox
    where outbox.sent_at is null
      and (outbox.claimed_at is null or outbox.claimed_at < now() - interval '5 minutes')
    order by outbox.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ), claimed as (
    update public.push_outbox outbox
    set claimed_at = now(), attempts = outbox.attempts + 1
    from picked
    where outbox.id = picked.id
    returning outbox.id, outbox.user_id, outbox.title, outbox.body, outbox.route, outbox.kind, outbox.attempts
  )
  select claimed.id, claimed.user_id, claimed.title, claimed.body, claimed.route, claimed.kind, claimed.attempts,
    coalesce((
      select jsonb_agg(jsonb_build_object('token', device.token, 'platform', device.platform))
      from public.push_device_tokens device
      where device.user_id = claimed.user_id
    ), '[]'::jsonb)
  from claimed;
end;
$$;

-- Records the result of one claimed row. p_error null = delivered (or nothing
-- left to deliver to); otherwise the row is released for a later retry.
create or replace function public.push_outbox_finish(p_id uuid, p_error text default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_outbox
  set sent_at = case when p_error is null then now() else null end,
      claimed_at = case when p_error is null then claimed_at else null end,
      last_error = left(p_error, 500)
  where id = p_id;
$$;

revoke all on function public.push_outbox_claim(integer) from public;
revoke all on function public.push_outbox_finish(uuid, text) from public;
do $$ begin
  revoke all on function public.push_outbox_claim(integer) from anon, authenticated;
  revoke all on function public.push_outbox_finish(uuid, text) from anon, authenticated;
exception when undefined_object then null;
end $$;
do $$ begin
  grant execute on function public.push_outbox_claim(integer) to service_role;
  grant execute on function public.push_outbox_finish(uuid, text) to service_role;
  grant select, insert, update, delete on public.push_outbox to service_role;
  grant select, insert, update, delete on public.push_device_tokens to service_role;
exception when undefined_object then null;
end $$;

commit;
