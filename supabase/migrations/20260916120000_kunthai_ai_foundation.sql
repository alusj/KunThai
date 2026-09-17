-- KAI foundation (Phase 1)
--
-- Three pieces of server-owned state for the Gemini integration:
--   * ai_usage_events   — one row per AI call: what ran, how many tokens, what
--                          it cost, whether it failed. Drives both rate limits
--                          and future cost monitoring.
--   * ai_response_cache — shared cache for identical, non-personal results
--                          (translations, tone rewrites) so warm and cold
--                          serverless instances both avoid paying twice.
--   * ai_feedback       — thumbs up/down against a logged call.
--
-- Nothing here stores a prompt or a model answer for a personal request. The
-- cache holds only results for inputs that are already content-addressed by a
-- hash of the text the user chose to send.
--
-- All writes go through the service role in `server/ai/`. RLS lets a signed-in
-- person read their own usage and write their own feedback, nothing else.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Usage log
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  surface text not null default 'global',
  task text not null,
  model text not null default '',
  status text not null default 'ok',
  error_code text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  -- Estimated spend in micro-USD. Integer so millions of rows still sum
  -- exactly; it is KunThai's own estimate, not a billing figure.
  cost_micros integer not null default 0,
  duration_ms integer not null default 0,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.ai_usage_events is
  'One row per KAI (Gemini) call. Holds no prompt text and no model output.';

-- The rate-limit snapshot below is the hot query: newest rows for one user.
create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);
create index if not exists ai_usage_events_created_idx
  on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_task_created_idx
  on public.ai_usage_events (task, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists "ai usage readable by owner" on public.ai_usage_events;
create policy "ai usage readable by owner"
  on public.ai_usage_events
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy: only the service role (which bypasses RLS)
-- may write usage rows, so a client can never forge or erase its own usage.

-- ---------------------------------------------------------------------------
-- Response cache
-- ---------------------------------------------------------------------------
create table if not exists public.ai_response_cache (
  cache_key text primary key,
  task text not null default '',
  model text not null default '',
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.ai_response_cache is
  'Shared cache of KAI results for identical non-personal inputs, keyed by a SHA-256 of task + surface + input.';

create index if not exists ai_response_cache_expires_idx
  on public.ai_response_cache (expires_at);

alter table public.ai_response_cache enable row level security;
-- Service role only. No policy is defined, so RLS denies every client.

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null references public.ai_usage_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  reason text,
  created_at timestamptz not null default now(),
  unique (usage_id, user_id)
);

comment on table public.ai_feedback is
  'Thumbs up/down a KunThai member left on one AI result.';

create index if not exists ai_feedback_user_created_idx
  on public.ai_feedback (user_id, created_at desc);

alter table public.ai_feedback enable row level security;

drop policy if exists "ai feedback readable by owner" on public.ai_feedback;
create policy "ai feedback readable by owner"
  on public.ai_feedback
  for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Rate-limit snapshot
-- ---------------------------------------------------------------------------
-- One round trip returns every window the limiter needs. Called by the service
-- role from `server/ai/aiUsage.js`; execute is granted to service_role only so
-- a signed-in client cannot probe another member's usage.
create or replace function public.kunthai_ai_usage_snapshot(p_user uuid)
returns table (
  minute_count integer,
  hour_count integer,
  day_count integer,
  day_cost_micros bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(count(*) filter (where created_at >= now() - interval '1 minute'), 0)::integer,
    coalesce(count(*) filter (where created_at >= now() - interval '1 hour'), 0)::integer,
    coalesce(count(*) filter (where created_at >= now() - interval '1 day'), 0)::integer,
    coalesce(sum(cost_micros) filter (where created_at >= now() - interval '1 day'), 0)::bigint
  from public.ai_usage_events
  where user_id = p_user
    and created_at >= now() - interval '1 day';
$$;

revoke all on function public.kunthai_ai_usage_snapshot(uuid) from public;
revoke all on function public.kunthai_ai_usage_snapshot(uuid) from anon;
revoke all on function public.kunthai_ai_usage_snapshot(uuid) from authenticated;
grant execute on function public.kunthai_ai_usage_snapshot(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Cache cleanup
-- ---------------------------------------------------------------------------
create or replace function public.kunthai_ai_cache_cleanup()
returns integer
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.ai_response_cache where expires_at < now() returning 1
  )
  select coalesce(count(*), 0)::integer from removed;
$$;

revoke all on function public.kunthai_ai_cache_cleanup() from public;
revoke all on function public.kunthai_ai_cache_cleanup() from anon;
revoke all on function public.kunthai_ai_cache_cleanup() from authenticated;
grant execute on function public.kunthai_ai_cache_cleanup() to service_role;
