-- Run ONLY against the disposable explore_messages_test database:
-- psql -h /tmp -p 55432 -U pgtest -d explore_messages_test -v ON_ERROR_STOP=1 -f supabase/tests/explore_messages_fixes.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'explore_messages_test' then raise exception 'This fixture requires the disposable explore_messages_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists storage cascade;
create schema public;
create schema auth;
create schema storage;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth, storage to authenticated, anon;

-- Minimal stand-ins for the tables and helpers the migration builds on.
create table auth.users(id uuid primary key);
create table public.explore_spaces(id uuid primary key, owner_user_id uuid references auth.users, name text default 'Space', avatar_url text, status text default 'active');
create table public.explore_space_members(space_id uuid references public.explore_spaces, user_id uuid references auth.users, role text default 'member',
  status text default 'active', responsibilities jsonb default '{}', primary key (space_id, user_id));
create table public.explore_conversations(id uuid primary key default gen_random_uuid(), created_by uuid references auth.users on delete set null,
  request boolean not null default false, participant_ids uuid[] not null default '{}', conversation_key text, space_id uuid references public.explore_spaces on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index explore_conversations_conversation_key_idx on public.explore_conversations (conversation_key) where conversation_key is not null;
create table public.explore_conversation_members(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.explore_conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade, created_at timestamptz not null default now(), unique (conversation_id, user_id));
create table public.explore_messages(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.explore_conversations on delete cascade,
  sender_id uuid not null references auth.users on delete cascade, body text not null default '', media_url text, media_type text not null default 'text',
  metadata jsonb not null default '{}', read boolean not null default false, created_at timestamptz not null default now());
create table public.explore_follows(id uuid primary key default gen_random_uuid(), follower_id uuid not null references auth.users, following_id uuid not null references auth.users,
  unique (follower_id, following_id));
create table public.explore_user_blocks(id uuid primary key default gen_random_uuid(), blocker_id uuid not null references auth.users, blocked_id uuid not null references auth.users,
  reason text, unique (blocker_id, blocked_id));
create table public.explore_identity_blocks(id uuid primary key default gen_random_uuid(), blocker_user_id uuid not null references auth.users, target_type text not null,
  target_profile_user_id uuid references auth.users, target_space_id uuid references public.explore_spaces, reason text not null default '');
create table public.explore_identity_connections(id uuid primary key default gen_random_uuid(), connector_user_id uuid not null references auth.users, target_type text not null,
  target_profile_user_id uuid references auth.users, target_space_id uuid references public.explore_spaces);
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;

-- The helpers as 2026-10-01 left them.
create function public.explore_space_can_reply_messages(space_uuid uuid, user_uuid uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$
  select user_uuid is not null and (
    exists (select 1 from public.explore_spaces s where s.id = space_uuid and s.owner_user_id = user_uuid)
    or exists (select 1 from public.explore_space_members m where m.space_id = space_uuid and m.user_id = user_uuid and m.status = 'active'
      and m.role in ('owner', 'administrator', 'moderator', 'customer_support'))) $$;
create function public.explore_is_conversation_member(conversation_uuid uuid, user_uuid uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$
  select user_uuid = auth.uid() and exists (
    select 1 from public.explore_conversations c where c.id = conversation_uuid and (
      user_uuid = any(c.participant_ids)
      or exists (select 1 from public.explore_conversation_members m where m.conversation_id = c.id and m.user_id = user_uuid)
      or (c.space_id is not null and public.explore_space_can_reply_messages(c.space_id, user_uuid)))) $$;

alter table public.explore_conversations enable row level security;
alter table public.explore_conversation_members enable row level security;
alter table public.explore_messages enable row level security;
create policy conv_read on public.explore_conversations for select to authenticated using (public.explore_is_conversation_member(id, auth.uid()));
create policy conv_create on public.explore_conversations for insert to authenticated with check (created_by = auth.uid());
create policy member_read on public.explore_conversation_members for select to authenticated using (public.explore_is_conversation_member(conversation_id, auth.uid()));
create policy member_create on public.explore_conversation_members for insert to authenticated with check (public.explore_is_conversation_member(conversation_id, auth.uid()));
create policy msg_read on public.explore_messages for select to authenticated using (public.explore_is_conversation_member(conversation_id, auth.uid()));
create policy msg_create on public.explore_messages for insert to authenticated with check (sender_id = auth.uid() and public.explore_is_conversation_member(conversation_id, auth.uid()));
grant select, insert, delete on all tables in schema public to authenticated;
grant select, insert, delete on storage.objects to authenticated;

-- The direct-conversation RPC exactly as production has it (the migration must
-- not need to change it).
\ir ../migrations/20260705210000_explore_message_requests_open_send.sql

-- Seed data written before the migration, including a block that already
-- exists between two people who share a conversation: the migration must not
-- touch existing rows.
-- a ...a1, b ...b2, c ...c3, customer d ...d4, team member t ...e5, owner o ...f6, stranger x ...99
insert into auth.users values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b2'), ('00000000-0000-4000-8000-0000000000c3'),
  ('00000000-0000-4000-8000-0000000000d4'), ('00000000-0000-4000-8000-0000000000e5'), ('00000000-0000-4000-8000-0000000000f6'), ('00000000-0000-4000-8000-000000000099');
insert into public.explore_spaces(id, owner_user_id, name) values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f6', 'Shop');
insert into public.explore_space_members(space_id, user_id, role) values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e5', 'customer_support');
insert into public.explore_conversations(id, created_by, participant_ids, conversation_key) values
  ('10000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000a1',
   array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2']::uuid[],
   '00000000-0000-4000-8000-0000000000a1__00000000-0000-4000-8000-0000000000b2');
insert into public.explore_conversation_members(conversation_id, user_id) values
  ('10000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000a1'), ('10000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000b2');
insert into public.explore_conversations(id, created_by, participant_ids, conversation_key, space_id) values
  ('10000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000d4', array['00000000-0000-4000-8000-0000000000d4']::uuid[],
   'space:50000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-0000000000d4', '50000000-0000-4000-8000-000000000001');
insert into public.explore_conversation_members(conversation_id, user_id) values ('10000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000d4');
insert into public.explore_messages(conversation_id, sender_id, body, created_at) values
  ('10000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000b2', 'old message', now() - interval '1 day');
insert into public.explore_user_blocks(blocker_id, blocked_id) values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2');

\ir ../migrations/20261009120000_explore_messages_fixes.sql
-- Re-runnable.
\ir ../migrations/20261009120000_explore_messages_fixes.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create function public.expect_error(statement text, message text, expected_hint text default null) returns void language plpgsql as $$
declare
  got_hint text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics got_hint = pg_exception_hint;
    if expected_hint is not null and got_hint is distinct from expected_hint then
      raise exception 'TEST FAILED: % (wrong error, hint %: %)', message, got_hint, sqlerrm;
    end if;
    return;
  end;
  raise exception 'TEST FAILED: %', message;
end $$;
grant execute on function public.test_assert(boolean, text), public.as_user(text), public.expect_error(text, text, text) to authenticated;

do $$ begin
  perform public.test_assert((select count(*) from public.explore_messages) = 1, 'existing messages are untouched');
  perform public.test_assert((select public from storage.buckets where id = 'explore-message-media') = false, 'message media bucket is private');
end $$;

-- ---------------------------------------------------------------------------
-- Blocking (finding 5)
-- ---------------------------------------------------------------------------
set role authenticated;

-- a blocked b: b can no longer message a, a can still message b.
select from public.as_user('00000000-0000-4000-8000-0000000000b2');
select public.expect_error($$insert into public.explore_messages(conversation_id, sender_id, body) values ('10000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000b2', 'hi')$$,
  'a blocked person cannot message the blocker', 'explore_blocked');
select from public.as_user('00000000-0000-4000-8000-0000000000a1');
insert into public.explore_messages(conversation_id, sender_id, body) values ('10000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000a1', 'from the blocker');

-- c blocks b through an identity block: b cannot start a conversation with c.
reset role;
insert into public.explore_identity_blocks(blocker_user_id, target_type, target_profile_user_id) values ('00000000-0000-4000-8000-0000000000c3', 'profile', '00000000-0000-4000-8000-0000000000b2');
set role authenticated;
select from public.as_user('00000000-0000-4000-8000-0000000000b2');
select public.expect_error($$select public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-0000000000c3')$$,
  'a new direct conversation with someone who blocked you is refused', 'explore_blocked');
select public.expect_error($$insert into public.explore_conversations(created_by, participant_ids) values ('00000000-0000-4000-8000-0000000000b2', array['00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c3']::uuid[])$$,
  'the older client path cannot create the conversation either', 'explore_blocked');
-- c can still open a conversation with b (the blocker is not refused).
select from public.as_user('00000000-0000-4000-8000-0000000000c3');
do $$ begin
  perform public.test_assert((select id from public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-0000000000b2')) is not null, 'the blocker can still open the thread');
end $$;
-- b opening an existing thread with a re-adds a as a member: refused.
select from public.as_user('00000000-0000-4000-8000-0000000000b2');
select public.expect_error($$select public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-0000000000a1')$$,
  'reopening a thread with the blocker through the RPC is refused', 'explore_blocked');
-- Unrelated people are not affected.
select from public.as_user('00000000-0000-4000-8000-000000000099');
do $$
declare
  conversation_uuid uuid;
begin
  conversation_uuid := (public.get_or_create_explore_direct_conversation('00000000-0000-4000-8000-0000000000a1')).id;
  insert into public.explore_messages(conversation_id, sender_id, body) values (conversation_uuid, '00000000-0000-4000-8000-000000000099', 'hello');
end $$;

-- Space threads: the customer d blocks the Space; the team can no longer reply,
-- the customer can still write.
reset role;
insert into public.explore_identity_blocks(blocker_user_id, target_type, target_space_id) values ('00000000-0000-4000-8000-0000000000d4', 'space', '50000000-0000-4000-8000-000000000001');
set role authenticated;
select from public.as_user('00000000-0000-4000-8000-0000000000e5');
select public.expect_error($$insert into public.explore_messages(conversation_id, sender_id, body) values ('10000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e5', 'team reply')$$,
  'a Space the customer blocked cannot reply', 'explore_blocked');
select public.expect_error($$insert into public.explore_conversations(created_by, participant_ids, space_id) values ('00000000-0000-4000-8000-0000000000e5', array['00000000-0000-4000-8000-0000000000d4']::uuid[], '50000000-0000-4000-8000-000000000001')$$,
  'a Space cannot open a new thread with a customer who blocked it', 'explore_blocked');
select from public.as_user('00000000-0000-4000-8000-0000000000d4');
insert into public.explore_messages(conversation_id, sender_id, body) values ('10000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000d4', 'customer writes');
-- A direct message sent while acting as that Space is refused too.
reset role;
insert into public.explore_conversations(id, created_by, participant_ids) values
  ('10000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000e5', array['00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e5']::uuid[]);
set role authenticated;
select from public.as_user('00000000-0000-4000-8000-0000000000e5');
select public.expect_error($$insert into public.explore_messages(conversation_id, sender_id, body, metadata) values ('10000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000e5', 'as space', '{"actor":{"spaceId":"50000000-0000-4000-8000-000000000001"}}')$$,
  'a direct message as a blocked Space is refused', 'explore_blocked');
insert into public.explore_messages(conversation_id, sender_id, body, metadata) values ('10000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000e5', 'as myself', '{"actor":{"spaceId":"not-a-uuid"}}');

-- The block check is internal.
select public.expect_error($$select public.explore_has_blocked('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')$$, 'people cannot probe who blocked whom');

-- Maintenance as the service role is never refused.
reset role;
select from public.as_user('');
insert into public.explore_conversation_members(conversation_id, user_id) values ('10000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000a1')
on conflict do nothing;
delete from public.explore_conversation_members where conversation_id = '10000000-0000-4000-8000-0000000000e5' and user_id = '00000000-0000-4000-8000-0000000000a1';

-- ---------------------------------------------------------------------------
-- Hidden messages, inbox and thread pages (findings 9 and 11)
-- ---------------------------------------------------------------------------
-- c <-> x: x sends 60 messages; c reads the inbox and pages through the thread.
insert into public.explore_conversations(id, created_by, participant_ids) values
  ('10000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000c3', array['00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000099']::uuid[]);
insert into public.explore_conversation_members(conversation_id, user_id) values
  ('10000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000c3'), ('10000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-000000000099');
insert into public.explore_messages(id, conversation_id, sender_id, body, created_at)
select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '10000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-000000000099',
  'message ' || n, now() - interval '1 hour' + n * interval '1 second'
from generate_series(1, 60) n;

set role authenticated;
select from public.as_user('00000000-0000-4000-8000-0000000000c3');
do $$
declare
  inbox record;
begin
  select * into inbox from public.list_explore_conversations() where id = '10000000-0000-4000-8000-0000000000c9';
  perform public.test_assert(inbox.unread_count = 60, 'inbox counts unread messages');
  perform public.test_assert(inbox.last_message ->> 'body' = 'message 60', 'inbox carries the last message');
  perform public.test_assert(array_length(inbox.member_ids, 1) = 2, 'inbox carries the members');
  perform public.test_assert((select count(*) from public.list_explore_messages('10000000-0000-4000-8000-0000000000c9')) = 50, 'a thread opens on its latest 50 messages');
  perform public.test_assert((select min(created_at) from public.list_explore_messages('10000000-0000-4000-8000-0000000000c9', null, 50))
    = (select created_at from public.explore_messages where body = 'message 11'), 'the first page holds messages 11 to 60');
  perform public.test_assert((select count(*) from public.list_explore_messages('10000000-0000-4000-8000-0000000000c9',
    (select created_at from public.explore_messages where body = 'message 11'))) = 10, 'older messages load page by page');
end $$;

-- c hides the newest message for themselves only.
insert into public.explore_message_hidden(user_id, message_id) values ('00000000-0000-4000-8000-0000000000c3', '20000000-0000-4000-8000-000000000060');
do $$
declare
  inbox record;
begin
  select * into inbox from public.list_explore_conversations() where id = '10000000-0000-4000-8000-0000000000c9';
  perform public.test_assert(inbox.last_message ->> 'body' = 'message 59', 'a hidden message is not the inbox preview');
  perform public.test_assert(inbox.unread_count = 59, 'a hidden message is not counted unread');
  perform public.test_assert(not exists (select 1 from public.list_explore_messages('10000000-0000-4000-8000-0000000000c9') where body = 'message 60'), 'a hidden message is left out of the thread');
end $$;
select public.expect_error($$insert into public.explore_message_hidden(user_id, message_id) values ('00000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000001')$$,
  'nobody hides messages for someone else');
select from public.as_user('00000000-0000-4000-8000-000000000099');
do $$ begin
  perform public.test_assert(not exists (select 1 from public.explore_message_hidden), 'hidden rows are private');
  perform public.test_assert(exists (select 1 from public.list_explore_messages('10000000-0000-4000-8000-0000000000c9') where body = 'message 60'), 'the other participant still sees it');
end $$;
select from public.as_user('00000000-0000-4000-8000-0000000000a1');
select public.expect_error($$insert into public.explore_message_hidden(user_id, message_id) values ('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001')$$,
  'only messages you can read can be hidden');
do $$ begin
  perform public.test_assert(not exists (select 1 from public.list_explore_conversations() where id = '10000000-0000-4000-8000-0000000000c9'), 'the inbox lists only your conversations');
  perform public.test_assert((select count(*) from public.list_explore_messages('10000000-0000-4000-8000-0000000000c9')) = 0, 'thread pages respect message policies');
end $$;

-- The Space inbox for a team member: unread counts only the customer's messages.
select from public.as_user('00000000-0000-4000-8000-0000000000e5');
do $$
declare
  inbox record;
begin
  select * into inbox from public.list_explore_conversations('50000000-0000-4000-8000-000000000001') where id = '10000000-0000-4000-8000-0000000000d4';
  perform public.test_assert(inbox.unread_count = 1 and inbox.last_message ->> 'body' = 'customer writes', 'the Space inbox shows the customer thread');
  perform public.test_assert(not exists (select 1 from public.list_explore_conversations('50000000-0000-4000-8000-000000000001') where space_id is distinct from '50000000-0000-4000-8000-000000000001'), 'the Space inbox holds only that Space');
end $$;
select from public.as_user('00000000-0000-4000-8000-0000000000c3');
do $$ begin
  perform public.test_assert(not exists (select 1 from public.list_explore_conversations('50000000-0000-4000-8000-000000000001')), 'outsiders get no Space inbox');
end $$;

-- ---------------------------------------------------------------------------
-- Remove a follower (finding 17)
-- ---------------------------------------------------------------------------
reset role;
insert into public.explore_follows(follower_id, following_id) values
  ('00000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-0000000000c3'), ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000099');
insert into public.explore_identity_connections(connector_user_id, target_type, target_profile_user_id) values ('00000000-0000-4000-8000-000000000099', 'profile', '00000000-0000-4000-8000-0000000000c3');
set role authenticated;
select from public.as_user('00000000-0000-4000-8000-0000000000c3');
do $$ begin
  perform public.test_assert(public.remove_explore_follower('00000000-0000-4000-8000-000000000099') = 2, 'the follower is removed');
end $$;
reset role;
do $$ begin
  perform public.test_assert(not exists (select 1 from public.explore_follows where follower_id = '00000000-0000-4000-8000-000000000099'), 'their follow is gone');
  perform public.test_assert(not exists (select 1 from public.explore_identity_connections), 'their identity connection is gone');
  perform public.test_assert(exists (select 1 from public.explore_follows where follower_id = '00000000-0000-4000-8000-0000000000c3'), 'your own follow of them stays');
end $$;
set role authenticated;
select public.expect_error($$select public.remove_explore_follower('00000000-0000-4000-8000-0000000000c3')$$, 'you cannot remove yourself');

-- ---------------------------------------------------------------------------
-- Private message media (finding 10)
-- ---------------------------------------------------------------------------
select from public.as_user('00000000-0000-4000-8000-0000000000c3');
insert into storage.objects(bucket_id, name) values ('explore-message-media', '10000000-0000-4000-8000-0000000000c9/00000000-0000-4000-8000-0000000000c3/photo.jpg');
select public.expect_error($$insert into storage.objects(bucket_id, name) values ('explore-message-media', '10000000-0000-4000-8000-0000000000c9/00000000-0000-4000-8000-000000000099/photo.jpg')$$,
  'nobody uploads into another sender''s folder');
select public.expect_error($$insert into storage.objects(bucket_id, name) values ('explore-message-media', '10000000-0000-4000-8000-0000000000ab/00000000-0000-4000-8000-0000000000c3/photo.jpg')$$,
  'nobody uploads into a conversation they are not in');
select public.expect_error($$insert into storage.objects(bucket_id, name) values ('explore-message-media', 'not-a-uuid/00000000-0000-4000-8000-0000000000c3/photo.jpg')$$,
  'malformed paths are refused');
select from public.as_user('00000000-0000-4000-8000-000000000099');
do $$ begin
  perform public.test_assert((select count(*) from storage.objects where bucket_id = 'explore-message-media') = 1, 'the other participant can read the file');
end $$;
delete from storage.objects where bucket_id = 'explore-message-media';
select from public.as_user('00000000-0000-4000-8000-0000000000a1');
do $$ begin
  perform public.test_assert(not exists (select 1 from storage.objects), 'outsiders cannot read message media');
end $$;
select from public.as_user('00000000-0000-4000-8000-0000000000c3');
do $$ begin
  perform public.test_assert((select count(*) from storage.objects) = 1, 'only the sender can delete the file (the other participant could not)');
end $$;
delete from storage.objects where bucket_id = 'explore-message-media';
do $$ begin
  perform public.test_assert(not exists (select 1 from storage.objects), 'the sender deletes their file');
end $$;

reset role;
select 'explore_messages_fixes: all tests passed' as result;
