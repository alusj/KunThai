-- Run ONLY against an isolated, disposable auth_user_fk_delete_actions_test database:
-- createdb -h <host> -p <port> auth_user_fk_delete_actions_test
-- psql -h <host> -p <port> -d auth_user_fk_delete_actions_test -v ON_ERROR_STOP=1 \
--   -f supabase/tests/auth_user_fk_delete_actions.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'auth_user_fk_delete_actions_test' then raise exception 'This fixture requires the disposable auth_user_fk_delete_actions_test database.'; end if; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create table public.explore_profiles(user_id uuid primary key references auth.users on delete cascade, display_name text);
create table public.admin_case_notes(id uuid primary key, author_user_id uuid not null references auth.users(id) on delete restrict, body text);
create table public.admin_approvals(id uuid primary key, requested_by uuid not null references auth.users(id) on delete restrict, reviewed_by uuid references auth.users(id));
create table public.seller_things(id uuid primary key, seller_id uuid not null references auth.users(id), title text);
create table public.already_ok(id uuid primary key, user_id uuid references auth.users(id) on delete cascade);
create function public.admin_display_name(p_user_id uuid) returns text language sql stable as $$ select 'old'::text $$;
create function public.directory_notes() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('author', public.admin_display_name(note.author_user_id), 'body', note.body)), '[]') from public.admin_case_notes note
$$;

insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@x.com', '{"display_name":"Ada"}'), ('bbbbbbbb-0000-0000-0000-000000000002', 'seller@x.com', '{}');
insert into public.admin_case_notes values ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Checked');
insert into public.admin_approvals values ('21111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
insert into public.seller_things values ('31111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Shoes');

\i supabase/migrations/20261016160000_auth_user_fk_delete_actions.sql
\i supabase/migrations/20261016160000_auth_user_fk_delete_actions.sql

do $$ begin
  if (select directory_notes() -> 0 ->> 'author') <> 'Ada' then raise exception 'live author should show name'; end if;
end $$;

-- Both users can now be deleted.
delete from auth.users;

do $$ begin
  if (select author_user_id from public.admin_case_notes) is not null then raise exception 'note kept, author cleared'; end if;
  if (select requested_by from public.admin_approvals) is not null or (select reviewed_by from public.admin_approvals) is not null then raise exception 'approval kept, actors cleared'; end if;
  if exists (select 1 from public.seller_things) then raise exception 'owned rows go with the owner'; end if;
  if (select directory_notes() -> 0 ->> 'author') <> 'Deleted user' then raise exception 'deleted author should read Deleted user'; end if;
  if public.admin_display_name(null) is not null then raise exception 'null stays null'; end if;
  if public.admin_display_name('cccccccc-0000-0000-0000-000000000003') <> 'Deleted user' then raise exception 'unknown id reads Deleted user'; end if;
  if (select confdeltype from pg_constraint where conrelid = 'public.already_ok'::regclass and contype = 'f') <> 'c' then raise exception 'cascade untouched'; end if;
end $$;

select 'auth_user_fk_delete_actions: all assertions passed' as result;
