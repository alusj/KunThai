create table if not exists public.explore_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  author_username text not null,
  author_avatar_url text,
  feed_scope text not null default 'feed' check (feed_scope in ('feed', 'connections', 'swip')),
  body text not null default '',
  image_url text,
  audio_url text,
  video_url text,
  audio_duration_seconds integer,
  post_privacy text not null default 'public' check (post_privacy in ('public', 'circle', 'private')),
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  saves_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.explore_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  username text,
  contact_email text,
  address text,
  avatar_url text,
  cover_url text,
  bio text,
  social_links jsonb not null default '[]'::jsonb,
  account_type text not null default 'personal',
  verified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.explore_profiles add column if not exists username text;
alter table public.explore_profiles add column if not exists contact_email text;
alter table public.explore_profiles add column if not exists address text;
alter table public.explore_profiles add column if not exists avatar_url text;
alter table public.explore_profiles add column if not exists cover_url text;
alter table public.explore_profiles add column if not exists bio text;
alter table public.explore_profiles add column if not exists social_links jsonb not null default '[]'::jsonb;
alter table public.explore_profiles add column if not exists account_type text not null default 'personal';
alter table public.explore_profiles add column if not exists verified boolean not null default false;
alter table public.explore_profiles add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.explore_posts add column if not exists feed_scope text not null default 'feed';
alter table public.explore_posts add column if not exists image_url text;
alter table public.explore_posts add column if not exists audio_url text;
alter table public.explore_posts add column if not exists video_url text;
alter table public.explore_posts add column if not exists audio_duration_seconds integer;
alter table public.explore_posts add column if not exists post_privacy text not null default 'public';
alter table public.explore_posts add column if not exists hashtags text[] not null default '{}';
alter table public.explore_posts add column if not exists mentions text[] not null default '{}';
alter table public.explore_posts drop constraint if exists explore_posts_feed_scope_check;
alter table public.explore_posts add constraint explore_posts_feed_scope_check check (feed_scope in ('feed', 'connections', 'swip'));
alter table public.explore_posts drop constraint if exists explore_posts_post_privacy_check;
alter table public.explore_posts add constraint explore_posts_post_privacy_check check (post_privacy in ('public', 'circle', 'private'));

create table if not exists public.explore_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  actor_name text not null,
  actor_avatar_url text,
  type text not null,
  media_type text not null default 'post',
  message text,
  read boolean not null default false,
  post_id uuid references public.explore_posts(id) on delete cascade,
  post_preview text,
  time_label text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.explore_notifications add column if not exists post_id uuid references public.explore_posts(id) on delete cascade;
alter table public.explore_notifications add column if not exists post_preview text;
alter table public.explore_notifications add column if not exists actor_avatar_url text;
alter table public.explore_notifications add column if not exists media_type text not null default 'post';
alter table public.explore_notifications add column if not exists message text;

create table if not exists public.explore_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  username text not null,
  status text,
  kind text not null check (kind in ('mycircle', 'discover')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.explore_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.explore_posts(id) on delete cascade,
  parent_comment_id uuid references public.explore_post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  author_username text,
  author_avatar_url text,
  body text not null,
  audio_url text,
  audio_duration_seconds integer,
  mentions text[] not null default '{}',
  likes_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.explore_post_comments add column if not exists parent_comment_id uuid references public.explore_post_comments(id) on delete cascade;
alter table public.explore_post_comments add column if not exists author_name text;
alter table public.explore_post_comments add column if not exists author_username text;
alter table public.explore_post_comments add column if not exists author_avatar_url text;
alter table public.explore_post_comments add column if not exists audio_url text;
alter table public.explore_post_comments add column if not exists audio_duration_seconds integer;
alter table public.explore_post_comments add column if not exists mentions text[] not null default '{}';
alter table public.explore_post_comments add column if not exists likes_count integer not null default 0;
alter table public.explore_post_comments alter column body set default '';

create table if not exists public.explore_comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.explore_post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (comment_id, user_id)
);

create table if not exists public.explore_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.explore_post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (comment_id, user_id)
);

create table if not exists public.explore_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.explore_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (post_id, user_id)
);

create table if not exists public.explore_post_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.explore_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (post_id, user_id)
);

create table if not exists public.explore_saved_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.explore_saved_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.explore_saved_collections(id) on delete cascade,
  post_id uuid not null references public.explore_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (collection_id, post_id)
);

create table if not exists public.explore_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  request boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.explore_conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.explore_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (conversation_id, user_id)
);

create table if not exists public.explore_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.explore_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  media_url text,
  media_type text not null default 'text' check (media_type in ('text', 'image', 'audio', 'video')),
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.explore_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.explore_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.explore_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (post_id, user_id)
);

create table if not exists public.explore_user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.explore_profile_reports (
  id uuid primary key default gen_random_uuid(),
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (reported_user_id, reporter_id)
);

insert into storage.buckets (id, name, public)
values ('explore-media', 'explore-media', true)
on conflict (id) do nothing;

alter table public.explore_posts enable row level security;
alter table public.explore_profiles enable row level security;
alter table public.explore_notifications enable row level security;
alter table public.explore_connections enable row level security;
alter table public.explore_post_comments enable row level security;
alter table public.explore_comment_likes enable row level security;
alter table public.explore_comment_reports enable row level security;
alter table public.explore_post_likes enable row level security;
alter table public.explore_post_saves enable row level security;
alter table public.explore_saved_collections enable row level security;
alter table public.explore_saved_collection_items enable row level security;
alter table public.explore_conversations enable row level security;
alter table public.explore_conversation_members enable row level security;
alter table public.explore_messages enable row level security;
alter table public.explore_follows enable row level security;
alter table public.explore_post_reports enable row level security;
alter table public.explore_user_blocks enable row level security;
alter table public.explore_profile_reports enable row level security;

drop policy if exists "authenticated_users_can_read_posts" on public.explore_posts;
create policy "authenticated_users_can_read_posts"
on public.explore_posts
for select
to authenticated
using (true);

drop policy if exists "authenticated_users_can_read_profiles" on public.explore_profiles;
create policy "authenticated_users_can_read_profiles"
on public.explore_profiles
for select
to authenticated
using (true);

drop policy if exists "owners_manage_own_profile" on public.explore_profiles;
create policy "owners_manage_own_profile"
on public.explore_profiles
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "authenticated_users_can_create_posts" on public.explore_posts;
create policy "authenticated_users_can_create_posts"
on public.explore_posts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "owners_can_update_posts" on public.explore_posts;
create policy "owners_can_update_posts"
on public.explore_posts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "owners_can_delete_posts" on public.explore_posts;
create policy "owners_can_delete_posts"
on public.explore_posts
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_read_own_notifications" on public.explore_notifications;
create policy "users_read_own_notifications"
on public.explore_notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_update_own_notifications" on public.explore_notifications;
create policy "users_update_own_notifications"
on public.explore_notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "authenticated_users_create_notifications" on public.explore_notifications;
create policy "authenticated_users_create_notifications"
on public.explore_notifications
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "authenticated_users_can_read_connections" on public.explore_connections;
create policy "authenticated_users_can_read_connections"
on public.explore_connections
for select
to authenticated
using (true);

drop policy if exists "owners_manage_connections" on public.explore_connections;
create policy "owners_manage_connections"
on public.explore_connections
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "authenticated_users_read_comments" on public.explore_post_comments;
create policy "authenticated_users_read_comments"
on public.explore_post_comments
for select
to authenticated
using (true);

drop policy if exists "authenticated_users_create_comments" on public.explore_post_comments;
create policy "authenticated_users_create_comments"
on public.explore_post_comments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "owners_delete_comments" on public.explore_post_comments;
create policy "owners_delete_comments"
on public.explore_post_comments
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "authenticated_users_manage_comment_likes" on public.explore_comment_likes;
create policy "authenticated_users_manage_comment_likes"
on public.explore_comment_likes
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "authenticated_users_create_comment_reports" on public.explore_comment_reports;
create policy "authenticated_users_create_comment_reports"
on public.explore_comment_reports
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users_read_own_comment_reports" on public.explore_comment_reports;
create policy "users_read_own_comment_reports"
on public.explore_comment_reports
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "authenticated_users_manage_likes" on public.explore_post_likes;
create policy "authenticated_users_manage_likes"
on public.explore_post_likes
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "authenticated_users_manage_saves" on public.explore_post_saves;
create policy "authenticated_users_manage_saves"
on public.explore_post_saves
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_saved_collections" on public.explore_saved_collections;
create policy "users_manage_saved_collections"
on public.explore_saved_collections
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_saved_collection_items" on public.explore_saved_collection_items;
create policy "users_manage_saved_collection_items"
on public.explore_saved_collection_items
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "members_read_conversations" on public.explore_conversations;
create policy "members_read_conversations"
on public.explore_conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.explore_conversation_members
    where conversation_id = id
    and user_id = auth.uid()
  )
);

drop policy if exists "authenticated_users_create_conversations" on public.explore_conversations;
create policy "authenticated_users_create_conversations"
on public.explore_conversations
for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "members_read_conversation_members" on public.explore_conversation_members;
create policy "members_read_conversation_members"
on public.explore_conversation_members
for select
to authenticated
using (
  exists (
    select 1
    from public.explore_conversation_members member_check
    where member_check.conversation_id = conversation_id
    and member_check.user_id = auth.uid()
  )
);

drop policy if exists "authenticated_users_create_conversation_members" on public.explore_conversation_members;
create policy "authenticated_users_create_conversation_members"
on public.explore_conversation_members
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "members_read_messages" on public.explore_messages;
create policy "members_read_messages"
on public.explore_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.explore_conversation_members
    where conversation_id = explore_messages.conversation_id
    and user_id = auth.uid()
  )
);

drop policy if exists "members_create_messages" on public.explore_messages;
create policy "members_create_messages"
on public.explore_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.explore_conversation_members
    where conversation_id = explore_messages.conversation_id
    and user_id = auth.uid()
  )
);

drop policy if exists "authenticated_users_read_follows" on public.explore_follows;
create policy "authenticated_users_read_follows"
on public.explore_follows
for select
to authenticated
using (true);

drop policy if exists "authenticated_users_manage_own_follows" on public.explore_follows;
create policy "authenticated_users_manage_own_follows"
on public.explore_follows
for all
to authenticated
using (auth.uid() = follower_id)
with check (auth.uid() = follower_id);

drop policy if exists "authenticated_users_create_reports" on public.explore_post_reports;
create policy "authenticated_users_create_reports"
on public.explore_post_reports
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users_read_own_reports" on public.explore_post_reports;
create policy "users_read_own_reports"
on public.explore_post_reports
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_update_own_reports" on public.explore_post_reports;
create policy "users_update_own_reports"
on public.explore_post_reports
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_blocks" on public.explore_user_blocks;
create policy "users_manage_own_blocks"
on public.explore_user_blocks
for all
to authenticated
using (auth.uid() = blocker_id)
with check (auth.uid() = blocker_id);

drop policy if exists "users_create_profile_reports" on public.explore_profile_reports;
create policy "users_create_profile_reports"
on public.explore_profile_reports
for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "users_read_own_profile_reports" on public.explore_profile_reports;
create policy "users_read_own_profile_reports"
on public.explore_profile_reports
for select
to authenticated
using (auth.uid() = reporter_id);

drop policy if exists "public_can_view_explore_media" on storage.objects;
create policy "public_can_view_explore_media"
on storage.objects
for select
to public
using (bucket_id = 'explore-media');

drop policy if exists "authenticated_users_upload_explore_media" on storage.objects;
create policy "authenticated_users_upload_explore_media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'explore-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "owners_update_explore_media" on storage.objects;
create policy "owners_update_explore_media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'explore-media'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'explore-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "owners_delete_explore_media" on storage.objects;
create policy "owners_delete_explore_media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'explore-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create or replace function public.refresh_explore_post_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := coalesce(new.post_id, old.post_id);

  update public.explore_posts
  set
    likes_count = (
      select count(*)::integer
      from public.explore_post_likes
      where post_id = target_post_id
    ),
    saves_count = (
      select count(*)::integer
      from public.explore_post_saves
      where post_id = target_post_id
    )
  where id = target_post_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.refresh_explore_post_comment_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := coalesce(new.post_id, old.post_id);

  update public.explore_posts
  set comments_count = (
    select count(*)::integer
    from public.explore_post_comments
    where post_id = target_post_id
  )
  where id = target_post_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.refresh_explore_comment_like_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_comment uuid;
begin
  target_comment := coalesce(new.comment_id, old.comment_id);

  update public.explore_post_comments
  set likes_count = (
    select count(*)::integer
    from public.explore_comment_likes
    where comment_id = target_comment
  )
  where id = target_comment;

  return coalesce(new, old);
end;
$$;

drop trigger if exists explore_post_likes_refresh_counts on public.explore_post_likes;
create trigger explore_post_likes_refresh_counts
after insert or delete on public.explore_post_likes
for each row execute function public.refresh_explore_post_reaction_counts();

drop trigger if exists explore_post_saves_refresh_counts on public.explore_post_saves;
create trigger explore_post_saves_refresh_counts
after insert or delete on public.explore_post_saves
for each row execute function public.refresh_explore_post_reaction_counts();

drop trigger if exists explore_post_comments_refresh_counts on public.explore_post_comments;
create trigger explore_post_comments_refresh_counts
after insert or delete on public.explore_post_comments
for each row execute function public.refresh_explore_post_comment_counts();

drop trigger if exists explore_comment_likes_refresh_counts on public.explore_comment_likes;
create trigger explore_comment_likes_refresh_counts
after insert or delete on public.explore_comment_likes
for each row execute function public.refresh_explore_comment_like_counts();
