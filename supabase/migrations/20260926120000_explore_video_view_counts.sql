-- Public view totals for Swip video tiles (the TikTok-style grid on a
-- profile). Returns one total per video and nothing else — no per-viewer
-- rows, watch time or reach, which stay owner-only in
-- get_explore_post_analytics. Capped at 60 ids per call (one profile grid).
create or replace function public.get_explore_video_view_counts(p_post_ids uuid[])
returns table(post_id uuid, views bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    post.id,
    coalesce(sum(signal.views), 0)::bigint
  from public.explore_posts post
  left join public.explore_content_signals signal on signal.post_id = post.id
  where post.id = any((coalesce(p_post_ids, '{}'::uuid[]))[1:60])
    and post.video_url is not null
  group by post.id;
$$;

revoke all on function public.get_explore_video_view_counts(uuid[]) from public, anon;
grant execute on function public.get_explore_video_view_counts(uuid[]) to authenticated;
