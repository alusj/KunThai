-- Explore backend hardening
-- Run this after explore_schema.sql.

alter table public.explore_posts add column if not exists updated_at timestamptz not null default timezone('utc', now());
alter table public.explore_notifications add column if not exists actor_user_id uuid references auth.users(id) on delete set null;
alter table public.explore_conversations add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.set_explore_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists explore_posts_set_updated_at on public.explore_posts;
create trigger explore_posts_set_updated_at
before update on public.explore_posts
for each row execute function public.set_explore_updated_at();

drop trigger if exists explore_profiles_set_updated_at on public.explore_profiles;
create trigger explore_profiles_set_updated_at
before update on public.explore_profiles
for each row execute function public.set_explore_updated_at();

drop trigger if exists explore_conversations_set_updated_at on public.explore_conversations;
create trigger explore_conversations_set_updated_at
before update on public.explore_conversations
for each row execute function public.set_explore_updated_at();

create index if not exists explore_posts_scope_created_idx on public.explore_posts (feed_scope, created_at desc);
create index if not exists explore_posts_user_created_idx on public.explore_posts (user_id, created_at desc);
create index if not exists explore_posts_privacy_idx on public.explore_posts (post_privacy);
create index if not exists explore_profiles_username_idx on public.explore_profiles (lower(username));
create index if not exists explore_notifications_user_created_idx on public.explore_notifications (user_id, created_at desc);
create index if not exists explore_comments_post_created_idx on public.explore_post_comments (post_id, created_at);
create index if not exists explore_comments_parent_idx on public.explore_post_comments (parent_comment_id);
create index if not exists explore_follows_follower_idx on public.explore_follows (follower_id);
create index if not exists explore_follows_following_idx on public.explore_follows (following_id);
create index if not exists explore_saves_user_idx on public.explore_post_saves (user_id);
create index if not exists explore_likes_user_idx on public.explore_post_likes (user_id);
create index if not exists explore_messages_conversation_created_idx on public.explore_messages (conversation_id, created_at);
create index if not exists explore_user_blocks_blocker_idx on public.explore_user_blocks (blocker_id);
create index if not exists explore_user_blocks_blocked_idx on public.explore_user_blocks (blocked_id);
create index if not exists explore_profile_reports_reported_idx on public.explore_profile_reports (reported_user_id);

drop policy if exists "authenticated_users_can_read_posts" on public.explore_posts;
drop policy if exists "authenticated_users_can_read_visible_posts" on public.explore_posts;
create policy "authenticated_users_can_read_visible_posts"
on public.explore_posts
for select
to authenticated
using (
  post_privacy = 'public'
  or auth.uid() = user_id
  or (
    post_privacy = 'circle'
    and exists (
      select 1
      from public.explore_follows
      where follower_id = auth.uid()
      and following_id = explore_posts.user_id
    )
  )
);

drop policy if exists "authenticated_users_read_comments" on public.explore_post_comments;
drop policy if exists "authenticated_users_read_visible_post_comments" on public.explore_post_comments;
create policy "authenticated_users_read_visible_post_comments"
on public.explore_post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.explore_posts
    where id = explore_post_comments.post_id
  )
);

drop policy if exists "authenticated_users_create_notifications" on public.explore_notifications;
drop policy if exists "authenticated_users_create_notifications_as_actor" on public.explore_notifications;
create policy "authenticated_users_create_notifications_as_actor"
on public.explore_notifications
for insert
to authenticated
with check (
  auth.uid() is not null
  and (actor_user_id is null or actor_user_id = auth.uid())
  and (user_id is null or user_id <> auth.uid())
);

drop policy if exists "users_manage_saved_collection_items" on public.explore_saved_collection_items;
drop policy if exists "users_manage_own_saved_collection_items" on public.explore_saved_collection_items;
create policy "users_manage_own_saved_collection_items"
on public.explore_saved_collection_items
for all
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.explore_saved_collections
    where id = explore_saved_collection_items.collection_id
    and user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.explore_saved_collections
    where id = explore_saved_collection_items.collection_id
    and user_id = auth.uid()
  )
);

drop policy if exists "authenticated_users_create_conversation_members" on public.explore_conversation_members;
drop policy if exists "members_or_creator_create_conversation_members" on public.explore_conversation_members;
create policy "members_or_creator_create_conversation_members"
on public.explore_conversation_members
for insert
to authenticated
with check (
  auth.uid() = user_id
  or exists (
    select 1
    from public.explore_conversations
    where id = conversation_id
    and created_by = auth.uid()
  )
);

create or replace function public.add_table_to_supabase_realtime(table_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = table_name
  ) then
    execute format('alter publication supabase_realtime add table public.%I', table_name);
  end if;
end;
$$;

select public.add_table_to_supabase_realtime('explore_posts');
select public.add_table_to_supabase_realtime('explore_post_comments');
select public.add_table_to_supabase_realtime('explore_post_likes');
select public.add_table_to_supabase_realtime('explore_post_saves');
select public.add_table_to_supabase_realtime('explore_comment_likes');
select public.add_table_to_supabase_realtime('explore_notifications');
select public.add_table_to_supabase_realtime('explore_follows');
select public.add_table_to_supabase_realtime('explore_profiles');
select public.add_table_to_supabase_realtime('explore_messages');
select public.add_table_to_supabase_realtime('explore_conversations');

alter table public.explore_posts replica identity full;
alter table public.explore_post_comments replica identity full;
alter table public.explore_notifications replica identity full;
alter table public.explore_messages replica identity full;
