-- Run ONLY against an isolated, disposable discovery_test database:
-- createdb -h <host> -p <port> -U postgres discovery_test
-- psql -h <host> -p <port> -U postgres -d discovery_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/explore_discovery.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'discovery_test' then raise exception 'This fixture requires the disposable discovery_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated;

create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.explore_profiles(
  user_id uuid primary key, display_name text, username text, avatar_url text, bio text,
  account_type text default 'personal', verified boolean default false,
  created_at timestamptz not null default now() - interval '400 days', deactivated_at timestamptz
);
create table public.explore_follows(follower_id uuid, following_id uuid);
create table public.explore_content_signals(
  user_id uuid, post_id uuid, creator_id uuid, views int default 0, likes int default 0, comments int default 0,
  saves int default 0, shares int default 0, impressions int default 0, rewatches int default 0, max_completion_rate double precision
);
create table public.explore_conversation_members(conversation_id uuid, user_id uuid);
create table public.explore_recommendation_privacy(
  user_id uuid primary key, location_personalization_enabled boolean, coarse_city text, coarse_country_code text
);
create table public.explore_user_blocks(blocker_id uuid, blocked_id uuid);
create function public.kunthai_user_is_guest(uuid) returns boolean language sql stable as $$ select false $$;
create function public.is_kunthai_admin(user_uuid uuid default auth.uid()) returns boolean language sql stable as $$
  select user_uuid = '00000000-0000-0000-0000-00000000ad00'::uuid
$$;

create table public.explore_posts(
  id uuid primary key, user_id uuid, feed_scope text default 'feed', body text, video_url text,
  created_at timestamptz default now()
);
alter table public.explore_posts enable row level security;
create policy "everyone reads" on public.explore_posts for select to authenticated using (true);
grant select on public.explore_posts to authenticated;

-- Stand-ins for the v1 candidate pools (unchanged by this migration).
create table public.pool_rows(
  id uuid, user_id uuid, author_name text, author_username text, author_avatar_url text,
  feed_scope text, body text, image_url text, audio_url text, video_url text,
  video_trim_start numeric, video_trim_end numeric, post_type text, category text,
  moderation_status text, audio_duration_seconds integer, post_privacy text,
  hashtags text[], mentions text[], media_meta jsonb, likes_count integer,
  comments_count integer, saves_count integer, created_at timestamptz, score double precision
);
create function public.get_recommended_feed(uuid, integer, integer) returns setof public.pool_rows language sql stable as $$ select * from public.pool_rows $$;
create function public.get_recommended_swip(uuid, integer, integer) returns setof public.pool_rows language sql stable as $$ select * from public.pool_rows $$;

-- Viewer V. Candidates:
--   F  follows V (stranger otherwise)
--   M  followed by two people V follows (2 mutual connections)
--   C  has chatted with V
--   N  same city as V
--   W  joined yesterday, no other link
--   D  deactivated (follows V: would rank first)
--   K1, K2 people V follows
insert into public.explore_profiles(user_id, display_name, created_at, deactivated_at) values
  ('00000000-0000-0000-0000-0000000000f0', 'Viewer', now() - interval '400 days', null),
  ('00000000-0000-0000-0000-0000000000f1', 'Follows Me', now() - interval '400 days', null),
  ('00000000-0000-0000-0000-0000000000f2', 'Mutual Friend', now() - interval '400 days', null),
  ('00000000-0000-0000-0000-0000000000f3', 'Chatted', now() - interval '400 days', null),
  ('00000000-0000-0000-0000-0000000000f4', 'Nearby Stranger', now() - interval '400 days', null),
  ('00000000-0000-0000-0000-0000000000f5', 'Brand New', now() - interval '1 day', null),
  ('00000000-0000-0000-0000-0000000000f6', 'Deactivated', now() - interval '400 days', now()),
  ('00000000-0000-0000-0000-0000000000a1', 'K1', now() - interval '400 days', null),
  ('00000000-0000-0000-0000-0000000000a2', 'K2', now() - interval '400 days', null);
insert into public.explore_follows values
  ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f0'),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f0');
insert into public.explore_conversation_members values
  ('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f0'),
  ('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f3');
insert into public.explore_recommendation_privacy values
  ('00000000-0000-0000-0000-0000000000f0', true, 'Freetown', 'SL'),
  ('00000000-0000-0000-0000-0000000000f4', true, 'Freetown', 'SL');

create table public.explore_post_comments(
  id uuid primary key default gen_random_uuid(), post_id uuid, user_id uuid not null, body text not null
);

\ir ../migrations/20261006150000_explore_discovery_people_you_know.sql
\ir ../migrations/20261006160000_explore_comments_deactivated_and_popular.sql

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f0', false);

do $$
declare
  ordered text[];
  r record;
begin
  select array_agg(display_name order by ord) into ordered
  from (select display_name, row_number() over () as ord
        from public.get_people_you_may_know_v2('00000000-0000-0000-0000-0000000000f0', 20)) s;
  -- Follows you > 2 mutuals > chatted > near you > new member.
  if ordered[1:5] <> array['Follows Me', 'Mutual Friend', 'Chatted', 'Nearby Stranger', 'Brand New'] then
    raise exception 'unexpected suggestion order: %', ordered;
  end if;
  if 'Deactivated' = any(ordered) then raise exception 'deactivated account suggested'; end if;
  if 'K1' = any(ordered) then raise exception 'already-followed account suggested'; end if;

  select * into r from public.get_people_you_may_know_v2('00000000-0000-0000-0000-0000000000f0', 20) where display_name = 'Mutual Friend';
  if r.reason_kind <> 'mutual' or r.mutual_count <> 2 or r.reason <> '2 mutual connections' then raise exception 'mutual row wrong: %', r; end if;
  select * into r from public.get_people_you_may_know_v2('00000000-0000-0000-0000-0000000000f0', 20) where display_name = 'Nearby Stranger';
  if not r.is_nearby or r.reason_kind <> 'nearby' then raise exception 'nearby flags wrong: %', r; end if;
  select * into r from public.get_people_you_may_know_v2('00000000-0000-0000-0000-0000000000f0', 20) where display_name = 'Brand New';
  if not r.is_new or r.reason_kind <> 'new' then raise exception 'new flags wrong: %', r; end if;
end $$;

-- Feed: followed > likely know > nearby stranger; deactivated author hidden.
insert into public.explore_recommendation_privacy values
  ('00000000-0000-0000-0000-0000000000a1', true, 'Kenema', 'SL'),
  ('00000000-0000-0000-0000-0000000000f1', true, 'Bo', 'SL');
insert into public.pool_rows(id, user_id, created_at, score) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', now(), 0), -- followed
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', now(), 0), -- follows me
  ('aaaaaaaa-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f4', now(), 0), -- nearby stranger
  ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000f6', now(), 50); -- deactivated

do $$
declare
  ordered uuid[];
begin
  select array_agg(user_id order by ord) into ordered
  from (select user_id, row_number() over () as ord from public.get_recommended_feed_v2('00000000-0000-0000-0000-0000000000f0', 24, 0)) s;
  if ordered <> array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f4']::uuid[] then
    raise exception 'unexpected feed order: %', ordered;
  end if;

  select array_agg(user_id order by ord) into ordered
  from (select user_id, row_number() over () as ord from public.get_recommended_swip_v2('00000000-0000-0000-0000-0000000000f0', 18, 0)) s;
  if '00000000-0000-0000-0000-0000000000f6' = any(ordered) then raise exception 'deactivated author in Swip'; end if;
  if ordered[1] <> '00000000-0000-0000-0000-0000000000a1' then raise exception 'unexpected swip order: %', ordered; end if;
end $$;

-- Read rule on explore_posts, checked as a normal signed-in user (RLS applies).
insert into public.explore_posts(id, user_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f6');

set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.explore_posts;
  if n <> 1 then raise exception 'viewer should see only the active author''s post, saw %', n; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', false);
  select count(*) into n from public.explore_posts where user_id = '00000000-0000-0000-0000-0000000000f6';
  if n <> 1 then raise exception 'the deactivated owner must still see their own post'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ad00', false);
  select count(*) into n from public.explore_posts;
  if n <> 2 then raise exception 'admins must still see every post, saw %', n; end if;
end $$;
reset role;

-- Popular: follower counts come back with each suggestion.
do $$
declare
  r record;
begin
  select * into r from public.get_people_you_may_know_v2('00000000-0000-0000-0000-0000000000f0', 20) where display_name = 'Mutual Friend';
  if r.follower_count <> 2 then raise exception 'Mutual Friend has 2 followers, got %', r.follower_count; end if;
  select * into r from public.get_people_you_may_know_v2('00000000-0000-0000-0000-0000000000f0', 20) where display_name = 'Chatted';
  if r.follower_count <> 0 then raise exception 'Chatted has no followers, got %', r.follower_count; end if;
end $$;

-- Deactivated accounts keep old comments but cannot add new ones.
insert into public.explore_post_comments(post_id, user_id, body)
values ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'active user comment');
update public.explore_profiles set deactivated_at = null where user_id = '00000000-0000-0000-0000-0000000000f6';
insert into public.explore_post_comments(post_id, user_id, body)
values ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f6', 'written before deactivating');
update public.explore_profiles set deactivated_at = now() where user_id = '00000000-0000-0000-0000-0000000000f6';

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.explore_post_comments(post_id, user_id, body)
    values ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f6', 'after deactivating');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'a deactivated account must not be able to comment'; end if;
  if not exists (select 1 from public.explore_post_comments where body = 'written before deactivating') then
    raise exception 'old comments of a deactivated account must stay';
  end if;
end $$;

\echo 'explore_discovery: all assertions passed'
