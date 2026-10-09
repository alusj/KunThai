-- Run ONLY against the disposable kai_usage_test database:
-- psql -h /tmp -p 55432 -U pgtest -d kai_usage_test -v ON_ERROR_STOP=1 -f supabase/tests/kai_usage_controls.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'kai_usage_test' then raise exception 'This fixture requires the disposable kai_usage_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
grant usage on schema public to authenticated, anon, service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
create table auth.users(id uuid primary key);

-- The foundation as production has it, then the change under test (twice: it must be re-runnable).
\ir ../migrations/20260916120000_kunthai_ai_foundation.sql
\ir ../migrations/20261010110000_kai_usage_controls.sql
\ir ../migrations/20261010110000_kai_usage_controls.sql

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;

insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');

-- Member 1: two real calls now, one an hour and a half ago, one two days ago,
-- and three answers served from the response cache.
insert into public.ai_usage_events (user_id, task, model, cost_micros, input_tokens, cached_tokens, cached, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'text.improve', 'gemini-3.5-flash-lite', 100, 1000, 800, false, now()),
  ('00000000-0000-4000-8000-000000000001', 'assistant.chat', 'gemini-3.5-flash-lite', 250, 3000, 0, false, now() - interval '10 seconds'),
  ('00000000-0000-4000-8000-000000000001', 'text.improve', 'gemini-3.5-flash-lite', 40, 400, 0, false, now() - interval '90 minutes'),
  ('00000000-0000-4000-8000-000000000001', 'text.improve', 'gemini-3.5-flash-lite', 999, 400, 0, false, now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000001', 'text.improve', '', 0, 0, 0, true, now()),
  ('00000000-0000-4000-8000-000000000001', 'text.improve', '', 0, 0, 0, true, now()),
  ('00000000-0000-4000-8000-000000000001', 'text.improve', '', 0, 0, 0, true, now());
-- Member 2: one call today.
insert into public.ai_usage_events (user_id, task, model, cost_micros, created_at) values
  ('00000000-0000-4000-8000-000000000002', 'explore.hashtags', 'gemini-3.5-flash-lite', 1000, now() - interval '3 hours');

select test_assert((select cached_tokens = 0 from public.ai_usage_events where user_id = '00000000-0000-4000-8000-000000000002'), 'cached_tokens defaults to 0');
select test_assert((select minute_count = 2 and hour_count = 2 and day_count = 3 and day_cost_micros = 390
  from public.kunthai_ai_usage_snapshot('00000000-0000-4000-8000-000000000001')), 'member windows count real calls only, not cached answers or old rows');
select test_assert((select day_count = 4 and day_cost_micros = 1390 from public.kunthai_ai_global_usage_snapshot()), 'global snapshot sums everyone''s last 24 hours');

do $$ begin
  insert into public.ai_usage_events (user_id, task, cached_tokens) values ('00000000-0000-4000-8000-000000000002', 'x', -1);
  raise exception 'TEST FAILED: negative cached_tokens accepted';
exception when check_violation then null; end $$;

-- Only the service role may read the snapshots.
select test_assert(not has_function_privilege('authenticated', 'public.kunthai_ai_global_usage_snapshot()', 'execute'), 'members cannot read global spend');
select test_assert(not has_function_privilege('anon', 'public.kunthai_ai_global_usage_snapshot()', 'execute'), 'guests cannot read global spend');
select test_assert(has_function_privilege('service_role', 'public.kunthai_ai_global_usage_snapshot()', 'execute'), 'the server can read global spend');
select test_assert(not has_function_privilege('authenticated', 'public.kunthai_ai_usage_snapshot(uuid)', 'execute'), 'members cannot probe usage');

select 'kai_usage_controls: all assertions passed' as result;
