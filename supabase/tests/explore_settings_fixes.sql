-- Run ONLY against the disposable explore_settings_test database:
-- createdb -h /tmp -p 55432 -U pgtest explore_settings_test
-- psql -h /tmp -p 55432 -U pgtest -d explore_settings_test -v ON_ERROR_STOP=1 -f supabase/tests/explore_settings_fixes.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'explore_settings_test' then raise exception 'This fixture requires the disposable explore_settings_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated, anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated, anon;

create table auth.users(id uuid primary key);
insert into auth.users values
  ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b'),
  ('00000000-0000-4000-8000-00000000000c'), ('00000000-0000-4000-8000-00000000000d');

-- explore_user_preferences as production has it: made by hand, no primary
-- key, read/update policies only (so inserts were refused), a null legacy
-- row, a duplicate, and a user trigger that rejects updates of old rows.
create table public.explore_user_preferences(user_id uuid, settings jsonb, updated_at timestamptz);
alter table public.explore_user_preferences enable row level security;
create policy "Users read own explore preferences" on public.explore_user_preferences for select to authenticated using (auth.uid() = user_id);
create policy "Users update own explore preferences" on public.explore_user_preferences for update to authenticated using (auth.uid() = user_id);
grant select, update on public.explore_user_preferences to authenticated;
insert into public.explore_user_preferences values
  ('00000000-0000-4000-8000-00000000000a', '{"messages":{"readReceipts":false}}', now()),
  ('00000000-0000-4000-8000-00000000000a', '{"messages":{"readReceipts":true}}', now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000000000c', null, null);
create function public.reject_legacy_updates() returns trigger language plpgsql as $$
begin raise exception 'legacy guard fired'; end $$;
create trigger reject_legacy_updates before update on public.explore_user_preferences for each row execute function public.reject_legacy_updates();

create table public.explore_user_privacy_settings(user_id uuid primary key, settings jsonb not null default '{}', updated_at timestamptz);
create table public.explore_follows(follower_id uuid, following_id uuid);
create table public.explore_conversations(id uuid primary key default gen_random_uuid(), created_by uuid, participant_ids uuid[], conversation_key text,
  request boolean default false, created_at timestamptz default now(), updated_at timestamptz);
create unique index explore_conversations_key on public.explore_conversations(conversation_key) where conversation_key is not null;
create table public.explore_conversation_members(conversation_id uuid, user_id uuid, primary key (conversation_id, user_id));

\ir ../migrations/20261009100000_explore_settings_fixes.sql
-- Safe to run twice.
\ir ../migrations/20261009100000_explore_settings_fixes.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create function public.expect_error(statement text, fragment text, message text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(fragment in sqlerrm) = 0 then raise exception 'TEST FAILED: % (got %)', message, sqlerrm; end if;
    return;
  end;
  raise exception 'TEST FAILED: %', message;
end $$;
grant execute on all functions in schema public to authenticated;

-- 1. Table shape: duplicate collapsed to the newest row, nulls backfilled,
--    hand-made policies kept, legacy trigger still in place afterwards.
select test_assert((select count(*) from public.explore_user_preferences where user_id = '00000000-0000-4000-8000-00000000000a') = 1, 'duplicate preference rows collapse');
select test_assert((select settings -> 'messages' ->> 'readReceipts' from public.explore_user_preferences where user_id = '00000000-0000-4000-8000-00000000000a') = 'false', 'the newest duplicate is kept');
select test_assert((select settings = '{}'::jsonb and updated_at is not null from public.explore_user_preferences where user_id = '00000000-0000-4000-8000-00000000000c'), 'null legacy settings become {}');
select test_assert((select count(*) from pg_policies where tablename = 'explore_user_preferences') = 5, 'hand-made policies are kept next to the new ones');
select test_assert((select tgenabled = 'O' from pg_trigger where tgname = 'reject_legacy_updates'), 'user triggers are switched back on');
drop trigger reject_legacy_updates on public.explore_user_preferences;

-- 2. A signed-in person can upsert their own row (the app's call) and only theirs.
set role authenticated;
select public.as_user('00000000-0000-4000-8000-00000000000b');
insert into public.explore_user_preferences(user_id, settings, updated_at)
values ('00000000-0000-4000-8000-00000000000b', '{"video":{"autoplay":false}}', now())
on conflict (user_id) do update set settings = excluded.settings, updated_at = excluded.updated_at;
insert into public.explore_user_preferences(user_id, settings, updated_at)
values ('00000000-0000-4000-8000-00000000000b', '{"video":{"autoplay":true}}', now())
on conflict (user_id) do update set settings = excluded.settings, updated_at = excluded.updated_at;
select test_assert((select settings -> 'video' ->> 'autoplay' from public.explore_user_preferences where user_id = '00000000-0000-4000-8000-00000000000b') = 'true', 'upsert updates the own row');
select test_assert((select count(*) from public.explore_user_preferences) = 1, 'other people''s settings are not readable');
select public.expect_error($q$insert into public.explore_user_preferences(user_id, settings) values ('00000000-0000-4000-8000-00000000000d', '{}')$q$,
  'row-level security', 'cannot insert settings for someone else');
reset role;

-- 3. Who can message you.
insert into public.explore_user_privacy_settings values
  ('00000000-0000-4000-8000-00000000000b', '{"allowMessages":"followers"}', now()),
  ('00000000-0000-4000-8000-00000000000c', '{"allowMessages":"none"}', now());
-- B follows D, so D is one of B's connections.
insert into public.explore_follows values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000d');

set role authenticated;
select public.as_user('00000000-0000-4000-8000-00000000000a');
select public.expect_error($q$select public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-00000000000b')$q$,
  'Only connections can chat', 'Connections blocks a stranger');
select public.expect_error($q$select public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-00000000000c')$q$,
  'not accepting new messages', 'No one blocks a stranger');
-- Never saved a setting: open inbox, arrives as a request.
select test_assert((select request from public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-00000000000d')), 'default inbox takes a request');
select public.as_user('00000000-0000-4000-8000-00000000000d');
select test_assert((select request = false from public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-00000000000b')), 'a connection can start a chat');
-- An existing thread still opens for the stranger after B tightens up.
reset role;
insert into public.explore_conversations(id, participant_ids, conversation_key) values
  ('10000000-0000-4000-8000-000000000001', array['00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000c']::uuid[], '00000000-0000-4000-8000-00000000000a__00000000-0000-4000-8000-00000000000c');
set role authenticated;
select public.as_user('00000000-0000-4000-8000-00000000000a');
select test_assert((select id = '10000000-0000-4000-8000-000000000001' from public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-00000000000c')), 'existing threads stay open');

-- 4. Read receipts: A switched them off; D shares no conversation with A.
select public.as_user('00000000-0000-4000-8000-00000000000c');
select test_assert(public.explore_peer_read_receipts_enabled('00000000-0000-4000-8000-00000000000a') = false, 'A switched read receipts off');
select public.as_user('00000000-0000-4000-8000-00000000000a');
select test_assert(public.explore_peer_read_receipts_enabled('00000000-0000-4000-8000-00000000000c') = true, 'C never changed read receipts');
select public.as_user('00000000-0000-4000-8000-00000000000b');
select test_assert(public.explore_peer_read_receipts_enabled('00000000-0000-4000-8000-00000000000a') = false, 'no shared conversation reads as false');
reset role;
select public.as_user('');

select 'explore_settings_fixes: all tests passed' as result;
