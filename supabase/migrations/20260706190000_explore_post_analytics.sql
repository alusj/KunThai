-- Owner-facing analytics for a single post or Swip video, aggregated from
-- explore_content_signals. Only the post owner can read their numbers.
create or replace function public.get_explore_post_analytics(p_post_id uuid)
returns table(
  impressions bigint,
  reach bigint,
  views bigint,
  watch_time_seconds numeric,
  average_completion numeric,
  completions bigint,
  rewatches bigint,
  shares bigint,
  skips bigint,
  likes integer,
  comments integer,
  saves integer,
  posted_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    coalesce(sum(signal.impressions), 0),
    count(distinct signal.user_id) filter (where signal.impressions > 0 or signal.views > 0),
    coalesce(sum(signal.views), 0),
    coalesce(sum(signal.watch_time_seconds), 0),
    coalesce(avg(nullif(signal.max_completion_rate, 0)), 0),
    coalesce(sum(signal.completions), 0),
    coalesce(sum(signal.rewatches), 0),
    coalesce(sum(signal.shares), 0),
    coalesce(sum(signal.skips), 0),
    post.likes_count,
    post.comments_count,
    post.saves_count,
    post.created_at
  from public.explore_posts post
  left join public.explore_content_signals signal on signal.post_id = post.id
  where post.id = p_post_id
    and post.user_id = auth.uid()
  group by post.likes_count, post.comments_count, post.saves_count, post.created_at;
$$;

revoke all on function public.get_explore_post_analytics(uuid) from public, anon;
grant execute on function public.get_explore_post_analytics(uuid) to authenticated;
