-- Run ONLY against the disposable saved_collections_test database:
-- psql -h /tmp -p 55432 -U pgtest -d saved_collections_test -v ON_ERROR_STOP=1 -f supabase/tests/explore_saved_collections_sync.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'saved_collections_test' then raise exception 'This fixture requires the disposable saved_collections_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
create table auth.users(id uuid primary key);

-- The base schema as production has it: weak items policy, no name rules.
create table public.explore_posts(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade);
create table public.explore_saved_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);
create table public.explore_saved_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.explore_saved_collections(id) on delete cascade,
  post_id uuid not null references public.explore_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (collection_id, post_id)
);
alter table public.explore_saved_collections enable row level security;
alter table public.explore_saved_collection_items enable row level security;
create policy "users_manage_saved_collections" on public.explore_saved_collections for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_saved_collection_items" on public.explore_saved_collection_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into auth.users select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 3) n;
insert into public.explore_posts(id, user_id) select ('20000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-4000-8000-000000000003' from generate_series(1, 4) n;
-- Existing data: two case-insensitive duplicates and a messy name.
insert into public.explore_saved_collections(id, user_id, name, created_at) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Recipes', now() - interval '3 days'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '  recipes ', now() - interval '2 days'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Road    trips', now()),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Recipes', now());
insert into public.explore_saved_collection_items(collection_id, post_id, user_id) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001');

\ir ../migrations/20261009140000_explore_saved_collections_sync.sql
-- Re-runnable.
\ir ../migrations/20261009140000_explore_saved_collections_sync.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  if u = '' then execute 'reset role'; else execute 'set role authenticated'; end if;
end $$;
grant execute on function public.as_user(text) to authenticated;
grant execute on function public.test_assert(boolean, text) to authenticated;
create function public.expect_sqlstate(statement text, wanted text, message text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = wanted or wanted is null then return; end if;
    raise exception 'TEST FAILED: % (got %: %)', message, sqlstate, sqlerrm;
  end;
  raise exception 'TEST FAILED: %', message;
end $$;
grant execute on function public.expect_sqlstate(text, text, text) to authenticated;
create function public.changed_rows(statement text) returns integer language plpgsql as $$
declare n integer; begin execute statement; get diagnostics n = row_count; return n; end $$;
grant execute on function public.changed_rows(text) to authenticated;

-- 1. Backfill: duplicates merged into the oldest, names tidied.
select test_assert((select count(*) = 2 from public.explore_saved_collections where user_id = '00000000-0000-4000-8000-000000000001'), 'case-insensitive duplicates are merged');
select test_assert((select name = 'Recipes' from public.explore_saved_collections where id = '10000000-0000-4000-8000-000000000001'), 'the oldest collection keeps its name');
select test_assert((select count(*) = 2 from public.explore_saved_collection_items where collection_id = '10000000-0000-4000-8000-000000000001'), 'merged collections keep every post once');
select test_assert((select name = 'Road trips' from public.explore_saved_collections where id = '10000000-0000-4000-8000-000000000003'), 'names are tidied');
select test_assert((select count(*) = 1 from public.explore_saved_collections where user_id = '00000000-0000-4000-8000-000000000002'), 'another account''s collection with the same name is untouched');
select test_assert((select updated_at is not null from public.explore_saved_collections where id = '10000000-0000-4000-8000-000000000001'), 'collections have updated_at');

-- 2. Unique names per account (23505), shape check.
select as_user('00000000-0000-4000-8000-000000000001');
select expect_sqlstate($$insert into public.explore_saved_collections(user_id, name) values ('00000000-0000-4000-8000-000000000001', 'RECIPES')$$, '23505', 'a duplicate name (any case) was accepted');
select expect_sqlstate($$update public.explore_saved_collections set name = 'recipes' where id = '10000000-0000-4000-8000-000000000003'$$, '23505', 'a rename to a duplicate name was accepted');
select expect_sqlstate($$insert into public.explore_saved_collections(user_id, name) values ('00000000-0000-4000-8000-000000000001', '')$$, '23514', 'a blank name was accepted');
select expect_sqlstate($$insert into public.explore_saved_collections(user_id, name) values ('00000000-0000-4000-8000-000000000001', repeat('x', 41))$$, '23514', 'a 41-character name was accepted');
insert into public.explore_saved_collections(id, user_id, name) values ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Music');
select test_assert(changed_rows($$update public.explore_saved_collections set name = 'Tunes' where id = '10000000-0000-4000-8000-000000000005'$$) = 1, 'the owner renames a collection');
insert into public.explore_saved_collection_items(collection_id, post_id, user_id) values ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001');
select test_assert(changed_rows($$delete from public.explore_saved_collection_items where collection_id = '10000000-0000-4000-8000-000000000005' and post_id = '20000000-0000-4000-8000-000000000003'$$) = 1, 'the owner removes a post');

-- 3. Own-row RLS.
select test_assert((select count(*) = 3 from public.explore_saved_collections), 'a member sees only their own collections');
select expect_sqlstate($$insert into public.explore_saved_collections(user_id, name) values ('00000000-0000-4000-8000-000000000002', 'Theirs')$$, '42501', 'a member created a collection for someone else');
select expect_sqlstate($$insert into public.explore_saved_collection_items(collection_id, post_id, user_id) values ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001')$$, '42501', 'a member put a post into someone else''s collection');
select test_assert(changed_rows($$update public.explore_saved_collections set name = 'Mine now' where id = '10000000-0000-4000-8000-000000000004'$$) = 0, 'a member cannot rename someone else''s collection');
select test_assert(changed_rows($$delete from public.explore_saved_collections where id = '10000000-0000-4000-8000-000000000004'$$) = 0, 'a member cannot delete someone else''s collection');
select as_user('00000000-0000-4000-8000-000000000002');
select test_assert((select count(*) = 0 from public.explore_saved_collection_items), 'items of other accounts are hidden');
select test_assert((select count(*) = 1 from public.explore_saved_collections), 'the other account sees its own collection');
select as_user('00000000-0000-4000-8000-000000000001');
select test_assert(changed_rows($$delete from public.explore_saved_collections where id = '10000000-0000-4000-8000-000000000001'$$) = 1, 'the owner deletes a collection');
select as_user('');
select test_assert((select count(*) = 0 from public.explore_saved_collection_items where collection_id = '10000000-0000-4000-8000-000000000001'), 'deleting a collection removes its items');

select 'explore_saved_collections_sync: all tests passed' as result;
