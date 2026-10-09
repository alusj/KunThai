-- KAI usage controls (2026-10-10)
--
--   * ai_usage_events.cached_tokens — how many input tokens Gemini served from
--     its context cache (billed at a discount). Still no prompt or output text.
--   * Answers served from the response cache are logged with cached = true and
--     cost 0; they no longer count toward a member's rate limits.
--   * kunthai_ai_global_usage_snapshot() — everyone's calls and estimated
--     spend over the last 24 hours, for the global daily cost ceiling
--     (AI_GLOBAL_DAILY_COST_MICROS). Service role only.
--
-- Safe to run more than once. The server keeps working before this lands: it
-- writes usage rows without cached_tokens and falls back to per-instance
-- spend for the global ceiling.

alter table public.ai_usage_events
  add column if not exists cached_tokens integer not null default 0;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_cached_tokens_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_cached_tokens_check check (cached_tokens >= 0);

comment on column public.ai_usage_events.cached_tokens is
  'Input tokens Gemini served from its context cache (part of input_tokens).';

-- Per-member windows: only real model calls count.
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
    and created_at >= now() - interval '1 day'
    and not cached;
$$;

revoke all on function public.kunthai_ai_usage_snapshot(uuid) from public;
revoke all on function public.kunthai_ai_usage_snapshot(uuid) from anon;
revoke all on function public.kunthai_ai_usage_snapshot(uuid) from authenticated;
grant execute on function public.kunthai_ai_usage_snapshot(uuid) to service_role;

-- Everyone together, last 24 hours. Served by ai_usage_events_created_idx.
create or replace function public.kunthai_ai_global_usage_snapshot()
returns table (
  day_count integer,
  day_cost_micros bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(cost_micros), 0)::bigint
  from public.ai_usage_events
  where created_at >= now() - interval '1 day'
    and not cached;
$$;

revoke all on function public.kunthai_ai_global_usage_snapshot() from public;
revoke all on function public.kunthai_ai_global_usage_snapshot() from anon;
revoke all on function public.kunthai_ai_global_usage_snapshot() from authenticated;
grant execute on function public.kunthai_ai_global_usage_snapshot() to service_role;
