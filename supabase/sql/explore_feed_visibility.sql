alter table public.explore_posts
add column if not exists post_privacy text not null default 'public';

alter table public.explore_posts
alter column post_privacy set default 'public';

update public.explore_posts
set post_privacy = 'public'
where post_privacy is null or post_privacy not in ('public', 'circle', 'followers', 'private');

create index if not exists explore_posts_feed_scope_created_at_idx
on public.explore_posts (feed_scope, created_at desc);

create index if not exists explore_posts_user_privacy_idx
on public.explore_posts (user_id, post_privacy);

create index if not exists explore_follows_follower_following_idx
on public.explore_follows (follower_id, following_id);

alter table public.explore_posts enable row level security;

drop policy if exists "Explore posts are visible by privacy" on public.explore_posts;
create policy "Explore posts are visible by privacy"
on public.explore_posts
for select
using (
  coalesce(post_privacy, 'public') = 'public'
  or user_id = auth.uid()
  or (
    coalesce(post_privacy, 'public') in ('circle', 'followers')
    and exists (
      select 1
      from public.explore_follows f
      where f.follower_id = auth.uid()
        and f.following_id = explore_posts.user_id
    )
  )
);

drop policy if exists "Users can create their own Explore posts" on public.explore_posts;
create policy "Users can create their own Explore posts"
on public.explore_posts
for insert
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and coalesce(post_privacy, 'public') in ('public', 'circle', 'followers', 'private')
);

drop policy if exists "Users can update their own Explore posts" on public.explore_posts;
create policy "Users can update their own Explore posts"
on public.explore_posts
for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and coalesce(post_privacy, 'public') in ('public', 'circle', 'followers', 'private')
);

drop policy if exists "Users can delete their own Explore posts" on public.explore_posts;
create policy "Users can delete their own Explore posts"
on public.explore_posts
for delete
using (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'explore_posts'
    )
  then
    alter publication supabase_realtime add table public.explore_posts;
  end if;
end $$;

comment on column public.explore_posts.post_privacy is
'Explore post visibility: public is visible to everyone, circle/followers is visible to followers plus owner, private is visible only to owner.';
