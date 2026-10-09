-- Run ONLY against the disposable explore_profile_test database:
-- psql -h /tmp -p 55432 -U pgtest -d explore_profile_test -v ON_ERROR_STOP=1 -f supabase/tests/explore_profile_fixes.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'explore_profile_test' then raise exception 'This fixture requires the disposable explore_profile_test database.'; end if; end $$;
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

-- Minimal stand-ins for the tables, policies and helpers the migration builds on.
create table public.admin_assignments(user_id uuid primary key);
create function public.is_kunthai_admin(user_uuid uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_assignments where user_id = user_uuid) $$;

create table public.explore_profiles(user_id uuid primary key references auth.users on delete cascade, display_name text not null default 'Profile', username text,
  verified boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.explore_spaces(id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users on delete cascade, name text not null default 'Space',
  slug text not null, verified boolean not null default false, status text not null default 'active', updated_at timestamptz default now());
create table public.explore_space_members(id uuid primary key default gen_random_uuid(), space_id uuid not null references public.explore_spaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade, role text not null default 'member', status text not null default 'active', unique (space_id, user_id));
create table public.explore_posts(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade, author_name text not null default 'A',
  body text not null default '', actor_type text not null default 'profile', actor_id uuid, space_id uuid references public.explore_spaces on delete set null);

create function public.explore_space_role_allows(space_uuid uuid, allowed_roles text[] default null) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.explore_space_members member where member.space_id = space_uuid and member.user_id = auth.uid()
    and member.status = 'active' and (allowed_roles is null or member.role = any(allowed_roles))) $$;
-- The owner-member trigger as production has it.
create function public.explore_space_create_owner_member() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.explore_space_members (space_id, user_id, role, status) values (new.id, new.owner_user_id, 'owner', 'active')
  on conflict (space_id, user_id) do update set role = 'owner', status = 'active';
  return new;
end $$;
create trigger explore_spaces_owner_member after insert on public.explore_spaces for each row execute function public.explore_space_create_owner_member();

alter table public.explore_profiles enable row level security;
alter table public.explore_spaces enable row level security;
alter table public.explore_space_members enable row level security;
alter table public.explore_posts enable row level security;
create policy profiles_read on public.explore_profiles for select to authenticated using (true);
create policy profiles_own on public.explore_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy spaces_read on public.explore_spaces for select to authenticated using (true);
create policy spaces_insert on public.explore_spaces for insert to authenticated with check (owner_user_id = auth.uid());
create policy spaces_update on public.explore_spaces for update to authenticated
  using (owner_user_id = auth.uid() or public.explore_space_role_allows(id, array['owner', 'administrator']))
  with check (owner_user_id = auth.uid() or public.explore_space_role_allows(id, array['owner', 'administrator']));
create policy spaces_delete on public.explore_spaces for delete to authenticated using (owner_user_id = auth.uid());
create policy members_read on public.explore_space_members for select to authenticated using (true);
create policy members_insert on public.explore_space_members for insert to authenticated with check (public.explore_space_role_allows(space_id, array['owner', 'administrator']));
create policy members_update on public.explore_space_members for update to authenticated
  using (public.explore_space_role_allows(space_id, array['owner', 'administrator'])) with check (public.explore_space_role_allows(space_id, array['owner', 'administrator']));
create policy members_delete on public.explore_space_members for delete to authenticated using (public.explore_space_role_allows(space_id, array['owner', 'administrator']));
-- The invitee policy production has: it never looked at the role.
create policy members_respond on public.explore_space_members for update to authenticated
  using (user_id = auth.uid() and status = 'pending') with check (user_id = auth.uid() and status in ('active', 'removed'));
create policy posts_read on public.explore_posts for select to authenticated using (true);
create policy posts_insert on public.explore_posts for insert to authenticated with check (auth.uid() = user_id);
create policy posts_update on public.explore_posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy posts_delete on public.explore_posts for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on all tables in schema public to authenticated;

-- An app-traffic guard on profiles that would reject the username backfill if
-- it fired (user triggers must be off around it).
create function public.reject_username_change() returns trigger language plpgsql as $$
begin if new.username is distinct from old.username then raise exception 'username changes are rejected'; end if; return new; end $$;
create trigger reject_username_change before update on public.explore_profiles for each row execute function public.reject_username_change();

-- Users: ...01 Space owner, ...02 Space admin, ...03 editor, ...04 stranger, ...05 invitee, ...09 KunThai admin
insert into auth.users select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 9) n;
insert into public.admin_assignments values ('00000000-0000-4000-8000-000000000009');
-- Production data with duplicate usernames (case-insensitive) and blanks.
insert into public.explore_profiles(user_id, username, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'Amara', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000002', 'amara', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000003', 'AMARA', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000004', '', now()),
  ('00000000-0000-4000-8000-000000000005', '', now()),
  ('00000000-0000-4000-8000-000000000006', null, now()),
  ('00000000-0000-4000-8000-000000000007', null, now());

\ir ../migrations/20261009110000_explore_profile_fixes.sql
-- Re-runnable.
\ir ../migrations/20261009110000_explore_profile_fixes.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  if u = '' then execute 'reset role'; else execute 'set role authenticated'; end if;
end $$;
grant execute on function public.as_user(text) to authenticated;
grant execute on function public.test_assert(boolean, text) to authenticated;
create function public.expect_error(statement text, message text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    return;
  end;
  raise exception 'TEST FAILED: %', message;
end $$;
grant execute on function public.expect_error(text, text) to authenticated;
-- Rows a statement changed (RLS hides rows silently: 0 instead of an error).
create function public.changed_rows(statement text) returns integer language plpgsql as $$
declare n integer; begin execute statement; get diagnostics n = row_count; return n; end $$;
grant execute on function public.changed_rows(text) to authenticated;

-- 2. Duplicates resolved: the oldest keeps the name, newer ones get a suffix.
select test_assert((select username = 'Amara' from public.explore_profiles where user_id = '00000000-0000-4000-8000-000000000001'), 'the oldest profile keeps its username');
select test_assert((select count(distinct lower(username)) = 3 from public.explore_profiles where lower(username) like 'amara%'), 'newer duplicates are renamed');
select test_assert((select bool_and(username ~* '^amara_[0-9a-f]{6}$') from public.explore_profiles where user_id in ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003')), 'renamed duplicates carry a short suffix');
select test_assert((select count(*) = 2 from public.explore_profiles where username = ''), 'blank usernames are left alone');
select test_assert((select tgenabled = 'O' from pg_trigger where tgname = 'reject_username_change'), 'user triggers are switched back on');
select expect_error($$insert into public.explore_profiles(user_id, username) values ('00000000-0000-4000-8000-000000000008', 'aMaRa')$$, 'a case-insensitive duplicate username was accepted');
insert into public.explore_profiles(user_id, username) values ('00000000-0000-4000-8000-000000000008', '');
delete from public.explore_profiles where user_id = '00000000-0000-4000-8000-000000000008';

-- 1. Verified is admin-only.
select as_user('00000000-0000-4000-8000-000000000004');
select expect_error($$update public.explore_profiles set verified = true where user_id = '00000000-0000-4000-8000-000000000004'$$, 'a member verified their own profile');
update public.explore_profiles set display_name = 'Stranger' where user_id = '00000000-0000-4000-8000-000000000004';
select as_user('00000000-0000-4000-8000-000000000008');
select expect_error($$insert into public.explore_profiles(user_id, username, verified) values ('00000000-0000-4000-8000-000000000008', 'newbie', true)$$, 'a new profile was created verified');
select as_user('');
-- A KunThai admin (through admin tools) and the service role can verify.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000009', false);
update public.explore_profiles set verified = true where user_id = '00000000-0000-4000-8000-000000000004';
select as_user('');
update public.explore_profiles set verified = true where user_id = '00000000-0000-4000-8000-000000000005';
select test_assert((select count(*) = 2 from public.explore_profiles where verified), 'admins and the service role can verify');

-- 3/4. Space owner ...01, administrator ...02, editor ...03, invitee ...05.
select as_user('00000000-0000-4000-8000-000000000001');
insert into public.explore_spaces(id, owner_user_id, slug) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'acme');
insert into public.explore_space_members(space_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'administrator'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'editor');
insert into public.explore_space_members(space_id, user_id, role, status) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'moderator', 'pending');
select test_assert((select role = 'owner' from public.explore_space_members where user_id = '00000000-0000-4000-8000-000000000001'), 'creating a Space still adds its owner');

select as_user('00000000-0000-4000-8000-000000000002');
select expect_error($$update public.explore_space_members set status = 'removed' where user_id = '00000000-0000-4000-8000-000000000001'$$, 'an administrator removed the owner');
select expect_error($$update public.explore_space_members set role = 'administrator' where user_id = '00000000-0000-4000-8000-000000000001'$$, 'an administrator demoted the owner');
select expect_error($$delete from public.explore_space_members where user_id = '00000000-0000-4000-8000-000000000001'$$, 'an administrator deleted the owner row');
select expect_error($$update public.explore_space_members set role = 'owner' where user_id = '00000000-0000-4000-8000-000000000003'$$, 'an administrator promoted someone to owner');
select expect_error($$update public.explore_space_members set role = 'owner' where user_id = '00000000-0000-4000-8000-000000000002'$$, 'an administrator promoted themselves to owner');
select expect_error($$insert into public.explore_space_members(space_id, user_id, role) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'owner')$$, 'an administrator invited a new owner');
select expect_error($$update public.explore_spaces set verified = true where id = '10000000-0000-4000-8000-000000000001'$$, 'an administrator verified the Space');
select expect_error($$update public.explore_spaces set owner_user_id = '00000000-0000-4000-8000-000000000002' where id = '10000000-0000-4000-8000-000000000001'$$, 'an administrator took over the Space');
-- Ordinary team management still works.
select test_assert(changed_rows($$update public.explore_space_members set status = 'removed' where user_id = '00000000-0000-4000-8000-000000000003'$$) = 1, 'an administrator removes an editor');
select test_assert(changed_rows($$update public.explore_space_members set status = 'active' where user_id = '00000000-0000-4000-8000-000000000003'$$) = 1, 'an administrator restores an editor');
select test_assert(changed_rows($$update public.explore_spaces set name = 'Acme Ltd' where id = '10000000-0000-4000-8000-000000000001'$$) = 1, 'an administrator edits the Space');

-- An editor's update changes nothing (RLS): the app must report it, not succeed.
select as_user('00000000-0000-4000-8000-000000000003');
select test_assert(changed_rows($$update public.explore_space_members set status = 'removed' where user_id = '00000000-0000-4000-8000-000000000002'$$) = 0, 'an editor cannot remove team members');

-- An invitee accepting cannot make themselves owner.
select as_user('00000000-0000-4000-8000-000000000005');
select expect_error($$update public.explore_space_members set status = 'active', role = 'owner' where user_id = '00000000-0000-4000-8000-000000000005'$$, 'an invitee accepted as owner');
select test_assert(changed_rows($$update public.explore_space_members set status = 'active' where user_id = '00000000-0000-4000-8000-000000000005'$$) = 1, 'an invitee accepts');

-- The owner transfers ownership.
select as_user('00000000-0000-4000-8000-000000000001');
update public.explore_space_members set role = 'owner' where user_id = '00000000-0000-4000-8000-000000000002';
update public.explore_spaces set owner_user_id = '00000000-0000-4000-8000-000000000002' where id = '10000000-0000-4000-8000-000000000001';
update public.explore_space_members set role = 'administrator' where user_id = '00000000-0000-4000-8000-000000000001';
select as_user('');
select test_assert((select owner_user_id = '00000000-0000-4000-8000-000000000002' from public.explore_spaces), 'the owner can transfer ownership');
-- Restricted is KunThai's call.
update public.explore_spaces set status = 'restricted';
select as_user('00000000-0000-4000-8000-000000000002');
select expect_error($$update public.explore_spaces set status = 'active'$$, 'the owner lifted a restriction');
select as_user('');
update public.explore_spaces set status = 'active';

-- 5. Space posts: ...02 now owns the Space, ...01 is an administrator, ...03 an editor.
insert into public.explore_posts(id, user_id, actor_type, actor_id, space_id) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'space', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'space', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'profile', '00000000-0000-4000-8000-000000000003', null);
select as_user('00000000-0000-4000-8000-000000000004');
select test_assert(changed_rows($$update public.explore_posts set body = 'x' where id = '20000000-0000-4000-8000-000000000001'$$) = 0, 'a stranger cannot edit a Space post');
select test_assert(changed_rows($$delete from public.explore_posts where id = '20000000-0000-4000-8000-000000000001'$$) = 0, 'a stranger cannot delete a Space post');
select as_user('00000000-0000-4000-8000-000000000001');
select test_assert(changed_rows($$update public.explore_posts set body = 'edited' where id = '20000000-0000-4000-8000-000000000001'$$) = 1, 'a Space administrator edits a Space post');
select expect_error($$update public.explore_posts set user_id = '00000000-0000-4000-8000-000000000001' where id = '20000000-0000-4000-8000-000000000001'$$, 'a manager took authorship of a post');
select test_assert(changed_rows($$update public.explore_posts set body = 'x' where id = '20000000-0000-4000-8000-000000000003'$$) = 0, 'a Space manager cannot edit the author''s personal post');
select test_assert(changed_rows($$delete from public.explore_posts where id = '20000000-0000-4000-8000-000000000002'$$) = 1, 'a Space administrator deletes a Space post');
select as_user('00000000-0000-4000-8000-000000000003');
select test_assert(changed_rows($$update public.explore_posts set body = 'mine' where id = '20000000-0000-4000-8000-000000000003'$$) = 1, 'authors still edit their own posts');
select as_user('');

-- Deleting the Space (cascade) is not blocked by the owner guard.
select as_user('00000000-0000-4000-8000-000000000002');
delete from public.explore_spaces where id = '10000000-0000-4000-8000-000000000001';
select as_user('');
select test_assert((select count(*) = 0 from public.explore_space_members), 'deleting a Space removes its team');
select test_assert((select space_id is null from public.explore_posts where id = '20000000-0000-4000-8000-000000000001'), 'Space posts are detached when the Space is deleted');

select 'explore_profile_fixes: all tests passed' as result;
