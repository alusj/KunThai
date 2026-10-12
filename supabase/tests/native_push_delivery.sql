-- Run ONLY against the disposable native_push_delivery_test database:
-- psql -h /tmp -p 55432 -U pgtest -d native_push_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/native_push_delivery.sql
-- Needs the dblink extension (contrib) for the concurrent-claim check.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'native_push_delivery_test' then raise exception 'This fixture requires the disposable native_push_delivery_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists net cascade;
drop schema if exists vault cascade;
drop schema if exists cron cascade;
drop schema if exists testkit cascade;
create schema public;
create schema auth;
create schema testkit;
create extension if not exists dblink schema testkit;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
alter role service_role bypassrls; -- as on Supabase
grant usage on schema public to authenticated, anon, service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, service_role;
create table auth.users(id uuid primary key);

-- Minimal stand-ins for the tables and helpers the migrations build on.
create table public.explore_profiles(user_id uuid primary key references auth.users on delete cascade, display_name text not null default 'Profile');
create table public.explore_user_blocks(blocker_id uuid not null, blocked_id uuid not null, unique (blocker_id, blocked_id));
create table public.explore_identity_blocks(blocker_user_id uuid not null, target_type text not null, target_profile_user_id uuid, target_space_id uuid);
create table public.user_notification_preferences(user_id uuid primary key references auth.users on delete cascade, push_enabled boolean not null default false,
  social_enabled boolean not null default true, commerce_enabled boolean not null default true, marketing_enabled boolean not null default true);
create table public.explore_user_preferences(user_id uuid primary key references auth.users on delete cascade, settings jsonb not null default '{}'::jsonb);
create table public.explore_notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null, actor_user_id uuid, actor_name text not null default 'Someone',
  type text not null, message text not null default '', actor_space_id uuid, created_at timestamptz not null default now());
create table public.explore_conversations(id uuid primary key default gen_random_uuid(), request boolean not null default false, participant_ids uuid[] not null default '{}', space_id uuid);
create table public.explore_conversation_members(conversation_id uuid not null references public.explore_conversations on delete cascade, user_id uuid not null, unique (conversation_id, user_id));
create table public.explore_messages(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.explore_conversations on delete cascade,
  sender_id uuid not null, body text not null default '', media_type text not null default 'text', metadata jsonb not null default '{}'::jsonb);
create table public.marketplace_orders(id uuid primary key default gen_random_uuid(), buyer_id uuid, status text not null default 'pending');
-- Campaign deliveries as 20260627120000 / 20260827120000 / 20260917120000 define them.
create table public.platform_notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  campaign_id uuid, sector text not null default 'platform', notification_type text not null default 'admin_message', title text not null, body text not null,
  category text not null default 'system', channels text[] not null default array['in_app']::text[], expires_at timestamptz, created_at timestamptz not null default now());
create unique index platform_notifications_campaign_user_idx on public.platform_notifications(campaign_id, user_id) where campaign_id is not null;

create function public.explore_has_blocked(p_blocker uuid, p_target_user uuid, p_target_space uuid default null) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_blocker is not null and (
    (p_target_user is not null and p_target_user <> p_blocker and (
      exists (select 1 from public.explore_user_blocks block where block.blocker_id = p_blocker and block.blocked_id = p_target_user)
      or exists (select 1 from public.explore_identity_blocks block where block.blocker_user_id = p_blocker and block.target_type = 'profile' and block.target_profile_user_id = p_target_user)))
    or (p_target_space is not null and exists (select 1 from public.explore_identity_blocks block where block.blocker_user_id = p_blocker and block.target_type = 'space' and block.target_space_id = p_target_space))) $$;
create function public.explore_try_uuid(p_value text) returns uuid language sql immutable set search_path = public, pg_temp as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid else null end $$;

-- Users: ...01 push on + 2 devices, ...02 actor, ...03 push off + device, ...04 push on no device,
-- ...05 blocked by ...01, ...06 push on + device, marketing alerts off.
insert into auth.users select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 6) n;
insert into public.explore_profiles(user_id, display_name) values ('00000000-0000-4000-8000-000000000002', 'Amara');
insert into public.user_notification_preferences(user_id, push_enabled, marketing_enabled) values
  ('00000000-0000-4000-8000-000000000001', true, true), ('00000000-0000-4000-8000-000000000003', false, true),
  ('00000000-0000-4000-8000-000000000004', true, true), ('00000000-0000-4000-8000-000000000006', true, false);
insert into public.explore_user_blocks values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005');

-- No pg_cron, pg_net or Vault yet. Both migrations, twice, in order.
\ir ../migrations/20261009150000_native_push_tokens.sql
\ir ../migrations/20261011100000_native_push_delivery.sql
\ir ../migrations/20261009150000_native_push_tokens.sql
\ir ../migrations/20261011100000_native_push_delivery.sql

insert into public.push_device_tokens(user_id, token, platform) values
  ('00000000-0000-4000-8000-000000000001', 'ios-token-0000000000000001', 'ios'),
  ('00000000-0000-4000-8000-000000000001', 'fcm-token-0000000000000001', 'android'),
  ('00000000-0000-4000-8000-000000000003', 'ios-token-0000000000000003', 'ios'),
  ('00000000-0000-4000-8000-000000000006', 'ios-token-0000000000000006', 'ios');

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
grant execute on function public.test_assert(boolean, text) to authenticated, anon, service_role;
create function public.expect_error(statement text, message text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then return; end;
  raise exception 'TEST FAILED: %', message;
end $$;
grant execute on function public.expect_error(text, text) to authenticated, anon, service_role;
create function public.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  if u = '' then execute 'reset role'; else execute 'set role authenticated'; end if;
end $$;
grant execute on function public.as_user(text) to authenticated, service_role;
create function public.queue_row(p_key text, p_user uuid default '00000000-0000-4000-8000-000000000001') returns uuid language sql as $$
  insert into public.push_outbox(user_id, title, body, route, kind, dedupe_key) values (p_user, 'T', p_key, 'notifications', 'test', p_key) returning id $$;

-- 0. Without pg_net / Vault the kick is a quiet no-op and inserts work.
select test_assert(public.kunthai_kick_native_push() is false, 'no pg_net: the kick does nothing');
select test_assert(public.queue_row('plain-1') is not null, 'an outbox insert works without pg_net');
select test_assert(to_regnamespace('cron') is null, 'no cron schema was invented');

-- 1. Only the service role (and the definer functions) may touch the drain.
select as_user('00000000-0000-4000-8000-000000000001');
select expect_error($$select public.kunthai_kick_native_push()$$, 'a member kicked the drain');
select expect_error($$select public.push_outbox_record(gen_random_uuid())$$, 'a member recorded a push result');
select expect_error($$select public.push_outbox_cleanup(1)$$, 'a member cleaned the queue');
select expect_error($$select * from public.push_outbox_claim(1)$$, 'a member claimed pushes');
select expect_error($$select * from public.push_drain_state$$, 'a member read the drain state');
select expect_error($$select public.push_campaign_recipient_allows('00000000-0000-4000-8000-000000000001')$$, 'a member probed push settings');
select as_user('');
set role anon;
select expect_error($$select public.kunthai_kick_native_push()$$, 'anon kicked the drain');
reset role;
set role service_role;
select expect_error($$select public.kunthai_kick_native_push()$$, 'the service role can not call the kick directly either (cron runs it as the owner)');
reset role;

-- 2. Claims are leased: never handed out twice; a crashed drain's lease expires.
delete from public.push_outbox;
select queue_row('lease-1'), queue_row('lease-2'), queue_row('lease-3');
set role service_role;
create temporary table first_claim on commit preserve rows as select * from public.push_outbox_claim(10);
select test_assert((select count(*) = 3 and bool_and(attempts = 1 and jsonb_array_length(devices) = 2) from first_claim), 'three rows claimed with both devices');
select test_assert((select count(*) = 0 from public.push_outbox_claim(10)), 'leased rows are not claimed again');
reset role;
select test_assert((select bool_and(locked_until between now() + interval '4 minutes' and now() + interval '6 minutes') from public.push_outbox), 'a claim leases rows for about 5 minutes');
update public.push_outbox set locked_until = now() - interval '1 second' where dedupe_key = 'lease-1';
set role service_role;
select test_assert((select count(*) = 1 and bool_and(attempts = 2) from public.push_outbox_claim(10)), 'an expired lease is claimed again as attempt 2');
select test_assert(public.push_outbox_record((select id from public.push_outbox where dedupe_key = 'lease-1'), null, true, 1) = 'stale', 'a result from the crashed attempt is ignored');
select test_assert(public.push_outbox_record((select id from public.push_outbox where dedupe_key = 'lease-1'), null, true, 2) = 'sent', 'the current attempt is recorded');
select test_assert(public.push_outbox_record((select id from public.push_outbox where dedupe_key = 'lease-1'), 'late error', true, 2) = 'stale', 'a sent row is never reopened');
reset role;
select test_assert((select sent_at is not null and locked_until is null and last_error is null from public.push_outbox where dedupe_key = 'lease-1'), 'a delivered row is closed');
drop table first_claim;

-- 3. Two drains at the same time never get the same row (FOR UPDATE SKIP LOCKED).
delete from public.push_outbox;
select queue_row('race-' || n) from generate_series(1, 6) n;
select testkit.dblink_connect('other_drain', 'dbname=' || current_database() || ' host=/tmp port=' || current_setting('port') || ' user=' || current_user);
select testkit.dblink_exec('other_drain', 'begin');
select testkit.dblink_exec('other_drain', 'set local role service_role');
create temporary table other_claim as
  select * from testkit.dblink('other_drain', 'select id from public.push_outbox_claim(4)') as claimed(id uuid);
select test_assert((select count(*) = 4 from other_claim), 'the other drain holds four uncommitted claims');
set role service_role;
create temporary table my_claim as select id from public.push_outbox_claim(10);
reset role;
select test_assert((select count(*) = 2 from my_claim), 'this drain only gets the two rows nobody holds');
select test_assert(not exists (select 1 from my_claim join other_claim using (id)), 'no row is claimed by both drains');
select testkit.dblink_exec('other_drain', 'commit');
select testkit.dblink_disconnect('other_drain');
set role service_role;
select test_assert((select count(*) = 0 from public.push_outbox_claim(10)), 'after the other drain commits nothing is left to claim');
reset role;
select test_assert((select count(*) = 6 and bool_and(attempts = 1) from public.push_outbox), 'each row was attempted exactly once');
drop table other_claim;
drop table my_claim;

-- 4. Retries back off; permanent errors and the 5th failure close the row.
delete from public.push_outbox;
select queue_row('retry-1'), queue_row('dead-permanent'), queue_row('dead-max');
set role service_role;
select count(*) from public.push_outbox_claim(10);
select test_assert(public.push_outbox_record((select id from public.push_outbox where dedupe_key = 'retry-1'), 'APNs 503', true, 1) = 'retry', 'a temporary error is retried');
reset role;
select test_assert((select next_attempt_at between now() + interval '25 seconds' and now() + interval '35 seconds' and locked_until is null and last_error = 'APNs 503' and sent_at is null and dead_at is null
  from public.push_outbox where dedupe_key = 'retry-1'), 'the first retry waits about 30 seconds');
set role service_role;
select test_assert((select count(*) = 0 from public.push_outbox_claim(10) where id = (select id from public.push_outbox where dedupe_key = 'retry-1')), 'a row is not retried before its time');
reset role;
update public.push_outbox set next_attempt_at = now() - interval '1 second' where dedupe_key = 'retry-1';
set role service_role;
select test_assert((select count(*) = 1 and bool_and(attempts = 2) from public.push_outbox_claim(10)), 'a due retry is claimed as attempt 2');
select public.push_outbox_record((select id from public.push_outbox where dedupe_key = 'retry-1'), 'FCM 500', true, 2);
reset role;
select test_assert((select next_attempt_at between now() + interval '55 seconds' and now() + interval '65 seconds' from public.push_outbox where dedupe_key = 'retry-1'), 'the second retry waits about a minute');
set role service_role;
select test_assert(public.push_outbox_record((select id from public.push_outbox where dedupe_key = 'dead-permanent'), 'APNs 400 BadTopic', false, 1) = 'dead', 'a permanent error is not retried');
reset role;
update public.push_outbox set attempts = 4, locked_until = null where dedupe_key = 'dead-max';
set role service_role;
select test_assert((select count(*) = 1 and bool_and(attempts = 5) from public.push_outbox_claim(10)), 'the last attempt is claimed');
select test_assert(public.push_outbox_record((select id from public.push_outbox where dedupe_key = 'dead-max'), 'APNs 503', true, 5) = 'dead', 'the 5th failure closes the row');
reset role;
select test_assert((select count(*) = 2 and bool_and(dead_at is not null and sent_at is null and locked_until is null) from public.push_outbox where dedupe_key like 'dead-%'), 'dead rows are closed, not sent');
update public.push_outbox set next_attempt_at = now() - interval '1 second' where dead_at is not null;
set role service_role;
select test_assert((select count(*) = 0 from public.push_outbox_claim(10) where id in (select id from public.push_outbox where dead_at is not null)), 'dead rows are never claimed');
reset role;
-- Day-old rows expire.
select queue_row('old-1');
update public.push_outbox set created_at = now() - interval '2 days' where dedupe_key = 'old-1';
set role service_role;
select test_assert((select count(*) = 0 from public.push_outbox_claim(10) where id = (select id from public.push_outbox where dedupe_key = 'old-1')), 'a day-old row is not sent');
reset role;
select test_assert((select dead_at is not null and last_error = 'expired' from public.push_outbox where dedupe_key = 'old-1'), 'a day-old row is closed as expired');
-- The older two-argument finish still works and uses the same rules.
select queue_row('legacy-1');
set role service_role;
select count(*) from public.push_outbox_claim(10) where id = (select id from public.push_outbox where dedupe_key = 'legacy-1');
select public.push_outbox_finish((select id from public.push_outbox where dedupe_key = 'legacy-1'), 'APNs 500');
reset role;
select test_assert((select sent_at is null and dead_at is null and next_attempt_at > now() and last_error = 'APNs 500' from public.push_outbox where dedupe_key = 'legacy-1'), 'push_outbox_finish(id, error) schedules a retry');
update public.push_outbox set next_attempt_at = now() - interval '1 second' where dedupe_key = 'legacy-1';
set role service_role;
select count(*) from public.push_outbox_claim(10) where id = (select id from public.push_outbox where dedupe_key = 'legacy-1');
select public.push_outbox_finish((select id from public.push_outbox where dedupe_key = 'legacy-1'), null);
reset role;
select test_assert((select sent_at is not null from public.push_outbox where dedupe_key = 'legacy-1'), 'push_outbox_finish(id, null) marks the row sent');

-- 5. Cleanup removes only old closed rows.
update public.push_outbox set sent_at = now() - interval '20 days' where dedupe_key = 'legacy-1';
update public.push_outbox set dead_at = now() - interval '20 days' where dedupe_key = 'dead-max';
set role service_role;
select test_assert(public.push_outbox_cleanup(14) = 2, 'two old closed rows removed');
reset role;
select test_assert(exists (select 1 from public.push_outbox where dedupe_key = 'dead-permanent') and exists (select 1 from public.push_outbox where dedupe_key = 'retry-1'),
  'recent dead rows and pending rows stay');

-- 6. Campaigns: one push per allowed recipient, never twice.
delete from public.push_outbox;
insert into public.platform_notifications(user_id, campaign_id, sector, title, body, category, channels)
select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '50000000-0000-4000-8000-000000000001', 'platform',
  'Big news', 'KunThai has a   new look', 'announcement', array['in_app', 'push']
from generate_series(1, 6) n;
select test_assert((select count(*) = 2 from public.push_outbox), 'push on + device: users 01 and 06 get the campaign');
select test_assert((select bool_and(kind = 'announcement' and route = 'notifications' and title = 'Big news' and body = 'KunThai has a new look'
  and dedupe_key = 'campaign:50000000-0000-4000-8000-000000000001:' || user_id::text) from public.push_outbox), 'campaign push content, route and dedupe key');
-- Republishing (the delivery rows already exist) and a retried publish queue nothing new.
insert into public.platform_notifications(user_id, campaign_id, sector, title, body, channels)
select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '50000000-0000-4000-8000-000000000001', 'platform', 'Big news', 'again', array['push']
from generate_series(1, 6) n
on conflict (campaign_id, user_id) where campaign_id is not null do nothing;
delete from public.platform_notifications where campaign_id = '50000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-4000-8000-000000000001';
insert into public.platform_notifications(user_id, campaign_id, sector, title, body, channels)
values ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'platform', 'Big news', 'again', array['push']);
select test_assert((select count(*) = 2 from public.push_outbox), 'a campaign is pushed to each recipient once');
-- Marketing campaigns respect marketing alerts; sectors route to their service.
insert into public.platform_notifications(user_id, campaign_id, sector, title, body, category, channels) values
  ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'marketplace', 'Sale', 'Deals', 'marketing', array['push']),
  ('00000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000002', 'marketplace', 'Sale', 'Deals', 'marketing', array['push']),
  ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'transport', 'Rides', 'New', 'system', array['push']);
select test_assert((select count(*) = 1 and bool_and(route = 'urmall') from public.push_outbox where dedupe_key like 'campaign:50000000-0000-4000-8000-000000000002:%'), 'marketing off: skipped; UrMall campaigns route to UrMall');
select test_assert((select route = 'urride' from public.push_outbox where dedupe_key like 'campaign:50000000-0000-4000-8000-000000000003:%'), 'UrRide campaigns route to UrRide');
-- In-app only, expired, test sends (no campaign) and ordinary notifications queue nothing.
insert into public.platform_notifications(user_id, campaign_id, title, body, channels, expires_at) values
  ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 'In app', 'only', array['in_app'], null),
  ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', 'Expired', 'gone', array['push'], now() - interval '1 minute'),
  ('00000000-0000-4000-8000-000000000001', null, '[TEST] Big news', 'test', array['push'], null);
select test_assert((select count(*) = 4 from public.push_outbox), 'in-app only, expired and test notifications are not pushed');
-- A failing helper never blocks the delivery rows.
alter function public.push_campaign_recipient_allows(uuid, text) rename to push_campaign_recipient_allows_moved;
insert into public.platform_notifications(user_id, campaign_id, title, body, channels)
values ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000006', 'Still', 'delivered', array['push']);
alter function public.push_campaign_recipient_allows_moved(uuid, text) rename to push_campaign_recipient_allows;
select test_assert(exists (select 1 from public.platform_notifications where campaign_id = '50000000-0000-4000-8000-000000000006'), 'the campaign delivery is saved even when queueing fails');

-- 7. With pg_cron, pg_net and Vault (stand-ins with the real signatures).
create schema net;
create table net.test_requests(id bigserial primary key, url text, body jsonb, headers jsonb, timeout_milliseconds integer);
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language plpgsql as $$
declare request_id bigint;
begin
  if current_setting('test.net_fails', true) = 'on' then raise exception 'pg_net is down'; end if;
  insert into net.test_requests(url, body, headers, timeout_milliseconds) values (url, body, headers, timeout_milliseconds) returning id into request_id;
  return request_id;
end $$;
create schema vault;
create table vault.test_store(name text primary key, secret text not null);
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.test_store;
create schema cron;
create table cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create function cron.unschedule(job_id bigint) returns boolean language sql as $$ delete from cron.job where jobid = job_id returning true $$;
insert into cron.job(jobname, schedule, command) values ('someone-elses-job', '0 * * * *', 'select 1');

\ir ../migrations/20261011100000_native_push_delivery.sql
\ir ../migrations/20261011100000_native_push_delivery.sql
select test_assert((select count(*) = 3 from cron.job), 're-running schedules each job once and leaves other jobs alone');
select test_assert(exists (select 1 from cron.job where jobname = 'kunthai-native-push-drain' and schedule = '* * * * *' and command = 'select public.kunthai_kick_native_push()'), 'the drain runs every minute');
select test_assert(exists (select 1 from cron.job where jobname = 'kunthai-native-push-cleanup' and command = 'select public.push_outbox_cleanup(14)'), 'the cleanup runs daily');
select test_assert((select count(*) = 0 from net.test_requests), 'no secrets in Vault yet: nothing is called');
select test_assert(public.kunthai_kick_native_push() is false, 'without Vault secrets the kick does nothing');

insert into vault.test_store values ('kunthai_push_function_url', 'https://example-project.supabase.co/functions/v1/send-native-push'), ('kunthai_push_drain_secret', 'test-drain-secret');
update public.push_drain_state set last_kick_at = null;
select queue_row('kick-1');
select test_assert((select count(*) = 1 from net.test_requests), 'a new outbox row kicks the drain');
select test_assert((select url = 'https://example-project.supabase.co/functions/v1/send-native-push' and headers ->> 'x-push-secret' = 'test-drain-secret'
  and headers ->> 'Content-Type' = 'application/json' from net.test_requests), 'the kick posts to the function with the drain secret header');
select queue_row('kick-2');
select test_assert((select count(*) = 1 from net.test_requests), 'a second insert within 2 seconds does not call again');
update public.push_drain_state set last_kick_at = now() - interval '1 minute';
insert into public.push_outbox(user_id, dedupe_key) values ('00000000-0000-4000-8000-000000000001', 'kick-1') on conflict (dedupe_key) do nothing;
select test_assert((select count(*) = 1 from net.test_requests), 'an insert that adds no row does not kick');
-- One statement with many rows makes one call.
insert into public.push_outbox(user_id, dedupe_key) select '00000000-0000-4000-8000-000000000001', 'bulk-' || n from generate_series(1, 50) n;
select test_assert((select count(*) = 2 from net.test_requests), 'a bulk insert makes a single call');
-- The cron job's call is not throttled.
select test_assert(public.kunthai_kick_native_push() is true, 'the scheduled kick calls the function');
select test_assert((select count(*) = 3 from net.test_requests), 'the scheduled kick queued a request');
-- A campaign publish to many recipients kicks once.
update public.push_drain_state set last_kick_at = null;
insert into public.platform_notifications(user_id, campaign_id, title, body, channels)
select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '50000000-0000-4000-8000-000000000007', 'Hello', 'All', array['push'] from generate_series(1, 6) n;
select test_assert((select count(*) = 4 from net.test_requests), 'a campaign publish makes one call');
-- A direct message queues a push and kicks too.
update public.push_drain_state set last_kick_at = null;
insert into public.explore_conversations(id, participant_ids) values
  ('30000000-0000-4000-8000-000000000001', array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[]);
insert into public.explore_messages(conversation_id, sender_id, body) values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Hi');
select test_assert((select count(*) = 5 from net.test_requests) and exists (select 1 from public.push_outbox where route = 'conversation:30000000-0000-4000-8000-000000000001'), 'a message is queued and kicks the drain');
-- The older Vault secret name works too.
delete from vault.test_store where name = 'kunthai_push_drain_secret';
insert into vault.test_store values ('push_drain_secret', 'legacy-secret');
select test_assert(public.kunthai_kick_native_push() is true, 'the push_drain_secret name is accepted');
select test_assert((select headers ->> 'x-push-secret' = 'legacy-secret' from net.test_requests order by id desc limit 1), 'the push_drain_secret value is sent');
-- A non-https URL is refused.
update vault.test_store set secret = 'http://insecure.example/functions/v1/send-native-push' where name = 'kunthai_push_function_url';
select test_assert(public.kunthai_kick_native_push() is false, 'a non-https function URL is never called');
update vault.test_store set secret = 'https://example-project.supabase.co/functions/v1/send-native-push' where name = 'kunthai_push_function_url';

-- 8. A failing pg_net never fails the insert.
set test.net_fails = 'on';
update public.push_drain_state set last_kick_at = null;
select test_assert(public.queue_row('net-down-1') is not null, 'the outbox insert succeeds while pg_net fails');
select test_assert(public.kunthai_kick_native_push() is false, 'the kick reports false while pg_net fails');
select test_assert((select last_kick_at is null from public.push_drain_state), 'a failed kick is not counted as a kick');
reset test.net_fails;
-- A broken Vault view is skipped too.
drop view vault.decrypted_secrets;
create view vault.decrypted_secrets as select name, (secret::integer)::text as decrypted_secret from vault.test_store;
select test_assert(public.queue_row('vault-broken-1') is not null, 'the outbox insert succeeds while Vault fails');
select test_assert(public.kunthai_kick_native_push() is false, 'the kick reports false while Vault fails');

select 'native_push_delivery: all tests passed' as result;
