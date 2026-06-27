drop policy if exists "Explore posts are readable" on public.explore_posts;
drop policy if exists "Explore posts are visible by privacy" on public.explore_posts;
drop policy if exists "authenticated_users_can_read_posts" on public.explore_posts;

create policy "authenticated_users_can_read_posts"
on public.explore_posts
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    (
      nullif(btrim(coalesce(video_url, '')), '') is null
      or moderation_status in ('approved', 'legacy')
    )
    and (
      coalesce(post_privacy, 'public') = 'public'
      or (
        coalesce(post_privacy, 'public') in ('circle', 'followers')
        and exists (
          select 1
          from public.explore_follows
          where follower_id = auth.uid()
            and following_id = explore_posts.user_id
        )
      )
    )
  )
);
