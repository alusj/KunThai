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

comment on column public.explore_posts.moderation_status is
'approved marks completed review; pending remains quarantined; blocked is rejected for new Swip video writes; legacy keeps historical videos visible while new inserts are normalized to pending or approved.';
