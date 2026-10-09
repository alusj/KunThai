-- Run ONLY against the disposable push_device_tokens_test database:
-- psql -h /tmp -p 55432 -U pgtest -d push_device_tokens_test -v ON_ERROR_STOP=1 -f supabase/tests/native_push_tokens.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'push_device_tokens_test' then raise exception 'This fixture requires the disposable push_device_tokens_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
alter role service_role bypassrls; -- as on Supabase
grant usage on schema public to authenticated, anon, service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, service_role;
create table auth.users(id uuid primary key);

-- Minimal stand-ins for the tables and helpers the migration builds on.
create table public.explore_profiles(user_id uuid primary key references auth.users on delete cascade, display_name text not null default 'Profile');
create table public.explore_user_blocks(blocker_id uuid not null, blocked_id uuid not null, unique (blocker_id, blocked_id));
create table public.explore_identity_blocks(blocker_user_id uuid not null, target_type text not null, target_profile_user_id uuid, target_space_id uuid);
create table public.user_notification_preferences(user_id uuid primary key references auth.users on delete cascade, push_enabled boolean not null default false,
  social_enabled boolean not null default true, commerce_enabled boolean not null default true);
create table public.explore_user_preferences(user_id uuid primary key references auth.users on delete cascade, settings jsonb not null default '{}'::jsonb);
create table public.explore_notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null, actor_user_id uuid, actor_name text not null default 'Someone',
  type text not null, message text not null default '', actor_space_id uuid, created_at timestamptz not null default now());
create table public.explore_conversations(id uuid primary key default gen_random_uuid(), request boolean not null default false, participant_ids uuid[] not null default '{}', space_id uuid);
create table public.explore_conversation_members(conversation_id uuid not null references public.explore_conversations on delete cascade, user_id uuid not null, unique (conversation_id, user_id));
create table public.explore_messages(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.explore_conversations on delete cascade,
  sender_id uuid not null, body text not null default '', media_type text not null default 'text', metadata jsonb not null default '{}'::jsonb);
create table public.marketplace_orders(id uuid primary key default gen_random_uuid(), buyer_id uuid, status text not null default 'pending');

-- As 20261009120000_explore_messages_fixes.sql defines them.
create function public.explore_has_blocked(p_blocker uuid, p_target_user uuid, p_target_space uuid default null) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_blocker is not null and (
    (p_target_user is not null and p_target_user <> p_blocker and (
      exists (select 1 from public.explore_user_blocks block where block.blocker_id = p_blocker and block.blocked_id = p_target_user)
      or exists (select 1 from public.explore_identity_blocks block where block.blocker_user_id = p_blocker and block.target_type = 'profile' and block.target_profile_user_id = p_target_user)))
    or (p_target_space is not null and exists (select 1 from public.explore_identity_blocks block where block.blocker_user_id = p_blocker and block.target_type = 'space' and block.target_space_id = p_target_space))) $$;
create function public.explore_try_uuid(p_value text) returns uuid language sql immutable set search_path = public, pg_temp as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid else null end $$;

-- Users: ...01 recipient with push on, ...02 actor, ...03 push off, ...04 no device, ...05 blocked by ...01, ...06 reactions switched off
insert into auth.users select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 6) n;
insert into public.explore_profiles(user_id, display_name) values ('00000000-0000-4000-8000-000000000002', 'Amara'), ('00000000-0000-4000-8000-000000000005', 'Blocked');
insert into public.user_notification_preferences(user_id, push_enabled) values
  ('00000000-0000-4000-8000-000000000001', true), ('00000000-0000-4000-8000-000000000003', false),
  ('00000000-0000-4000-8000-000000000004', true), ('00000000-0000-4000-8000-000000000006', true);
insert into public.explore_user_preferences(user_id, settings) values ('00000000-0000-4000-8000-000000000006', '{"notifications":{"reactions":false}}');
insert into public.explore_user_blocks values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005');

\ir ../migrations/20261009150000_native_push_tokens.sql
-- Re-runnable.
\ir ../migrations/20261009150000_native_push_tokens.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  if u = '' then execute 'reset role'; else execute 'set role authenticated'; end if;
end $$;
grant execute on function public.as_user(text) to authenticated, service_role;
grant execute on function public.test_assert(boolean, text) to authenticated, service_role;
create function public.expect_error(statement text, message text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then return; end;
  raise exception 'TEST FAILED: %', message;
end $$;
grant execute on function public.expect_error(text, text) to authenticated;
create function public.changed_rows(statement text) returns integer language plpgsql as $$
declare n integer; begin execute statement; get diagnostics n = row_count; return n; end $$;
grant execute on function public.changed_rows(text) to authenticated;

-- 1. Device tokens: register, upsert by token, own-row RLS, unregister.
select as_user('00000000-0000-4000-8000-000000000001');
select register_push_device_token('ios-token-0000000000000001', 'ios');
select register_push_device_token('ios-token-0000000000000001', 'ios');
select test_assert((select count(*) = 1 from public.push_device_tokens), 'registering twice keeps one row');
select expect_error($$select register_push_device_token('short', 'ios')$$, 'a too-short token was accepted');
select expect_error($$select register_push_device_token('web-token-00000000000000001', 'web')$$, 'an unknown platform was accepted');
select expect_error($$insert into public.push_device_tokens(user_id, token, platform) values ('00000000-0000-4000-8000-000000000002', 'stolen-token-000000000000001', 'ios')$$, 'a member saved a token for someone else');
select as_user('00000000-0000-4000-8000-000000000002');
select test_assert((select count(*) = 0 from public.push_device_tokens), 'a member cannot see someone else''s tokens');
select test_assert(changed_rows($$delete from public.push_device_tokens where token = 'ios-token-0000000000000001'$$) = 0, 'a member cannot delete someone else''s token');
select unregister_push_device_token('ios-token-0000000000000001');
select as_user('');
select test_assert((select count(*) = 1 from public.push_device_tokens), 'unregister only removes the caller''s own token');
-- The same phone signs in to another account: the token moves.
select as_user('00000000-0000-4000-8000-000000000002');
select register_push_device_token('ios-token-0000000000000001', 'ios');
select as_user('');
select test_assert((select user_id = '00000000-0000-4000-8000-000000000002' from public.push_device_tokens where token = 'ios-token-0000000000000001'), 'a token moves to the account signed in on the device');
select as_user('00000000-0000-4000-8000-000000000002');
select unregister_push_device_token('ios-token-0000000000000001');
select as_user('');
select test_assert((select count(*) = 0 from public.push_device_tokens), 'sign-out removes the token');
set role anon;
select expect_error($$select register_push_device_token('anon-token-00000000000000001', 'android')$$, 'a signed-out caller registered a token');
reset role;

-- Devices: ...01, ...03, ...06 (...04 has none).
insert into public.push_device_tokens(user_id, token, platform) values
  ('00000000-0000-4000-8000-000000000001', 'ios-token-0000000000000001', 'ios'),
  ('00000000-0000-4000-8000-000000000001', 'fcm-token-0000000000000001', 'android'),
  ('00000000-0000-4000-8000-000000000003', 'ios-token-0000000000000003', 'ios'),
  ('00000000-0000-4000-8000-000000000006', 'ios-token-0000000000000006', 'ios');

-- 2. Queueing from explore_notifications.
insert into public.explore_notifications(user_id, actor_user_id, actor_name, type, message) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Amara', 'like', 'Amara liked your post'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Amara', 'mention', 'Amara mentioned you'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Amara', 'visibility_credit_reward', 'Credits'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Me', 'comment', 'Self'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'Blocked', 'follow', 'Blocked followed you'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Amara', 'like', 'push off'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Amara', 'like', 'no device'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002', 'Amara', 'like', 'reactions off'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002', 'Amara', 'comment', 'Amara commented');
select test_assert((select count(*) = 3 from public.push_outbox), 'only allowed explore notifications are queued');
select test_assert((select count(*) = 2 from public.push_outbox where user_id = '00000000-0000-4000-8000-000000000001' and route = 'notifications' and title = 'Amara'), 'the like and the mention are queued for the recipient');
select test_assert(not exists (select 1 from public.push_outbox where body like 'Blocked%'), 'no push from someone the recipient blocked');
select test_assert(not exists (select 1 from public.push_outbox where user_id in ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004')), 'push off or no device: nothing queued');
select test_assert((select count(*) = 1 from public.push_outbox where user_id = '00000000-0000-4000-8000-000000000006' and kind = 'comments'), 'a switched-off alert type is skipped, others still go');
-- Space blocks count too.
insert into public.explore_identity_blocks values ('00000000-0000-4000-8000-000000000001', 'space', null, '10000000-0000-4000-8000-000000000001');
insert into public.explore_notifications(user_id, actor_user_id, actor_name, type, message, actor_space_id) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Blocked Space', 'comment', 'from a blocked Space', '10000000-0000-4000-8000-000000000001');
select test_assert(not exists (select 1 from public.push_outbox where title = 'Blocked Space'), 'no push from a Space the recipient blocked');

-- 3. Queueing from explore_messages.
delete from public.push_outbox;
insert into public.explore_conversations(id, participant_ids) values
  ('30000000-0000-4000-8000-000000000001', array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[]);
insert into public.explore_conversation_members values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'), ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
insert into public.explore_messages(conversation_id, sender_id, body) values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '  Hello   there ');
insert into public.explore_messages(conversation_id, sender_id, body, media_type) values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '', 'image');
insert into public.explore_messages(conversation_id, sender_id, body, media_type) values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'joined', 'system');
select test_assert((select count(*) = 2 from public.push_outbox), 'messages queue one push per recipient, system notices none');
select test_assert((select bool_and(user_id = '00000000-0000-4000-8000-000000000001' and title = 'Amara' and route = 'conversation:30000000-0000-4000-8000-000000000001') from public.push_outbox), 'message push goes to the other member with the conversation route');
select test_assert(exists (select 1 from public.push_outbox where body = 'Hello there') and exists (select 1 from public.push_outbox where body = 'Sent a photo'), 'message previews');
update public.explore_user_preferences set settings = '{"notifications":{"messages":false}}' where user_id = '00000000-0000-4000-8000-000000000006';
insert into public.explore_conversations(id, participant_ids, request) values
  ('30000000-0000-4000-8000-000000000002', array['00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001']::uuid[], true);
insert into public.explore_messages(conversation_id, sender_id, body) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', 'spam');
select test_assert((select count(*) = 2 from public.push_outbox), 'blocked senders and switched-off message alerts queue nothing');
insert into public.explore_messages(conversation_id, sender_id, body) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'secret');
select test_assert((select body = 'Sent you a message request' from public.push_outbox where route = 'conversation:30000000-0000-4000-8000-000000000002'), 'message requests do not show their text');

-- 4. Marketplace order status changes.
delete from public.push_outbox;
insert into public.marketplace_orders(id, buyer_id) values ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
select test_assert((select count(*) = 0 from public.push_outbox), 'a new order is not a status change');
update public.marketplace_orders set status = 'ready_for_pickup';
update public.marketplace_orders set status = 'ready_for_pickup';
select test_assert((select count(*) = 1 from public.push_outbox where route = 'orders' and body = 'Your order is now: Ready For Pickup'), 'a status change queues one push for the buyer');
update public.user_notification_preferences set commerce_enabled = false where user_id = '00000000-0000-4000-8000-000000000001';
update public.marketplace_orders set status = 'completed';
select test_assert((select count(*) = 1 from public.push_outbox), 'commerce alerts off: no order push');

-- 5. A failing helper never blocks the original insert.
alter function public.explore_has_blocked(uuid, uuid, uuid) rename to explore_has_blocked_moved;
insert into public.explore_notifications(user_id, actor_user_id, actor_name, type, message) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Amara', 'comment', 'still saved');
select test_assert(exists (select 1 from public.explore_notifications where message = 'still saved'), 'the notification is saved even when queueing fails');
alter function public.explore_has_blocked_moved(uuid, uuid, uuid) rename to explore_has_blocked;

-- 6. The queue is private; only the service role drains it.
select as_user('00000000-0000-4000-8000-000000000001');
select expect_error($$select count(*) from public.push_outbox$$, 'a member read the push queue');
select expect_error($$select * from public.push_outbox_claim(10)$$, 'a member claimed pushes');
select expect_error($$select push_recipient_allows('00000000-0000-4000-8000-000000000001', 'social')$$, 'a member probed someone''s push settings');
select as_user('');
set role service_role;
select test_assert((select count(*) = 1 and bool_and(attempts = 1 and jsonb_array_length(devices) = 2) from public.push_outbox_claim(10)), 'the service role claims rows with the recipient''s devices');
select test_assert((select count(*) = 0 from public.push_outbox_claim(10)), 'claimed rows are not handed out twice');
select push_outbox_finish((select id from public.push_outbox limit 1), 'APNs 500');
select test_assert((select count(*) = 1 from public.push_outbox_claim(10)), 'a failed row is retried');
select push_outbox_finish((select id from public.push_outbox limit 1), null);
select test_assert((select sent_at is not null and last_error is null from public.push_outbox), 'a delivered row is marked sent');
select test_assert((select count(*) = 0 from public.push_outbox_claim(10)), 'sent rows are not claimed again');
reset role;
update public.push_outbox set sent_at = null, claimed_at = null, attempts = 5;
set role service_role;
select test_assert((select count(*) = 0 from public.push_outbox_claim(10)), 'rows tried 5 times are given up');
reset role;
select test_assert((select last_error = 'expired' and sent_at is not null from public.push_outbox), 'given-up rows are closed');

select 'native_push_tokens: all tests passed' as result;
