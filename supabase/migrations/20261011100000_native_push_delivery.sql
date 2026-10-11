-- Native push delivery (2026-10-11). Builds on 20261009150000_native_push_tokens.sql.
--
-- 1. Reliable queue. public.push_outbox gets a lease (locked_until), a retry
--    time (next_attempt_at) and a dead state (dead_at):
--    - push_outbox_claim() hands each ready row to exactly one drain
--      (FOR UPDATE SKIP LOCKED) and leases it for 5 minutes. A drain that
--      crashes simply lets the lease run out; the row is then retried.
--    - push_outbox_record() stores the outcome of one claimed attempt: sent,
--      retry later with exponential backoff (30 s, 1, 2, 4 ... up to 30 min),
--      or dead (permanent error, invalid tokens, or 5 attempts used). It
--      ignores an outcome from a drain whose lease was taken over, so a
--      slow drain cannot overwrite a newer attempt.
--    - push_outbox_finish(uuid, text) keeps its signature for an older
--      send-native-push deployment and now uses the same backoff.
--    - push_outbox_cleanup() deletes sent and dead rows after 14 days.
-- 2. Draining without keys in SQL. public.kunthai_kick_native_push() POSTs
--    to the send-native-push Edge Function through pg_net with the header
--    x-push-secret. The URL and secret are read at run time from Supabase
--    Vault (secrets 'kunthai_push_function_url' and
--    'kunthai_push_drain_secret'; the older name 'push_drain_secret' is also
--    accepted). This migration never stores a secret value. Without pg_net,
--    Vault or those secrets the function does nothing.
--    - A statement-level AFTER INSERT trigger on push_outbox kicks the drain
--      at most once every 2 seconds, so a burst of inserts makes one HTTP
--      call. pg_net sends after the inserting transaction commits. The
--      trigger never makes the insert fail.
--    - When pg_cron is installed: 'kunthai-native-push-drain' every minute
--      (safety net for retries and missed kicks) and
--      'kunthai-native-push-cleanup' daily.
-- 3. Admin campaigns reach the app too. A statement-level trigger on
--    public.platform_notifications queues one push per campaign recipient
--    (rows with a campaign_id whose channels include 'push') who has a
--    device and push_enabled (marketing campaigns also respect
--    marketing_enabled; blocks do not apply to announcements). The dedupe
--    key 'campaign:<campaign>:<user>' and the existing unique delivery row
--    per (campaign_id, user_id) make republishing and retries safe. This
--    fires the same way for console publishing, the pg_cron schedule and the
--    Vercel cron. Web push (send-notification-push) is unchanged.
--
-- Safe to run more than once. Works without pg_cron, pg_net and Vault (the
-- parts that need them are skipped with a NOTICE).

begin;

-- ===========================================================================
-- 1. Queue columns
-- ===========================================================================

alter table public.push_outbox add column if not exists locked_until timestamptz;
alter table public.push_outbox add column if not exists next_attempt_at timestamptz not null default now();
alter table public.push_outbox add column if not exists dead_at timestamptz;

create unique index if not exists push_outbox_dedupe_key_idx on public.push_outbox (dedupe_key);
create index if not exists push_outbox_ready_idx
  on public.push_outbox (next_attempt_at, created_at)
  where sent_at is null and dead_at is null;
create index if not exists push_outbox_closed_idx
  on public.push_outbox (coalesce(sent_at, dead_at))
  where sent_at is not null or dead_at is not null;

-- ===========================================================================
-- 2. Claim / record / cleanup (service role only)
-- ===========================================================================

-- Same signature and result columns as 20261009150000, so a deployed
-- send-native-push keeps working. "attempts" doubles as the lease number that
-- push_outbox_record() checks.
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
  -- Give up on rows that are a day old or used every attempt (never while a
  -- drain still holds them).
  update public.push_outbox outbox
  set dead_at = now(),
      locked_until = null,
      last_error = coalesce(outbox.last_error, 'expired')
  where outbox.sent_at is null
    and outbox.dead_at is null
    and (outbox.locked_until is null or outbox.locked_until < now())
    and (outbox.attempts >= 5 or outbox.created_at < now() - interval '1 day');

  return query
  with picked as (
    select outbox.id
    from public.push_outbox outbox
    where outbox.sent_at is null
      and outbox.dead_at is null
      and outbox.attempts < 5
      and outbox.next_attempt_at <= now()
      and (outbox.locked_until is null or outbox.locked_until < now())
    order by outbox.next_attempt_at, outbox.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ), claimed as (
    update public.push_outbox outbox
    set claimed_at = now(),
        locked_until = now() + interval '5 minutes',
        attempts = outbox.attempts + 1
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

-- Outcome of one claimed attempt. p_error null = delivered. p_retry false =
-- permanent (bad payload, every token invalid, no provider configured): the
-- row is closed as dead. p_attempt = the "attempts" value the claim returned;
-- when given and the row has moved on (its lease expired and another drain
-- claimed it), nothing changes and 'stale' is returned.
-- Returns 'sent', 'retry', 'dead', 'stale' or 'missing'.
create or replace function public.push_outbox_record(
  p_id uuid,
  p_error text default null,
  p_retry boolean default true,
  p_attempt integer default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data public.push_outbox%rowtype;
  clean_error text := nullif(left(btrim(coalesce(p_error, '')), 500), '');
begin
  select * into row_data from public.push_outbox where id = p_id for update;
  if not found then
    return 'missing';
  end if;
  if row_data.sent_at is not null or row_data.dead_at is not null
     or (p_attempt is not null and row_data.attempts is distinct from p_attempt) then
    return 'stale';
  end if;

  if clean_error is null then
    update public.push_outbox
    set sent_at = now(), locked_until = null, last_error = null
    where id = p_id;
    return 'sent';
  end if;

  if p_retry is false or row_data.attempts >= 5 or row_data.created_at < now() - interval '1 day' then
    update public.push_outbox
    set dead_at = now(), locked_until = null, last_error = clean_error
    where id = p_id;
    return 'dead';
  end if;

  update public.push_outbox
  set locked_until = null,
      last_error = clean_error,
      next_attempt_at = now() + least(interval '30 minutes',
        interval '30 seconds' * power(2, greatest(row_data.attempts, 1) - 1))
  where id = p_id;
  return 'retry';
end;
$$;

-- Kept for a send-native-push deployed before this migration.
create or replace function public.push_outbox_finish(p_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.push_outbox_record(p_id, p_error, true, null);
end;
$$;

create or replace function public.push_outbox_cleanup(p_keep_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.push_outbox
  where (sent_at is not null and sent_at < now() - make_interval(days => greatest(coalesce(p_keep_days, 14), 1)))
     or (dead_at is not null and dead_at < now() - make_interval(days => greatest(coalesce(p_keep_days, 14), 1)));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.push_outbox_claim(integer) from public;
revoke all on function public.push_outbox_record(uuid, text, boolean, integer) from public;
revoke all on function public.push_outbox_finish(uuid, text) from public;
revoke all on function public.push_outbox_cleanup(integer) from public;
do $$ begin
  revoke all on function public.push_outbox_claim(integer) from anon, authenticated;
  revoke all on function public.push_outbox_record(uuid, text, boolean, integer) from anon, authenticated;
  revoke all on function public.push_outbox_finish(uuid, text) from anon, authenticated;
  revoke all on function public.push_outbox_cleanup(integer) from anon, authenticated;
exception when undefined_object then null;
end $$;
do $$ begin
  grant execute on function public.push_outbox_claim(integer) to service_role;
  grant execute on function public.push_outbox_record(uuid, text, boolean, integer) to service_role;
  grant execute on function public.push_outbox_finish(uuid, text) to service_role;
  grant execute on function public.push_outbox_cleanup(integer) to service_role;
exception when undefined_object then null;
end $$;

-- ===========================================================================
-- 3. Kicking the drain (pg_net + Vault, both optional)
-- ===========================================================================

-- One row: when the drain was last kicked. Only the definer functions use it.
create table if not exists public.push_drain_state (
  id boolean primary key default true check (id),
  last_kick_at timestamptz
);
insert into public.push_drain_state (id) values (true) on conflict (id) do nothing;
alter table public.push_drain_state enable row level security;
revoke all on public.push_drain_state from public;
do $$ begin
  revoke all on public.push_drain_state from anon, authenticated;
exception when undefined_object then null;
end $$;

-- Returns true when a request to send-native-push was queued. p_min_interval
-- skips the call when another kick happened that recently (or is being made
-- by a concurrent transaction right now). Never raises.
create or replace function public.kunthai_kick_native_push(p_min_interval interval default interval '0 seconds')
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  function_url text;
  drain_secret text;
  last_kick timestamptz;
begin
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null
     or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;

  execute $sql$
    select
      max(decrypted_secret) filter (where name = 'kunthai_push_function_url'),
      coalesce(max(decrypted_secret) filter (where name = 'kunthai_push_drain_secret'),
               max(decrypted_secret) filter (where name = 'push_drain_secret'))
    from vault.decrypted_secrets
    where name in ('kunthai_push_function_url', 'kunthai_push_drain_secret', 'push_drain_secret')
  $sql$ into function_url, drain_secret;

  function_url := btrim(coalesce(function_url, ''));
  drain_secret := btrim(coalesce(drain_secret, ''));
  if function_url !~* '^https://' or drain_secret = '' then
    return false;
  end if;

  -- A concurrent transaction holding the row is kicking already.
  select state.last_kick_at into last_kick
  from public.push_drain_state state
  where state.id
  for update skip locked;
  if not found then
    return false;
  end if;
  if last_kick is not null and last_kick > now() - coalesce(p_min_interval, interval '0 seconds') then
    return false;
  end if;

  execute 'select net.http_post(url := $1, body := $2, params := $3, headers := $4, timeout_milliseconds := $5)'
    using function_url,
          '{}'::jsonb,
          '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', drain_secret),
          10000;
  update public.push_drain_state set last_kick_at = now() where id;
  return true;
exception when others then
  -- Never reveal secrets; the reason is enough to debug.
  raise warning 'kunthai_kick_native_push skipped: %', sqlstate;
  return false;
end;
$$;

revoke all on function public.kunthai_kick_native_push(interval) from public;
do $$ begin
  revoke all on function public.kunthai_kick_native_push(interval) from anon, authenticated;
exception when undefined_object then null;
end $$;

create or replace function public.push_outbox_kick_drain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    if exists (select 1 from new_outbox_rows) then
      perform public.kunthai_kick_native_push(interval '2 seconds');
    end if;
  exception when others then
    raise warning 'push_outbox_kick_drain skipped: %', sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.push_outbox_kick_drain() from public;
do $$ begin
  revoke all on function public.push_outbox_kick_drain() from anon, authenticated;
exception when undefined_object then null;
end $$;

drop trigger if exists push_outbox_kick_drain on public.push_outbox;
create trigger push_outbox_kick_drain
  after insert on public.push_outbox
  referencing new table as new_outbox_rows
  for each statement execute function public.push_outbox_kick_drain();

-- ===========================================================================
-- 4. Admin campaigns -> native push
-- ===========================================================================

-- Campaigns are announcements: push must be on (and marketing alerts for a
-- marketing campaign); blocks and Explore alert switches do not apply.
create or replace function public.push_campaign_recipient_allows(p_recipient uuid, p_category text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  prefs jsonb;
begin
  if p_recipient is null then
    return false;
  end if;
  if not exists (select 1 from public.push_device_tokens where user_id = p_recipient) then
    return false;
  end if;
  select to_jsonb(preference) into prefs
  from public.user_notification_preferences preference
  where preference.user_id = p_recipient;
  if prefs is null or coalesce(prefs ->> 'push_enabled', 'false') <> 'true' then
    return false;
  end if;
  if lower(coalesce(p_category, '')) = 'marketing' and coalesce(prefs ->> 'marketing_enabled', 'true') = 'false' then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.push_campaign_recipient_allows(uuid, text) from public;
do $$ begin
  revoke all on function public.push_campaign_recipient_allows(uuid, text) from anon, authenticated;
exception when undefined_object then null;
end $$;

-- Where a tap on a campaign push lands: the app's notifications for
-- Explore / platform-wide campaigns, UrMall or UrRide for their sectors.
create or replace function public.push_campaign_route(p_sector text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(coalesce(p_sector, ''))
    when 'marketplace' then 'urmall'
    when 'transport' then 'urride'
    else 'notifications'
  end
$$;

create or replace function public.push_queue_campaign_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
    select delivery.user_id,
           coalesce(nullif(public.push_short_text(delivery.data ->> 'title', 100), ''), 'KunThai'),
           public.push_short_text(delivery.data ->> 'body', 180),
           public.push_campaign_route(delivery.data ->> 'sector'),
           'announcement',
           'campaign:' || (delivery.data ->> 'campaign_id') || ':' || delivery.user_id::text
    from (
      select inserted.user_id, to_jsonb(inserted) as data
      from new_platform_notifications inserted
      where inserted.campaign_id is not null
    ) delivery
    where coalesce(delivery.data -> 'channels', '[]'::jsonb) ? 'push'
      and coalesce((delivery.data ->> 'expires_at')::timestamptz > now(), true)
      and public.push_campaign_recipient_allows(delivery.user_id, delivery.data ->> 'category')
    on conflict (dedupe_key) do nothing;
  exception when others then
    raise warning 'push_queue_campaign_notifications skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.push_queue_campaign_notifications() from public;
do $$ begin
  revoke all on function public.push_queue_campaign_notifications() from anon, authenticated;
exception when undefined_object then null;
end $$;

do $$
begin
  if to_regclass('public.platform_notifications') is not null then
    execute 'drop trigger if exists push_queue_campaign_notifications on public.platform_notifications';
    execute 'create trigger push_queue_campaign_notifications after insert on public.platform_notifications
             referencing new table as new_platform_notifications
             for each statement execute function public.push_queue_campaign_notifications()';
  else
    raise notice 'native push: public.platform_notifications not found; campaign pushes are not queued';
  end if;
end $$;

-- ===========================================================================
-- 5. Schedules (pg_cron, optional)
-- ===========================================================================

do $$
declare
  job_name text;
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null then
    raise notice 'native push: pg_cron is not installed; enable it and re-run this migration to schedule the drain and cleanup';
    return;
  end if;
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise notice 'native push: pg_net is not installed; the drain job is scheduled but does nothing until pg_net is enabled';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'native push: Vault is not available; the drain job does nothing until it is';
  end if;

  foreach job_name in array array['kunthai-native-push-drain', 'kunthai-native-push-cleanup'] loop
    if to_regclass('cron.job') is not null then
      execute 'select cron.unschedule(jobid) from cron.job where jobname = $1' using job_name;
    end if;
  end loop;

  perform cron.schedule('kunthai-native-push-drain', '* * * * *', 'select public.kunthai_kick_native_push()');
  perform cron.schedule('kunthai-native-push-cleanup', '17 3 * * *', 'select public.push_outbox_cleanup(14)');
exception when others then
  raise notice 'native push: could not schedule the pg_cron jobs (%); schedule them by hand as in docs/2026-10-11-native-push-delivery.md', sqlerrm;
end $$;

commit;
